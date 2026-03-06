use std::marker::PhantomData;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant};

use bytemuck;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::{HeapRb, Producer};
use serde::Serialize;
use video_rs::ffmpeg::{self};

use crate::events::EventEmitter;
use crate::media_common;
use crate::media_common::player_control::{AudioPlaybackController, DynAudioPlaybackController};
use crate::services::player::video::PlayerCommand;

#[derive(Clone)]
struct SharedState {
    playing_flag: Arc<AtomicBool>,
    reset_buffer_flag: Arc<AtomicBool>,
    queued_samples: Arc<AtomicUsize>,
    discard_output_samples: Arc<AtomicUsize>,
    volume: Arc<AtomicU32>,
    start_audio_pts: Arc<AtomicU64>,
    played_samples_total: Arc<AtomicU64>,
    output_channels: usize,
    output_sample_rate: u32,
    output_sample_rate_inv: f64,
}

struct DecodeState {
    decoder: ffmpeg::decoder::Audio,
    resampler: ffmpeg::software::resampling::context::Context,
    producer: Producer<f32, Arc<HeapRb<f32>>>,
    decoded: ffmpeg::frame::Audio,
    resampled: ffmpeg::frame::Audio,
    samples_processed: u64,
    seek_seq: u64,
    pending_seek_target: Option<f64>,
    pending_seek_ts: Option<i64>,
    last_eof_logged_seek_seq: u64,
    seek_started_at: Option<Instant>,
    seek_played_samples_snapshot: u64,
    seek_decode_log_count: u8,
    seek_diag_last_log: Option<Instant>,
    eof_drained: bool,
    eof_no_data_count: u32,
    eof_suppress_last_log: Option<Instant>,
    eof_recover_attempts: u32,
    eof_last_recover_at: Option<Instant>,
    eof_empty_started_at: Option<Instant>,
    last_seek_at: Option<Instant>,
    eof_started_at: Option<Instant>,
    eof_played_snapshot: u64,
    pending_recover_target: Option<f64>,
    decoded_packets_since_recover: u32,
    last_packet_pts_secs: Option<f64>,
    last_packet_dts_secs: Option<f64>,
    packets_since_seek: u64,
}

#[derive(Clone, Copy)]
struct EmitSnapshot {
    position: f64,
    volume: f32,
    state: &'static str,
}

#[derive(Clone, Serialize)]
struct PlayerStatePayload {
    instance_id: Option<String>,
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

pub fn create_video_audio_player<E: EventEmitter>(
    path: &str,
) -> Option<Arc<DynAudioPlaybackController<PlayerCommand>>> {
    AudioPlayer::<E>::new(path.to_string(), false, None, None)
        .ok()
        .map(|ap| Arc::new(ap) as Arc<DynAudioPlaybackController<PlayerCommand>>)
}

impl<E: EventEmitter> AudioPlayer<E> {
    pub fn new(
        path: String,
        emit_state_events: bool,
        emitter: Option<E>,
        instance_id: Option<String>,
    ) -> Result<Self, String> {
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
            instance_id,
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
        instance_id: Option<String>,
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
            let (mut audio_index, audio_stream, mut time_base) =
                match Self::find_audio_stream(&ictx) {
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

            let (state, producer, consumer) =
                Self::build_state(volume.clone(), output_sample_rate, output_channels);

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
                seek_seq: 0,
                pending_seek_target: None,
                pending_seek_ts: None,
                last_eof_logged_seek_seq: 0,
                seek_started_at: None,
                seek_played_samples_snapshot: 0,
                seek_decode_log_count: 0,
                seek_diag_last_log: None,
                eof_drained: false,
                eof_no_data_count: 0,
                eof_suppress_last_log: None,
                eof_recover_attempts: 0,
                eof_last_recover_at: None,
                eof_empty_started_at: None,
                last_seek_at: None,
                eof_started_at: None,
                eof_played_snapshot: 0,
                pending_recover_target: None,
                decoded_packets_since_recover: 0,
                last_packet_pts_secs: None,
                last_packet_dts_secs: None,
                packets_since_seek: 0,
            };
            let mut last_position_update = Instant::now();
            let mut last_state_emit = Instant::now();
            let mut last_emit_snapshot: Option<EmitSnapshot> = None;

            loop {
                let mut pending_commands = Vec::with_capacity(MAX_COMMANDS_PER_TICK);
                for _ in 0..MAX_COMMANDS_PER_TICK {
                    let Ok(cmd) = command_rx.try_recv() else {
                        break;
                    };
                    pending_commands.push(cmd);
                }
                let commands = Self::compact_commands(pending_commands);
                for cmd in commands {
                    packet_iter = None;
                    if Self::handle_command(
                        cmd,
                        &mut ictx,
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
                        Ok(first_cmd) => {
                            let mut pending_commands = Vec::with_capacity(MAX_COMMANDS_PER_TICK);
                            pending_commands.push(first_cmd);
                            for _ in 1..MAX_COMMANDS_PER_TICK {
                                let Ok(cmd) = command_rx.try_recv() else {
                                    break;
                                };
                                pending_commands.push(cmd);
                            }
                            let commands = Self::compact_commands(pending_commands);
                            for cmd in commands {
                                packet_iter = None;
                                if Self::handle_command(
                                    cmd,
                                    &mut ictx,
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
                        &instance_id,
                        duration,
                        "paused",
                    );
                    continue;
                }

                // 解码高水位节流：当缓冲已接近上限时暂停取包，避免短时间内把 demux 提前读到 EOF。
                // 这里保持约 1.5s 的音频前瞻，兼顾流畅与 seek 响应。
                let queued_now = state.queued_samples.load(Ordering::Relaxed);
                let decode_high_watermark =
                    (state.output_sample_rate as usize * state.output_channels * 3) / 2;
                if queued_now >= decode_high_watermark && decode_state.pending_recover_target.is_none() {
                    if last_position_update.elapsed() >= Duration::from_millis(33) {
                        let current_pos = Self::current_position_from_playback_clock(
                            &state,
                            &decode_state,
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
                        &instance_id,
                        duration,
                        "playing",
                    );
                    thread::sleep(Duration::from_millis(4));
                    continue;
                }

                if packet_iter.is_none() {
                    if let Some(recover_target) = decode_state.pending_recover_target.take() {
                        match Self::hard_recover_after_seek(
                            &path,
                            recover_target,
                            &mut ictx,
                            &mut audio_index,
                            &mut time_base,
                            &state,
                            &mut decode_state,
                            &current_position,
                        ) {
                            Ok(_) => {
                                log::warn!(
                                    "[audio][seek:{}] eof-empty HARD recover success: target={}s attempts={}",
                                    decode_state.seek_seq,
                                    recover_target,
                                    decode_state.eof_recover_attempts
                                );
                            }
                            Err(err) => {
                                log::warn!(
                                    "[audio][seek:{}] eof-empty recover failed: {}",
                                    decode_state.seek_seq,
                                    err
                                );
                            }
                        }
                    }
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
                        duration,
                        &mut completed,
                        &mut playing,
                        &mut stream_started,
                        &output_stream,
                        &mut packet_iter,
                    );

                    Self::maybe_log_seek_runtime_diagnostics(
                        &mut decode_state,
                        &state,
                        &current_position,
                        duration,
                    );
                    if reached_end || !playing {
                        break;
                    }
                }

                if reached_end && playing {
                    thread::sleep(Duration::from_millis(5));
                }

                if last_position_update.elapsed() >= Duration::from_millis(33) {
                    let current_pos =
                        Self::current_position_from_playback_clock(&state, &decode_state, duration);
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
                    &instance_id,
                    duration,
                    "playing",
                );
            }
        })
    }

    fn compact_commands(commands: Vec<PlayerCommand>) -> Vec<PlayerCommand> {
        if commands.len() <= 1 {
            return commands;
        }

        let mut seek_count_in = 0usize;
        let mut compacted = Vec::with_capacity(commands.len());
        for cmd in commands {
            match cmd {
                PlayerCommand::Seek(target) => {
                    seek_count_in += 1;
                    if let Some(PlayerCommand::Seek(last_target)) = compacted.last_mut() {
                        *last_target = target;
                    } else {
                        compacted.push(PlayerCommand::Seek(target));
                    }
                }
                other => compacted.push(other),
            }
        }

        if seek_count_in > 1 {
            let seek_count_out = compacted
                .iter()
                .filter(|cmd| matches!(cmd, PlayerCommand::Seek(_)))
                .count();
            if seek_count_out < seek_count_in {
                log::info!(
                    "[audio][cmd] compact seek commands: in={} out={}",
                    seek_count_in,
                    seek_count_out
                );
            }
        }

        compacted
    }

    fn open_input(path: &str) -> Result<(ffmpeg::format::context::Input, f64), String> {
        media_common::ensure_ffmpeg_init()?;
        let ictx =
            ffmpeg::format::input(path).map_err(|e| format!("Failed to open audio file: {e}"))?;
        let format_duration = {
            let fmt_dur = ictx.duration();
            if fmt_dur > 0 && fmt_dur != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
                Some(fmt_dur as f64 / ffmpeg::ffi::AV_TIME_BASE as f64)
            } else {
                None
            }
        };
        let stream_duration =
            ictx.streams()
                .best(ffmpeg::media::Type::Audio)
                .and_then(|audio_stream| {
                    let tb = audio_stream.time_base();
                    let dur_ts = audio_stream.duration();
                    if dur_ts > 0 {
                        Some(dur_ts as f64 * tb.numerator() as f64 / tb.denominator() as f64)
                    } else {
                        None
                    }
                });
        let duration = media_common::audio_decode::extract_audio_duration(&ictx);
        log::info!(
            "[audio][open_input] path={} duration_selected={}s stream_duration={:?} format_duration={:?}",
            path,
            duration,
            stream_duration,
            format_duration
        );
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

    fn is_input_changed_error(err: &ffmpeg::Error) -> bool {
        err.to_string().contains("Input changed")
    }

    fn rebuild_resampler_from_decoded(
        decode_state: &mut DecodeState,
        state: &SharedState,
    ) -> Result<(), String> {
        decode_state.resampler = media_common::audio_decode::rebuild_audio_resampler_from_frame(
            &decode_state.decoded,
            decode_state.decoder.rate() as u32,
            ffmpeg::format::Sample::F32(ffmpeg::format::sample::Type::Packed),
            ffmpeg::ChannelLayout::default(state.output_channels as i32),
            state.output_sample_rate,
        )?;
        Ok(())
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
                discard_output_samples: Arc::new(AtomicUsize::new(0)),
                volume,
                start_audio_pts: Arc::new(AtomicU64::new(0.0f64.to_bits())),
                played_samples_total: Arc::new(AtomicU64::new(0)),
                output_channels,
                output_sample_rate,
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
        let discard_output_samples = state.discard_output_samples.clone();
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
                            &discard_output_samples,
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
                                &discard_output_samples,
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
                                &discard_output_samples,
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

    fn reset_decode_state(state: &SharedState, decode_state: &mut DecodeState) {
        let queued_before = state.queued_samples.load(Ordering::Relaxed);
        log::info!(
            "[audio][reset_decode_state] queued_before={} played_samples_total={}",
            queued_before,
            state.played_samples_total.load(Ordering::Relaxed)
        );
        decode_state.samples_processed = 0;
        state.reset_buffer_flag.store(true, Ordering::Relaxed);
        state.queued_samples.store(0, Ordering::Relaxed);
        decode_state.eof_drained = false;
        decode_state.eof_no_data_count = 0;
        decode_state.eof_suppress_last_log = None;
        decode_state.eof_last_recover_at = None;
        decode_state.eof_empty_started_at = None;
        decode_state.eof_started_at = None;
        decode_state.eof_played_snapshot = 0;
        decode_state.pending_recover_target = None;
        decode_state.decoded_packets_since_recover = 0;
        decode_state.last_packet_pts_secs = None;
        decode_state.last_packet_dts_secs = None;
        decode_state.packets_since_seek = 0;
        decode_state.decoder.flush();
        let _ = decode_state.resampler.flush(&mut decode_state.resampled);
    }

    fn hard_recover_after_seek(
        path: &str,
        target: f64,
        ictx: &mut ffmpeg::format::context::Input,
        audio_index: &mut usize,
        time_base: &mut ffmpeg::util::rational::Rational,
        state: &SharedState,
        decode_state: &mut DecodeState,
        current_position: &Arc<AtomicU64>,
    ) -> Result<(), String> {
        let (mut new_ictx, _) = Self::open_input(path)?;
        let (new_audio_index, new_stream, new_time_base) = Self::find_audio_stream(&new_ictx)?;
        let new_decoder = Self::create_decoder(&new_stream)?;
        let new_resampler = Self::create_resampler(
            &new_decoder,
            state.output_channels,
            state.output_sample_rate,
        )?;

        let ts = (target * ffmpeg::ffi::AV_TIME_BASE as f64) as i64;
        if let Err(primary_err) = new_ictx.seek(ts, ..) {
            let lower = ts.saturating_sub(ffmpeg::ffi::AV_TIME_BASE as i64 * 5);
            let upper = ts.saturating_add(ffmpeg::ffi::AV_TIME_BASE as i64 * 5);
            new_ictx.seek(ts, lower..upper).map_err(|fallback_err| {
                format!("hard recover seek failed: primary={primary_err}; fallback={fallback_err}")
            })?;
        }

        Self::reset_decode_state(state, decode_state);
        decode_state.decoder = new_decoder;
        decode_state.resampler = new_resampler;
        // hard recover 只用于内部纠偏，不应重置前端 seek 的一次性诊断窗口
        decode_state.pending_seek_target = None;
        decode_state.pending_seek_ts = None;
        decode_state.seek_played_samples_snapshot =
            state.played_samples_total.load(Ordering::Relaxed);
        decode_state.eof_no_data_count = 0;
        decode_state.eof_drained = false;
        decode_state.eof_empty_started_at = None;
        decode_state.eof_started_at = None;
        decode_state.eof_played_snapshot = 0;
        decode_state.last_seek_at = Some(Instant::now());
        decode_state.decoded_packets_since_recover = 0;
        decode_state.last_packet_pts_secs = None;
        decode_state.last_packet_dts_secs = None;
        decode_state.packets_since_seek = 0;

        state
            .start_audio_pts
            .store(target.to_bits(), Ordering::Relaxed);
        current_position.store(target.to_bits(), Ordering::Relaxed);
        state.discard_output_samples.store(
            ((state.output_sample_rate as usize * state.output_channels) * 180) / 1000,
            Ordering::Relaxed,
        );

        *audio_index = new_audio_index;
        *time_base = new_time_base;
        *ictx = new_ictx;
        Ok(())
    }

    fn handle_command(
        cmd: PlayerCommand,
        ictx: &mut ffmpeg::format::context::Input,
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
                log::info!(
                    "[audio][cmd] Play recv: completed={} playing={} stream_started={} pos={} queued_samples={} played_total={}",
                    *completed,
                    *playing,
                    *stream_started,
                    f64::from_bits(current_position.load(Ordering::Relaxed)),
                    state.queued_samples.load(Ordering::Relaxed),
                    state.played_samples_total.load(Ordering::Relaxed)
                );
                if *completed {
                    let _ = ictx.seek(0, ..);
                    Self::reset_decode_state(state, decode_state);
                    state
                        .start_audio_pts
                        .store(0.0f64.to_bits(), Ordering::Relaxed);
                    decode_state.seek_played_samples_snapshot =
                        state.played_samples_total.load(Ordering::Relaxed);
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
                log::info!(
                    "[audio][cmd] Pause recv: completed={} playing={} stream_started={} pos={} queued_samples={} played_total={}",
                    *completed,
                    *playing,
                    *stream_started,
                    f64::from_bits(current_position.load(Ordering::Relaxed)),
                    state.queued_samples.load(Ordering::Relaxed),
                    state.played_samples_total.load(Ordering::Relaxed)
                );
                *playing = false;
                state.playing_flag.store(false, Ordering::Relaxed);
                let _ = output_stream.pause();
                false
            }
            PlayerCommand::Seek(target) => {
                log::info!(
                    "[audio][cmd] Seek recv: target={} completed={} playing={} stream_started={} pos={} queued_samples={} played_total={}",
                    target,
                    *completed,
                    *playing,
                    *stream_started,
                    f64::from_bits(current_position.load(Ordering::Relaxed)),
                    state.queued_samples.load(Ordering::Relaxed),
                    state.played_samples_total.load(Ordering::Relaxed)
                );
                let was_playing = *playing;
                let ts = (target * ffmpeg::ffi::AV_TIME_BASE as f64) as i64;
                let played_before_seek = state.played_samples_total.load(Ordering::Relaxed);
                decode_state.seek_seq = decode_state.seek_seq.saturating_add(1);
                decode_state.pending_seek_target = Some(target);
                decode_state.pending_seek_ts = Some(ts);
                decode_state.seek_started_at = Some(Instant::now());
                decode_state.last_seek_at = Some(Instant::now());
                decode_state.seek_played_samples_snapshot =
                    state.played_samples_total.load(Ordering::Relaxed);
                decode_state.seek_decode_log_count = 0;
                decode_state.seek_diag_last_log = None;
                decode_state.eof_recover_attempts = 0;
                decode_state.eof_empty_started_at = None;
                decode_state.decoded_packets_since_recover = 0;
                decode_state.last_packet_pts_secs = None;
                decode_state.last_packet_dts_secs = None;
                decode_state.packets_since_seek = 0;
                log::info!(
                    "[audio][seek:{}] recv target={}s ts={} was_playing={} queued_samples={} played_samples_total={} stream_started={}",
                    decode_state.seek_seq,
                    target,
                    ts,
                    was_playing,
                    state.queued_samples.load(Ordering::Relaxed),
                    played_before_seek,
                    *stream_started
                );
                let _ = output_stream.pause();
                *stream_started = false;
                *playing = false;
                state.playing_flag.store(false, Ordering::Relaxed);
                Self::reset_decode_state(state, decode_state);
                let discard_samples =
                    ((state.output_sample_rate as usize * state.output_channels) * 180) / 1000;
                state
                    .discard_output_samples
                    .store(discard_samples, Ordering::Relaxed);
                log::info!(
                    "[audio][seek:{}] set discard_output_samples={} (~180ms)",
                    decode_state.seek_seq,
                    discard_samples
                );
                state
                    .start_audio_pts
                    .store(target.to_bits(), Ordering::Relaxed);
                current_position.store(target.to_bits(), Ordering::Relaxed);
                let seek_primary = ictx.seek(ts, ..);
                if let Err(err) = seek_primary {
                    log::warn!(
                        "[audio][seek:{}] global seek failed: {} -> fallback stream-range seek",
                        decode_state.seek_seq,
                        err
                    );
                    let lower = ts.saturating_sub(ffmpeg::ffi::AV_TIME_BASE as i64 * 5);
                    let upper = ts.saturating_add(ffmpeg::ffi::AV_TIME_BASE as i64 * 5);
                    if let Err(fallback_err) = ictx.seek(ts, lower..upper) {
                        log::error!(
                            "[audio][seek:{}] fallback seek failed: {}",
                            decode_state.seek_seq,
                            fallback_err
                        );
                    } else {
                        log::info!(
                            "[audio][seek:{}] fallback seek success (window-range)",
                            decode_state.seek_seq
                        );
                    }
                } else {
                    log::info!(
                        "[audio][seek:{}] primary seek success (global)",
                        decode_state.seek_seq
                    );
                }
                if was_playing {
                    if let Err(e) = output_stream.play() {
                        log::error!("Failed to resume audio output after seek: {e}");
                    } else {
                        // 关键：等待回调线程先消费 reset_buffer_flag 并清空旧缓冲，
                        // 再恢复 decode/play，避免新 seek 帧被误清掉。
                        let wait_started = Instant::now();
                        let wait_timeout = Duration::from_millis(120);
                        while state.reset_buffer_flag.load(Ordering::Relaxed)
                            && wait_started.elapsed() < wait_timeout
                        {
                            thread::sleep(Duration::from_millis(1));
                        }
                        let reset_cleared = !state.reset_buffer_flag.load(Ordering::Relaxed);
                        log::info!(
                            "[audio][seek:{}] reset wait done cleared={} waited_ms={}",
                            decode_state.seek_seq,
                            reset_cleared,
                            wait_started.elapsed().as_millis()
                        );
                        *stream_started = true;
                        *playing = true;
                        state.playing_flag.store(true, Ordering::Relaxed);
                        log::info!(
                            "[audio][seek:{}] resumed playback after seek queued_samples={} played_samples_total={}",
                            decode_state.seek_seq,
                            state.queued_samples.load(Ordering::Relaxed),
                            state.played_samples_total.load(Ordering::Relaxed)
                        );
                    }
                }
                false
            }
            PlayerCommand::Stop => {
                log::info!(
                    "[audio][cmd] Stop recv: completed={} playing={} stream_started={} pos={} queued_samples={} played_total={}",
                    *completed,
                    *playing,
                    *stream_started,
                    f64::from_bits(current_position.load(Ordering::Relaxed)),
                    state.queued_samples.load(Ordering::Relaxed),
                    state.played_samples_total.load(Ordering::Relaxed)
                );
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
        // 关键：每次 flush 前重置输出帧，避免复用过小的旧缓冲导致后续 run 输出被截断。
        decode_state.resampled = ffmpeg::frame::Audio::empty();
        if let Err(err) = decode_state.resampler.flush(&mut decode_state.resampled) {
            log::warn!("Resampler flush failed: {err}");
            return;
        }
        if decode_state.resampled.samples() == 0 {
            return;
        }
        let (samples, _) = Self::extract_samples(&decode_state.resampled, output_channels);
        let written = Self::append_samples(state, &mut decode_state.producer, samples, true);
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
            match decode_state
                .decoder
                .receive_frame(&mut decode_state.decoded)
            {
                Ok(_) => {
                    if update_start_pts {
                        if let Some(pts) = decode_state.decoded.pts() {
                            let pts_secs = pts as f64 * time_base.numerator() as f64
                                / time_base.denominator() as f64;
                            Self::update_start_audio_pts(state, pts_secs);
                            if let Some(target) = decode_state.pending_seek_target {
                                let target_ts = decode_state.pending_seek_ts.unwrap_or_default();
                                let delta = pts_secs - target;
                                log::info!(
                                    "[audio][seek:{}] first_decoded_frame pts={}s target={}s target_ts={} delta={}s queued_samples={}",
                                    decode_state.seek_seq,
                                    pts_secs,
                                    target,
                                    target_ts,
                                    delta,
                                    state.queued_samples.load(Ordering::Relaxed)
                                );
                                decode_state.pending_seek_target = None;
                                decode_state.pending_seek_ts = None;
                            }
                            if decode_state.seek_started_at.is_some()
                                && decode_state.seek_decode_log_count < 4
                            {
                                log::info!(
                                    "[audio][seek:{}] decoded_frame pts={} samples={} rate={} queued_samples={}",
                                    decode_state.seek_seq,
                                    pts_secs,
                                    decode_state.decoded.samples(),
                                    decode_state.decoded.rate(),
                                    state.queued_samples.load(Ordering::Relaxed)
                                );
                                decode_state.seek_decode_log_count += 1;
                            }
                        }
                    }

                    media_common::audio_decode::normalize_decoded_audio_frame(
                        &mut decode_state.decoded,
                        decode_state.decoder.rate() as u32,
                    );
                    // 关键：每次 run 前都重建空输出帧，强制 swr 按本次输入样本数重新分配输出缓冲。
                    // 否则会复用上一次过小缓冲（例如 34 samples），造成持续“每包仅输出几十样本”。
                    decode_state.resampled = ffmpeg::frame::Audio::empty();
                    if let Err(err) = decode_state
                        .resampler
                        .run(&decode_state.decoded, &mut decode_state.resampled)
                    {
                        if Self::is_input_changed_error(&err) {
                            match Self::rebuild_resampler_from_decoded(decode_state, state) {
                                Ok(_) => {
                                    decode_state.resampled = ffmpeg::frame::Audio::empty();
                                    if let Err(retry_err) = decode_state
                                        .resampler
                                        .run(&decode_state.decoded, &mut decode_state.resampled)
                                    {
                                        log::warn!("Resample retry failed: {retry_err}");
                                        continue;
                                    }
                                }
                                Err(rebuild_err) => {
                                    log::warn!("Rebuild resampler failed: {rebuild_err}");
                                    continue;
                                }
                            }
                        } else {
                            log::warn!("Resample failed: {err}");
                            continue;
                        }
                    }
                    let resampled_samples = decode_state.resampled.samples();
                    let resampled_rate = decode_state.resampled.rate();
                    let resampled_format = decode_state.resampled.format();
                    let raw_len = decode_state.resampled.data(0).len();
                    let (samples, expected_samples) =
                        Self::extract_samples(&decode_state.resampled, output_channels);
                    let written =
                        Self::append_samples(state, &mut decode_state.producer, samples, true);
                    if written > 0 {
                        decode_state.samples_processed += (written / output_channels) as u64;
                        if decode_state.pending_seek_target.is_none()
                            && decode_state.seek_seq > 0
                            && decode_state.samples_processed <= (output_channels as u64 * 4)
                        {
                            log::debug!(
                                "[audio][seek:{}] buffered_written={} samples_processed={} queued_samples={}",
                                decode_state.seek_seq,
                                written,
                                decode_state.samples_processed,
                                state.queued_samples.load(Ordering::Relaxed)
                            );
                        }
                    }
                    if decode_state.seek_started_at.is_some() && decode_state.seek_decode_log_count == 1
                    {
                        log::info!(
                            "[audio][seek:{}] resampled_frame fmt={:?} rate={} samples={} raw_bytes={} expected_samples={} extracted_samples={} written_samples={} queued_samples={}",
                            decode_state.seek_seq,
                            resampled_format,
                            resampled_rate,
                            resampled_samples,
                            raw_len,
                            expected_samples,
                            samples.len(),
                            written,
                            state.queued_samples.load(Ordering::Relaxed)
                        );
                        decode_state.seek_decode_log_count = 2;
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
        duration: f64,
        completed: &mut bool,
        playing: &mut bool,
        stream_started: &mut bool,
        output_stream: &cpal::Stream,
        packet_iter: &mut Option<ffmpeg::format::context::input::PacketIter<'_>>,
    ) {
        if !decode_state.eof_drained {
            decode_state.decoder.flush();
            Self::drain_decoder_frames(decode_state, state, output_channels, time_base, false);
            Self::flush_resampler_into_buffer(decode_state, state, output_channels);
            decode_state.eof_drained = true;
            decode_state.eof_started_at = Some(Instant::now());
            decode_state.eof_played_snapshot = state.played_samples_total.load(Ordering::Relaxed);
        }

        let start_pts = f64::from_bits(state.start_audio_pts.load(Ordering::Relaxed));
        let estimated_pos =
            Self::current_position_from_playback_clock(state, decode_state, duration);
        let remaining = (duration - estimated_pos).max(0.0);
        let eof_started_at = decode_state.eof_started_at.unwrap_or_else(Instant::now);
        let eof_elapsed = eof_started_at.elapsed();
        let played_now = state.played_samples_total.load(Ordering::Relaxed);
        let played_since_eof = played_now.saturating_sub(decode_state.eof_played_snapshot);
        let queued_samples = state.queued_samples.load(Ordering::Relaxed);
        let stalled_after_eof = queued_samples == 0 && eof_elapsed >= Duration::from_millis(120);
        if decode_state.last_eof_logged_seek_seq != decode_state.seek_seq {
            log::info!(
                "[audio][seek:{}] eof reached: samples_processed={} start_audio_pts={} estimated_pos={} remaining={} queued_samples={} played_since_eof={} eof_elapsed_ms={} playing={} completed={} packets_since_seek={} last_packet_pts={:?} last_packet_dts={:?}",
                decode_state.seek_seq,
                decode_state.samples_processed,
                start_pts,
                estimated_pos,
                remaining,
                state.queued_samples.load(Ordering::Relaxed),
                played_since_eof,
                eof_elapsed.as_millis(),
                *playing,
                *completed,
                decode_state.packets_since_seek,
                decode_state.last_packet_pts_secs,
                decode_state.last_packet_dts_secs
            );
            decode_state.last_eof_logged_seek_seq = decode_state.seek_seq;
        }

        // 对“明显假 EOF”做提前恢复：
        // 当 remaining 仍很大时，不等待完全静音/停滞才恢复，避免出现几秒后无声+进度冻结。
        let now = Instant::now();
        let should_early_recover = remaining > 3.0
            && eof_elapsed >= Duration::from_millis(60)
            && decode_state
                .eof_last_recover_at
                .map(|last| now.duration_since(last) >= Duration::from_millis(2500))
                .unwrap_or(true);
        if should_early_recover {
            let recover_target = (estimated_pos).max(0.0);
            decode_state.eof_recover_attempts = decode_state.eof_recover_attempts.saturating_add(1);
            decode_state.eof_last_recover_at = Some(now);
            decode_state.pending_recover_target = Some(recover_target);
            log::warn!(
                "[audio][seek:{}] schedule early eof recover: target={}s remaining={}s attempts={} eof_elapsed_ms={}",
                decode_state.seek_seq,
                recover_target,
                remaining,
                decode_state.eof_recover_attempts,
                eof_elapsed.as_millis()
            );

            // Force recreation of packet iter by dropping the old one
            *packet_iter = None;
            decode_state.eof_drained = false;
            decode_state.eof_started_at = None;
            return;
        }

        if stalled_after_eof {
            decode_state.eof_no_data_count = decode_state.eof_no_data_count.saturating_add(1);
            let empty_started = decode_state.eof_empty_started_at.get_or_insert(now);
            let empty_elapsed = now.duration_since(*empty_started);
            let allow_complete = (remaining <= 0.35)
                && empty_elapsed >= Duration::from_millis(800)
                && decode_state.eof_no_data_count >= 4;
            if !allow_complete {
                let should_log = decode_state
                    .eof_suppress_last_log
                    .map(|last| now.duration_since(last) >= Duration::from_millis(1000))
                    .unwrap_or(true);
                if should_log {
                    decode_state.eof_suppress_last_log = Some(now);
                    log::warn!(
                        "[audio][seek:{}] eof with empty buffer but remaining={}s, suppress completed (count={} empty_ms={})",
                        decode_state.seek_seq,
                        remaining,
                        decode_state.eof_no_data_count,
                        empty_elapsed.as_millis()
                    );
                }

                let should_recover = remaining > 1.0
                    && empty_elapsed >= Duration::from_millis(120)
                    && decode_state
                        .eof_last_recover_at
                        .map(|last| now.duration_since(last) >= Duration::from_millis(400))
                        .unwrap_or(true);
                if should_recover {
                    let recover_target = (estimated_pos - 0.15).max(0.0);
                    decode_state.eof_recover_attempts =
                        decode_state.eof_recover_attempts.saturating_add(1);
                    decode_state.eof_last_recover_at = Some(now);
                    decode_state.pending_recover_target = Some(recover_target);
                    log::warn!(
                        "[audio][seek:{}] schedule eof-empty recover: target={}s remaining={}s count={} attempts={}",
                        decode_state.seek_seq,
                        recover_target,
                        remaining,
                        decode_state.eof_no_data_count,
                        decode_state.eof_recover_attempts
                    );
                    *packet_iter = None;
                    decode_state.eof_drained = false;
                    decode_state.eof_started_at = None;
                    return;
                }
                // 关键：不要在每次 suppress 时重置 eof_drained/packet_iter，
                // 否则会反复 flush 同一段尾帧，导致 queued_samples 维持在极小非零值，
                // 使 eof_no_data_count 和 empty_ms 无法累计，形成“count=1”死循环。
                return;
            }
            decode_state.eof_empty_started_at = None;
            *completed = true;
            *playing = false;
            state.playing_flag.store(false, Ordering::Relaxed);
            let _ = output_stream.pause();
            *stream_started = false;
            *packet_iter = None;
            let played_total = state.played_samples_total.load(Ordering::Relaxed);
            let played_since_seek =
                played_total.saturating_sub(decode_state.seek_played_samples_snapshot);
            let played_since_eof = played_total.saturating_sub(decode_state.eof_played_snapshot);
            let eof_elapsed_ms = decode_state
                .eof_started_at
                .map(|start| start.elapsed().as_millis())
                .unwrap_or(0);
            log::warn!(
                "[audio][seek:{}] set completed=true because stalled-after-eof, remaining={}s, eof_no_data_count={}, eof_elapsed_ms={}, played_since_eof={}, played_total={}, played_since_seek={}, start_pts={}, estimated_pos={}, duration={}",
                decode_state.seek_seq,
                remaining,
                decode_state.eof_no_data_count,
                eof_elapsed_ms,
                played_since_eof,
                played_total,
                played_since_seek,
                start_pts,
                estimated_pos,
                duration
            );
            return;
        }
        // EOF 后播放仍在前进，说明缓冲还在自然排空；重置“空转”观测。
        decode_state.eof_empty_started_at = None;
        decode_state.eof_no_data_count = 0;
    }

    fn process_next_packet_or_eof<'a>(
        next: Option<(ffmpeg::format::stream::Stream<'a>, ffmpeg::packet::Packet)>,
        audio_index: usize,
        decode_state: &mut DecodeState,
        state: &SharedState,
        output_channels: usize,
        time_base: ffmpeg::util::rational::Rational,
        duration: f64,
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
            decode_state.packets_since_seek = decode_state.packets_since_seek.saturating_add(1);
            decode_state.last_packet_pts_secs = packet.pts().map(|pts| {
                pts as f64 * time_base.numerator() as f64 / time_base.denominator() as f64
            });
            decode_state.last_packet_dts_secs = packet.dts().map(|dts| {
                dts as f64 * time_base.numerator() as f64 / time_base.denominator() as f64
            });

            if let Err(e) = decode_state.decoder.send_packet(&packet) {
                log::warn!("Failed to send audio packet: {e}");
                return;
            }
            if decode_state.eof_last_recover_at.is_some() {
                decode_state.decoded_packets_since_recover =
                    decode_state.decoded_packets_since_recover.saturating_add(1);
                if decode_state.decoded_packets_since_recover >= 48 {
                    log::info!(
                        "[audio][seek:{}] recover stabilized: packets_since_recover={} reset_attempts_from={}",
                        decode_state.seek_seq,
                        decode_state.decoded_packets_since_recover,
                        decode_state.eof_recover_attempts
                    );
                    decode_state.eof_recover_attempts = 0;
                    decode_state.eof_last_recover_at = None;
                    decode_state.decoded_packets_since_recover = 0;
                }
            }
            decode_state.eof_drained = false;
            Self::drain_decoder_frames(decode_state, state, output_channels, time_base, true);
            return;
        }

        Self::handle_decoder_eof(
            decode_state,
            state,
            output_channels,
            time_base,
            duration,
            completed,
            playing,
            stream_started,
            output_stream,
            packet_iter,
        );
    }

    fn current_position_from_playback_clock(
        state: &SharedState,
        decode_state: &DecodeState,
        duration: f64,
    ) -> f64 {
        let start_audio_pts = f64::from_bits(state.start_audio_pts.load(Ordering::Relaxed));
        let played_total = state.played_samples_total.load(Ordering::Relaxed);
        let played_since_anchor =
            played_total.saturating_sub(decode_state.seek_played_samples_snapshot);
        let relative = played_since_anchor as f64 * state.output_sample_rate_inv;
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
        instance_id: &Option<String>,
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
            if state_changed {
                log::info!(
                    "[audio][event] state transition: {} -> {} pos={} dur={} instance_id={:?}",
                    prev.state,
                    snapshot.state,
                    snapshot.position,
                    duration,
                    instance_id
                );
            }
            if !position_changed && !volume_changed && !state_changed {
                *last_state_emit = Instant::now();
                return;
            }
        }

        if let Some(em) = emitter {
            em.emit(
                "player-state-update",
                PlayerStatePayload {
                    instance_id: instance_id.clone(),
                    position,
                    duration,
                    state,
                    volume: volume_value,
                },
            );
        }
        if last_emit_snapshot.is_none() {
            log::info!(
                "[audio][event] first state emit: state={} pos={} dur={} instance_id={:?}",
                state,
                position,
                duration,
                instance_id
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
                .compare_exchange(current_bits, new_bits, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                return;
            }
        }
    }

    fn maybe_log_seek_runtime_diagnostics(
        decode_state: &mut DecodeState,
        state: &SharedState,
        current_position: &Arc<AtomicU64>,
        duration: f64,
    ) {
        let Some(seek_started_at) = decode_state.seek_started_at else {
            return;
        };

        let elapsed = seek_started_at.elapsed();
        if elapsed > Duration::from_millis(1500) {
            decode_state.seek_started_at = None;
            decode_state.seek_diag_last_log = None;
            return;
        }

        let now = Instant::now();
        let should_log = decode_state
            .seek_diag_last_log
            .map(|last| now.duration_since(last) >= Duration::from_millis(200))
            .unwrap_or(true);
        if !should_log {
            return;
        }
        decode_state.seek_diag_last_log = Some(now);

        let played_now = state.played_samples_total.load(Ordering::Relaxed);
        let played_delta = played_now.saturating_sub(decode_state.seek_played_samples_snapshot);
        let queued_samples = state.queued_samples.load(Ordering::Relaxed);
        let current_pos = f64::from_bits(current_position.load(Ordering::Relaxed));
        let start_pts = f64::from_bits(state.start_audio_pts.load(Ordering::Relaxed));

        log::info!(
            "[audio][seek:{}][diag] elapsed_ms={} played_delta={} queued_samples={} start_pts={} current_pos={} duration={}",
            decode_state.seek_seq,
            elapsed.as_millis(),
            played_delta,
            queued_samples,
            start_pts,
            current_pos,
            duration
        );
    }
}

impl<E: EventEmitter> AudioPlaybackController for AudioPlayer<E> {
    type Command = PlayerCommand;

    fn command(&self, cmd: Self::Command) -> Result<(), String> {
        <AudioPlayer<E>>::command(self, cmd)
    }

    fn get_audio_clock(&self) -> f64 {
        <AudioPlayer<E>>::get_audio_clock(self)
    }

    fn get_volume(&self) -> f32 {
        <AudioPlayer<E>>::get_volume(self)
    }

    fn set_volume(&self, volume: f32) {
        <AudioPlayer<E>>::set_volume(self, volume);
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
