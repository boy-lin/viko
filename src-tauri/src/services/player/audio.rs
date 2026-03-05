use std::marker::PhantomData;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant};

use bytemuck;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::{HeapRb, Producer};
use serde::Serialize;
use video_rs::ffmpeg::{
    self,
};

use crate::events::EventEmitter;
use crate::media_common;
use crate::services::player::video::PlayerCommand;

#[derive(Clone)]
struct SharedState {
    playing_flag: Arc<AtomicBool>,
    reset_buffer_flag: Arc<AtomicBool>,
    queued_samples: Arc<AtomicUsize>,
    volume: Arc<AtomicU32>,
    start_audio_pts: Arc<AtomicU64>,
    played_samples_total: Arc<AtomicU64>,
    output_channels: usize,
    output_sample_rate_inv: f64,
}

struct DecodeState {
    decoder: ffmpeg::decoder::Audio,
    resampler: ffmpeg::software::resampling::context::Context,
    producer: Producer<f32, Arc<HeapRb<f32>>>,
    decoded: ffmpeg::frame::Audio,
    resampled: ffmpeg::frame::Audio,
    samples_processed: u64,
}

#[derive(Clone, Copy)]
struct EmitSnapshot {
    position: f64,
    volume: f32,
    state: &'static str,
}

#[derive(Clone, Serialize)]
struct PlayerStatePayload {
    position: f64,
    duration: f64,
    state: &'static str,
    volume: f32,
}

pub struct AudioPlayer<E: EventEmitter> {
    command_tx: mpsc::Sender<PlayerCommand>,
    handle: Option<thread::JoinHandle<()>>,
    volume: Arc<AtomicU32>,
    duration: f64,
    current_position: Arc<AtomicU64>,
    _marker: PhantomData<E>,
}

impl<E: EventEmitter> AudioPlayer<E> {
    pub fn new(path: String, emit_state_events: bool, emitter: Option<E>) -> Result<Self, String> {
        let duration = Self::probe_duration(&path)?;
        let (command_tx, command_rx) = mpsc::channel();
        let volume = Arc::new(AtomicU32::new(f32::to_bits(1.0)));
        let current_position = Arc::new(AtomicU64::new(0.0f64.to_bits()));

        let handle = Some(Self::spawn(
            path,
            command_rx,
            volume.clone(),
            current_position.clone(),
            emit_state_events,
            emitter.clone(),
            duration,
        ));

        Ok(Self {
            command_tx,
            handle,
            volume,
            duration,
            current_position,
            _marker: PhantomData,
        })
    }

    pub fn command(&self, cmd: PlayerCommand) -> Result<(), String> {
        self.command_tx
            .send(cmd)
            .map_err(|e| format!("Operation failed: {e}"))
    }

    pub fn get_duration(&self) -> f64 {
        self.duration
    }

    pub fn get_current_position(&self) -> f64 {
        self.read_current_position()
    }

    pub fn get_audio_clock(&self) -> f64 {
        self.read_current_position()
    }

    pub fn get_volume(&self) -> f32 {
        f32::from_bits(self.volume.load(Ordering::Relaxed))
    }

    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 1.5);
        self.volume.store(clamped.to_bits(), Ordering::Relaxed);
    }

    fn read_current_position(&self) -> f64 {
        f64::from_bits(self.current_position.load(Ordering::Relaxed))
    }

    fn probe_duration(path: &str) -> Result<f64, String> {
        media_common::get_audio_duration(path)
    }

    fn spawn(
        path: String,
        command_rx: mpsc::Receiver<PlayerCommand>,
        volume: Arc<AtomicU32>,
        current_position: Arc<AtomicU64>,
        emit_state_events: bool,
        emitter: Option<E>,
        _duration_hint: f64,
    ) -> thread::JoinHandle<()> {
        const MAX_COMMANDS_PER_TICK: usize = 8;
        const MAX_PACKETS_PER_TICK: usize = 4;

        thread::spawn(move || {
            let (mut ictx, duration) = match Self::open_input(&path) {
                Ok(v) => v,
                Err(e) => {
                    log::error!("{e}");
                    return;
                }
            };
            let (audio_index, audio_stream, time_base) = match Self::find_audio_stream(&ictx) {
                Ok(v) => v,
                Err(e) => {
                    log::error!("{e}");
                    return;
                }
            };
            let decoder = match Self::create_decoder(&audio_stream) {
                Ok(d) => d,
                Err(e) => {
                    log::error!("{e}");
                    return;
                }
            };
            let (device, supported_config, config, output_sample_rate, output_channels) =
                match Self::audio_device() {
                    Ok(v) => v,
                    Err(e) => {
                        log::error!("{e}");
                        return;
                    }
                };
            let resampler =
                match Self::create_resampler(&decoder, output_channels, output_sample_rate) {
                    Ok(r) => r,
                    Err(e) => {
                        log::error!("{e}");
                        return;
                    }
                };

            let (state, producer, consumer) = Self::build_state(
                volume.clone(),
                output_sample_rate,
                output_channels,
            );

            let output_stream = match Self::build_output_stream(
                &device,
                &config,
                supported_config.sample_format(),
                &state,
                consumer,
            ) {
                Ok(stream) => stream,
                Err(e) => {
                    log::error!("{e}");
                    return;
                }
            };

            let mut packet_iter = None;
            let mut playing = false;
            let mut stream_started = false;
            let mut completed = false;
            let mut decode_state = DecodeState {
                decoder,
                resampler,
                producer,
                decoded: ffmpeg::frame::Audio::empty(),
                resampled: ffmpeg::frame::Audio::empty(),
                samples_processed: 0,
            };
            let mut last_position_update = Instant::now();
            let mut last_state_emit = Instant::now();
            let mut last_emit_snapshot: Option<EmitSnapshot> = None;

            loop {
                for _ in 0..MAX_COMMANDS_PER_TICK {
                    let Ok(cmd) = command_rx.try_recv() else {
                        break;
                    };
                    packet_iter = None;
                    if Self::handle_command(
                        cmd,
                        &mut ictx,
                        audio_index,
                        &output_stream,
                        &state,
                        &mut decode_state,
                        &current_position,
                        &mut playing,
                        &mut stream_started,
                        &mut completed,
                    ) {
                        return;
                    }
                }

                if !playing {
                    match command_rx.recv_timeout(Duration::from_millis(50)) {
                        Ok(cmd) => {
                            packet_iter = None;
                            if Self::handle_command(
                                cmd,
                                &mut ictx,
                                audio_index,
                                &output_stream,
                                &state,
                                &mut decode_state,
                                &current_position,
                                &mut playing,
                                &mut stream_started,
                                &mut completed,
                            ) {
                                return;
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Err(mpsc::RecvTimeoutError::Disconnected) => return,
                    }
                    Self::maybe_emit_state_update(
                        emit_state_events,
                        &mut last_state_emit,
                        &mut last_emit_snapshot,
                        Duration::from_millis(150),
                        &emitter,
                        &current_position,
                        &volume,
                        duration,
                        "paused",
                    );
                    continue;
                }

                if packet_iter.is_none() {
                    packet_iter = Some(ictx.packets());
                }

                if packet_iter.is_none() {
                    thread::yield_now();
                    continue;
                }

                let mut reached_end = false;
                for _ in 0..MAX_PACKETS_PER_TICK {
                    let next = {
                        let Some(iter) = packet_iter.as_mut() else {
                            break;
                        };
                        iter.next()
                    };
                    if next.is_none() {
                        reached_end = true;
                    }
                    Self::process_next_packet_or_eof(
                        next,
                        audio_index,
                        &mut decode_state,
                        &state,
                        output_channels,
                        time_base,
                        &mut completed,
                        &mut playing,
                        &mut stream_started,
                        &output_stream,
                        &mut packet_iter,
                    );
                    if reached_end || !playing {
                        break;
                    }
                }

                if last_position_update.elapsed() >= Duration::from_millis(33) {
                    let buffer_samples = Self::buffered_samples(&state);
                    let start_pts = f64::from_bits(state.start_audio_pts.load(Ordering::Relaxed));
                    let current_pos = Self::current_position(
                        decode_state.samples_processed,
                        buffer_samples,
                        state.output_sample_rate_inv,
                        start_pts,
                        duration,
                    );
                    current_position.store(current_pos.to_bits(), Ordering::Relaxed);
                    last_position_update = Instant::now();
                }

                Self::maybe_emit_state_update(
                    emit_state_events,
                    &mut last_state_emit,
                    &mut last_emit_snapshot,
                    Duration::from_millis(120),
                    &emitter,
                    &current_position,
                    &volume,
                    duration,
                    "playing",
                );
            }
        })
    }

    fn open_input(path: &str) -> Result<(ffmpeg::format::context::Input, f64), String> {
        media_common::ensure_ffmpeg_init()?;
        let ictx =
            ffmpeg::format::input(path).map_err(|e| format!("Failed to open audio file: {e}"))?;
        let duration = media_common::audio_decode::extract_audio_duration(&ictx);
        Ok((ictx, duration))
    }

    fn find_audio_stream(
        ictx: &ffmpeg::format::context::Input,
    ) -> Result<
        (
            usize,
            ffmpeg::format::stream::Stream<'_>,
            ffmpeg::util::rational::Rational,
        ),
        String,
    > {
        let index = ictx
            .streams()
            .best(ffmpeg::media::Type::Audio)
            .map(|s| s.index())
            .ok_or_else(|| "Audio stream not found".to_string())?;
        let stream = ictx.stream(index).unwrap();
        let time_base = stream.time_base();
        Ok((index, stream, time_base))
    }

    fn create_decoder(
        stream: &ffmpeg::format::stream::Stream,
    ) -> Result<ffmpeg::decoder::Audio, String> {
        ffmpeg::codec::context::Context::from_parameters(stream.parameters())
            .and_then(|ctx| ctx.decoder().audio())
            .map_err(|e| format!("Operation failed: {e}"))
    }

    fn audio_device() -> Result<
        (
            cpal::Device,
            cpal::SupportedStreamConfig,
            cpal::StreamConfig,
            u32,
            usize,
        ),
        String,
    > {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| "Default audio output device not found".to_string())?;
        let supported = device
            .default_output_config()
            .map_err(|e| format!("Failed to get output device config: {e}"))?;
        let config = supported.config();
        let sample_rate = config.sample_rate.0;
        let channels = config.channels as usize;
        Ok((device, supported, config, sample_rate, channels))
    }

    fn create_resampler(
        decoder: &ffmpeg::decoder::Audio,
        output_channels: usize,
        output_sample_rate: u32,
    ) -> Result<ffmpeg::software::resampling::context::Context, String> {
        let output_layout = ffmpeg::ChannelLayout::default(output_channels as i32);
        media_common::audio_decode::build_audio_resampler_from_decoder(
            decoder,
            ffmpeg::format::Sample::F32(ffmpeg::format::sample::Type::Packed),
            output_layout,
            output_sample_rate,
        )
    }

    fn build_state(
        volume: Arc<AtomicU32>,
        output_sample_rate: u32,
        output_channels: usize,
    ) -> (
        SharedState,
        Producer<f32, Arc<HeapRb<f32>>>,
        ringbuf::Consumer<f32, Arc<HeapRb<f32>>>,
    ) {
        let buffer_size = (output_sample_rate as usize * output_channels * 2).max(4096);
        let ring = HeapRb::<f32>::new(buffer_size);
        let (producer, consumer) = ring.split();

        (
            SharedState {
                playing_flag: Arc::new(AtomicBool::new(false)),
                reset_buffer_flag: Arc::new(AtomicBool::new(false)),
                queued_samples: Arc::new(AtomicUsize::new(0)),
                volume,
                start_audio_pts: Arc::new(AtomicU64::new(0.0f64.to_bits())),
                played_samples_total: Arc::new(AtomicU64::new(0)),
                output_channels,
                output_sample_rate_inv: if output_sample_rate == 0 {
                    0.0
                } else {
                    1.0 / output_sample_rate as f64
                },
            },
            producer,
            consumer,
        )
    }

    fn build_output_stream(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        sample_format: cpal::SampleFormat,
        state: &SharedState,
        consumer: ringbuf::Consumer<f32, Arc<HeapRb<f32>>>,
    ) -> Result<cpal::Stream, String> {
        let playing = state.playing_flag.clone();
        let reset_buffer_flag = state.reset_buffer_flag.clone();
        let queued_samples = state.queued_samples.clone();
        let volume = state.volume.clone();
        let played_samples = state.played_samples_total.clone();
        let channels = state.output_channels;
        let mut consumer = consumer;

        let err_fn = |err| log::error!("Audio output stream error: {err}");

        match sample_format {
            cpal::SampleFormat::F32 => device
                .build_output_stream(
                    config,
                    move |data: &mut [f32], _| {
                        crate::media_common::audio_playback::render_output_f32(
                            data,
                            channels,
                            &mut consumer,
                            &playing,
                            &volume,
                            &queued_samples,
                            &reset_buffer_flag,
                            &played_samples,
                        );
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Operation failed: {e}")),
            cpal::SampleFormat::I16 => device
                .build_output_stream(
                    config,
                    {
                        let mut scratch = Vec::<f32>::new();
                        move |data: &mut [i16], _| {
                        crate::media_common::audio_playback::render_output_i16(
                            data,
                            channels,
                            &mut consumer,
                            &playing,
                            &volume,
                            &queued_samples,
                            &reset_buffer_flag,
                            &played_samples,
                            &mut scratch,
                        );
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Operation failed: {e}")),
            cpal::SampleFormat::U16 => device
                .build_output_stream(
                    config,
                    {
                        let mut scratch = Vec::<f32>::new();
                        move |data: &mut [u16], _| {
                        crate::media_common::audio_playback::render_output_u16(
                            data,
                            channels,
                            &mut consumer,
                            &playing,
                            &volume,
                            &queued_samples,
                            &reset_buffer_flag,
                            &played_samples,
                            &mut scratch,
                        );
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Operation failed: {e}")),
            f => Err(format!("Unsupported audio sample format: {f:?}")),
        }
    }

    fn extract_samples(frame: &ffmpeg::frame::Audio, output_channels: usize) -> (&[f32], usize) {
        let expected = frame.samples() * output_channels;
        let expected_bytes = expected * std::mem::size_of::<f32>();
        let raw = frame.data(0);
        let take = expected_bytes.min(raw.len());
        let samples: &[f32] = bytemuck::cast_slice(&raw[..take]);
        (samples, expected)
    }

    fn append_samples(
        state: &SharedState,
        producer: &mut Producer<f32, Arc<HeapRb<f32>>>,
        samples: &[f32],
        block_on_full: bool,
    ) -> usize {
        const SPIN_RETRY_LIMIT: usize = 8;
        const BACKOFF_SLEEP: Duration = Duration::from_micros(250);

        let take_len = samples.len();
        if take_len == 0 {
            return 0;
        }

        let mut written = 0usize;
        let mut retry_count = 0usize;
        loop {
            let pushed = producer.push_slice(&samples[written..take_len]);
            if pushed > 0 {
                written += pushed;
                retry_count = 0;
                state.queued_samples.fetch_add(pushed, Ordering::Relaxed);
                if written >= take_len {
                    return written;
                }
            }

            if !block_on_full || !state.playing_flag.load(Ordering::Relaxed) {
                return written;
            }

            if retry_count < SPIN_RETRY_LIMIT {
                thread::yield_now();
                retry_count += 1;
            } else {
                thread::sleep(BACKOFF_SLEEP);
            }
        }
    }

    fn reset_decode_state(
        state: &SharedState,
        decode_state: &mut DecodeState,
    ) {
        decode_state.samples_processed = 0;
        state.reset_buffer_flag.store(true, Ordering::Relaxed);
        state.queued_samples.store(0, Ordering::Relaxed);
        decode_state.decoder.flush();
        let _ = decode_state.resampler.flush(&mut decode_state.resampled);
    }

    fn handle_command(
        cmd: PlayerCommand,
        ictx: &mut ffmpeg::format::context::Input,
        audio_index: usize,
        output_stream: &cpal::Stream,
        state: &SharedState,
        decode_state: &mut DecodeState,
        current_position: &Arc<AtomicU64>,
        playing: &mut bool,
        stream_started: &mut bool,
        completed: &mut bool,
    ) -> bool {
        match cmd {
            PlayerCommand::Play => {
                if *completed {
                    let _ = ictx.seek(0, ..);
                    Self::reset_decode_state(
                        state,
                        decode_state,
                    );
                    state.start_audio_pts.store(0.0f64.to_bits(), Ordering::Relaxed);
                    *completed = false;
                }
                *playing = true;
                state.playing_flag.store(true, Ordering::Relaxed);
                if *stream_started {
                    if let Err(e) = output_stream.play() {
                        log::error!("Failed to resume audio output: {e}");
                        *playing = false;
                        state.playing_flag.store(false, Ordering::Relaxed);
                    }
                } else if let Err(e) = output_stream.play() {
                    log::error!("Failed to start audio output: {e}");
                    *playing = false;
                    state.playing_flag.store(false, Ordering::Relaxed);
                } else {
                    *stream_started = true;
                }
                false
            }
            PlayerCommand::Pause => {
                *playing = false;
                state.playing_flag.store(false, Ordering::Relaxed);
                let _ = output_stream.pause();
                false
            }
            PlayerCommand::Seek(target) => {
                let was_playing = *playing;
                let ts = (target * ffmpeg::ffi::AV_TIME_BASE as f64) as i64;
                let _ = output_stream.pause();
                *stream_started = false;
                *playing = false;
                state.playing_flag.store(false, Ordering::Relaxed);
                Self::reset_decode_state(
                    state,
                    decode_state,
                );
                state.start_audio_pts.store(target.to_bits(), Ordering::Relaxed);
                current_position.store(target.to_bits(), Ordering::Relaxed);
                if ictx.seek(ts, audio_index as i64..).is_err() {
                    let _ = ictx.seek(ts, ..);
                }
                if was_playing {
                    if let Err(e) = output_stream.play() {
                        log::error!("Failed to resume audio output after seek: {e}");
                    } else {
                        *stream_started = true;
                        *playing = true;
                        state.playing_flag.store(true, Ordering::Relaxed);
                    }
                }
                false
            }
            PlayerCommand::Stop => {
                state.playing_flag.store(false, Ordering::Relaxed);
                let _ = output_stream.pause();
                true
            }
            PlayerCommand::AudioError(err) => {
                log::error!("Audio output error: {err}");
                false
            }
        }
    }

    fn flush_resampler_into_buffer(
        decode_state: &mut DecodeState,
        state: &SharedState,
        output_channels: usize,
    ) {
        if let Err(err) = decode_state.resampler.flush(&mut decode_state.resampled) {
            log::warn!("Resampler flush failed: {err}");
            return;
        }
        if decode_state.resampled.samples() == 0 {
            return;
        }
        let (samples, _) = Self::extract_samples(&decode_state.resampled, output_channels);
        let written =
            Self::append_samples(state, &mut decode_state.producer, samples, true);
        if written > 0 {
            decode_state.samples_processed += (written / output_channels) as u64;
        }
    }

    fn drain_decoder_frames(
        decode_state: &mut DecodeState,
        state: &SharedState,
        output_channels: usize,
        time_base: ffmpeg::util::rational::Rational,
        update_start_pts: bool,
    ) {
        loop {
            match decode_state.decoder.receive_frame(&mut decode_state.decoded) {
                Ok(_) => {
                    if update_start_pts {
                        if let Some(pts) = decode_state.decoded.pts() {
                            let pts_secs = pts as f64 * time_base.numerator() as f64
                                / time_base.denominator() as f64;
                            Self::update_start_audio_pts(state, pts_secs);
                        }
                    }

                    if let Err(err) = decode_state
                        .resampler
                        .run(&decode_state.decoded, &mut decode_state.resampled)
                    {
                        log::warn!("Resample failed: {err}");
                        continue;
                    }
                    let (samples, _) =
                        Self::extract_samples(&decode_state.resampled, output_channels);
                    let written = Self::append_samples(
                        state,
                        &mut decode_state.producer,
                        samples,
                        true,
                    );
                    if written > 0 {
                        decode_state.samples_processed += (written / output_channels) as u64;
                    }
                }
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::util::error::EAGAIN => {
                    break;
                }
                Err(ffmpeg::Error::Eof) => break,
                Err(err) => {
                    log::warn!("Failed to receive audio frame: {err}");
                    break;
                }
            }
        }
    }

    fn handle_decoder_eof(
        decode_state: &mut DecodeState,
        state: &SharedState,
        output_channels: usize,
        time_base: ffmpeg::util::rational::Rational,
        completed: &mut bool,
        playing: &mut bool,
        stream_started: &mut bool,
        output_stream: &cpal::Stream,
        packet_iter: &mut Option<ffmpeg::format::context::input::PacketIter<'_>>,
    ) {
        decode_state.decoder.flush();
        Self::drain_decoder_frames(
            decode_state,
            state,
            output_channels,
            time_base,
            false,
        );

        Self::flush_resampler_into_buffer(
            decode_state,
            state,
            output_channels,
        );

        let buffer_samples = Self::buffered_samples(state);
        if buffer_samples == 0 {
            *completed = true;
            *playing = false;
            state.playing_flag.store(false, Ordering::Relaxed);
            let _ = output_stream.pause();
            *stream_started = false;
            *packet_iter = None;
        }
    }

    fn process_next_packet_or_eof<'a>(
        next: Option<(ffmpeg::format::stream::Stream<'a>, ffmpeg::packet::Packet)>,
        audio_index: usize,
        decode_state: &mut DecodeState,
        state: &SharedState,
        output_channels: usize,
        time_base: ffmpeg::util::rational::Rational,
        completed: &mut bool,
        playing: &mut bool,
        stream_started: &mut bool,
        output_stream: &cpal::Stream,
        packet_iter: &mut Option<ffmpeg::format::context::input::PacketIter<'a>>,
    ) {
        if let Some((stream, packet)) = next {
            if stream.index() != audio_index {
                return;
            }

            if let Err(e) = decode_state.decoder.send_packet(&packet) {
                log::warn!("Failed to send audio packet: {e}");
                return;
            }
            Self::drain_decoder_frames(
                decode_state,
                state,
                output_channels,
                time_base,
                true,
            );
            return;
        }

        Self::handle_decoder_eof(
            decode_state,
            state,
            output_channels,
            time_base,
            completed,
            playing,
            stream_started,
            output_stream,
            packet_iter,
        );
    }

    fn current_position(
        samples_processed: u64,
        buffer_samples: usize,
        output_sample_rate_inv: f64,
        start_audio_pts: f64,
        duration: f64,
    ) -> f64 {
        let played = samples_processed.saturating_sub(buffer_samples as u64);
        let relative = played as f64 * output_sample_rate_inv;
        let pos = start_audio_pts + relative;
        pos.min(duration).max(0.0)
    }

    fn buffered_samples(state: &SharedState) -> usize {
        state.queued_samples.load(Ordering::Relaxed) / state.output_channels
    }

    fn maybe_emit_state_update(
        emit_state_events: bool,
        last_state_emit: &mut Instant,
        last_emit_snapshot: &mut Option<EmitSnapshot>,
        interval: Duration,
        emitter: &Option<E>,
        current_position: &Arc<AtomicU64>,
        volume: &Arc<AtomicU32>,
        duration: f64,
        state: &'static str,
    ) {
        if !emit_state_events || last_state_emit.elapsed() < interval {
            return;
        }

        let position = f64::from_bits(current_position.load(Ordering::Relaxed));
        let volume_value = f32::from_bits(volume.load(Ordering::Relaxed));
        let snapshot = EmitSnapshot {
            position,
            volume: volume_value,
            state,
        };

        if let Some(prev) = last_emit_snapshot {
            let position_changed = (snapshot.position - prev.position).abs() >= 0.05;
            let volume_changed = (snapshot.volume - prev.volume).abs() >= 0.01;
            let state_changed = snapshot.state != prev.state;
            if !position_changed && !volume_changed && !state_changed {
                *last_state_emit = Instant::now();
                return;
            }
        }

        if let Some(em) = emitter {
            em.emit(
                "player-state-update",
                PlayerStatePayload {
                    position,
                    duration,
                    state,
                    volume: volume_value,
                },
            );
        }
        *last_emit_snapshot = Some(snapshot);
        *last_state_emit = Instant::now();
    }

    fn update_start_audio_pts(state: &SharedState, pts_secs: f64) {
        loop {
            let current_bits = state.start_audio_pts.load(Ordering::Relaxed);
            let current = f64::from_bits(current_bits);
            if current != 0.0 && pts_secs >= current {
                return;
            }
            let new_bits = pts_secs.to_bits();
            if state
                .start_audio_pts
                .compare_exchange(
                    current_bits,
                    new_bits,
                    Ordering::Relaxed,
                    Ordering::Relaxed,
                )
                .is_ok()
            {
                return;
            }
        }
    }
}

impl<E: EventEmitter> Drop for AudioPlayer<E> {
    fn drop(&mut self) {
        let _ = self.command(PlayerCommand::Stop);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}
