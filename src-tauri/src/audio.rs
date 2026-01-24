use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use bytemuck;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde_json::json;
use video_rs::ffmpeg::{
    self,
    format::sample::Type as SampleType,
    util::{channel_layout::ChannelLayout, format::Sample},
};
use tauri::Emitter;

use crate::events::EventEmitter;
use crate::video_player::PlayerCommand;

#[derive(Clone)]
struct SharedState {
    buffer: Arc<Mutex<VecDeque<f32>>>,
    playing_flag: Arc<AtomicBool>,
    volume: Arc<AtomicU32>,
    current_position: Arc<Mutex<f64>>,
    start_audio_pts: Arc<Mutex<f64>>,
    played_samples_total: Arc<AtomicU64>,
    output_channels: usize,
    output_sample_rate: u32,
    buffer_size: usize,
}

pub struct AudioPlayer<E: EventEmitter> {
    command_tx: mpsc::Sender<PlayerCommand>,
    handle: Option<thread::JoinHandle<()>>,
    volume: Arc<AtomicU32>,
    duration: f64,
    current_position: Arc<Mutex<f64>>,
    emit_state_events: bool,
    emitter: Option<E>,
}

impl<E: EventEmitter> AudioPlayer<E> {
    pub fn new(
        path: String,
        emit_state_events: bool,
        emitter: Option<E>,
    ) -> Result<Self, String> {
        let duration = Self::probe_duration(&path)?;
        let (command_tx, command_rx) = mpsc::channel();
        let volume = Arc::new(AtomicU32::new(f32::to_bits(1.0)));
        let current_position = Arc::new(Mutex::new(0.0));

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
            emit_state_events,
            emitter,
        })
    }

    pub fn command(&self, cmd: PlayerCommand) -> Result<(), String> {
        self.command_tx
            .send(cmd)
            .map_err(|e| format!("发送音频指令失败: {e}"))
    }

    pub fn get_duration(&self) -> f64 {
        self.duration
    }

    pub fn get_current_position(&self) -> f64 {
        *self.current_position.lock().unwrap()
    }

    pub fn get_audio_clock(&self) -> f64 {
        *self.current_position.lock().unwrap()
    }

    pub fn get_volume(&self) -> f32 {
        f32::from_bits(self.volume.load(Ordering::Relaxed))
    }

    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 1.5);
        self.volume.store(clamped.to_bits(), Ordering::Relaxed);
    }

    fn probe_duration(path: &str) -> Result<f64, String> {
        ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;
        let ictx = ffmpeg::format::input(path).map_err(|e| format!("打开音频文件失败: {}", e))?;

        let mut stream_duration = None;
        let mut format_duration = None;

        if let Some(audio_stream) = ictx.streams().best(ffmpeg::media::Type::Audio) {
            let tb = audio_stream.time_base();
            let dur_ts = audio_stream.duration();
            if dur_ts > 0 {
                let dur_secs = dur_ts as f64 * tb.numerator() as f64 / tb.denominator() as f64;
                stream_duration = Some(dur_secs);
            }
        }

        let fmt_dur = ictx.duration();
        if fmt_dur > 0 && fmt_dur != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
            format_duration = Some(fmt_dur as f64 / ffmpeg::ffi::AV_TIME_BASE as f64);
        }

        let final_duration = stream_duration.or(format_duration).unwrap_or(0.0);

        log::info!(
            "📊 文件时长信息: 流duration={:.3}s, 格式duration={:.3}s, 最终使用={:.3}s",
            stream_duration.unwrap_or(0.0),
            format_duration.unwrap_or(0.0),
            final_duration
        );

        Ok(final_duration)
    }

    fn spawn(
        path: String,
        command_rx: mpsc::Receiver<PlayerCommand>,
        volume: Arc<AtomicU32>,
        current_position: Arc<Mutex<f64>>,
        emit_state_events: bool,
        emitter: Option<E>,
        _duration_hint: f64,
    ) -> thread::JoinHandle<()> {
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
            let mut decoder = match Self::create_decoder(&audio_stream) {
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
            let mut resampler =
                match Self::create_resampler(&decoder, output_channels, output_sample_rate) {
                    Ok(r) => r,
                    Err(e) => {
                        log::error!("{e}");
                        return;
                    }
                };

            let state = Self::build_state(
                volume.clone(),
                current_position.clone(),
                output_sample_rate,
                output_channels,
            );

            let output_stream = match Self::build_output_stream(
                &device,
                &config,
                supported_config.sample_format(),
                &state,
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
            let mut samples_processed = 0u64;
            let mut decoded = ffmpeg::frame::Audio::empty();
            let mut resampled = ffmpeg::frame::Audio::empty();
            let mut last_position_update = Instant::now();
            let mut last_state_emit = Instant::now();

            loop {
                while let Ok(cmd) = command_rx.try_recv() {
                    match cmd {
                        PlayerCommand::Play => {
                            if completed {
                                packet_iter = None;
                                let _ = ictx.seek(0, ..);
                                decoder.flush();
                                let _ = resampler.flush(&mut resampled);
                                samples_processed = 0;
                                if let Ok(mut g) = state.buffer.lock() {
                                    g.clear();
                                }
                                *state.start_audio_pts.lock().unwrap() = 0.0;
                                completed = false;
                            }
                            playing = true;
                            state.playing_flag.store(true, Ordering::Relaxed);
                            if stream_started {
                                if let Err(e) = output_stream.play() {
                                    log::error!("恢复音频输出失败: {e}");
                                    playing = false;
                                    state.playing_flag.store(false, Ordering::Relaxed);
                                }
                            } else if let Err(e) = output_stream.play() {
                                log::error!("启动音频输出失败: {e}");
                                playing = false;
                                state.playing_flag.store(false, Ordering::Relaxed);
                            } else {
                                stream_started = true;
                            }
                        }
                        PlayerCommand::Pause => {
                            playing = false;
                            state.playing_flag.store(false, Ordering::Relaxed);
                            let _ = output_stream.pause();
                        }
                        PlayerCommand::Seek(target) => {
                            let was_playing = playing;
                            let ts = (target * ffmpeg::ffi::AV_TIME_BASE as f64) as i64;
                            let _ = output_stream.pause();
                            stream_started = false;
                            playing = false;
                            state.playing_flag.store(false, Ordering::Relaxed);
                            packet_iter = None;
                            if let Ok(mut g) = state.buffer.lock() {
                                g.clear();
                            }
                            samples_processed = 0;
                            *state.start_audio_pts.lock().unwrap() = target;
                            *current_position.lock().unwrap() = target;
                            decoder.flush();
                            let _ = resampler.flush(&mut resampled);
                            if ictx.seek(ts, audio_index as i64..).is_err() {
                                let _ = ictx.seek(ts, ..);
                            }
                            // 只有在跳转前处于播放状态时才恢复播放
                            if was_playing {
                                if let Err(e) = output_stream.play() {
                                    log::error!("跳转后启动音频流失败: {e}");
                                } else {
                                    stream_started = true;
                                    playing = true;
                                    state.playing_flag.store(true, Ordering::Relaxed);
                                }
                            }
                        }
                        PlayerCommand::Stop => {
                            state.playing_flag.store(false, Ordering::Relaxed);
                            let _ = output_stream.pause();
                            return;
                        }
                        PlayerCommand::AudioError(err) => {
                            log::error!("音频错误: {err}");
                        }
                    }
                }

                if !playing {
                    thread::sleep(Duration::from_millis(10));
                    if emit_state_events && last_state_emit.elapsed() >= Duration::from_millis(150)
                    {
                        if let Some(em) = &emitter {
                            let state_payload = json!({
                                "position": *current_position.lock().unwrap(),
                                "duration": duration,
                                "state": if playing { "playing" } else { "paused" },
                                "volume": f32::from_bits(volume.load(Ordering::Relaxed)),
                            });
                            em.emit("player-state-update", state_payload);
                        }
                        last_state_emit = Instant::now();
                    }
                    continue;
                }

                if packet_iter.is_none() {
                    packet_iter = Some(ictx.packets());
                }

                let Some(iter) = packet_iter.as_mut() else {
                    thread::sleep(Duration::from_millis(5));
                    continue;
                };

                let next = iter.next();
                if let Some((stream, packet)) = next {
                    if stream.index() != audio_index {
                        continue;
                    }

                    // 记录数据包信息，特别是接近结束时的数据包
                    let packet_pts_seconds = if let Some(pts) = packet.pts() {
                        let time_base = stream.time_base();
                        Some(
                            pts as f64 * time_base.numerator() as f64
                                / time_base.denominator() as f64,
                        )
                    } else {
                        None
                    };

                    if let Err(e) = decoder.send_packet(&packet) {
                        log::warn!("发送音频包失败: {e}");
                        continue;
                    }

                    loop {
                        match decoder.receive_frame(&mut decoded) {
                            Ok(_) => {
                                if let Some(pts) = decoded.pts() {
                                    let pts_secs = pts as f64 * time_base.numerator() as f64
                                        / time_base.denominator() as f64;
                                    let mut guard = state.start_audio_pts.lock().unwrap();
                                    if *guard == 0.0 || pts_secs < *guard {
                                        *guard = pts_secs;
                                    }
                                }

                                if let Err(err) = resampler.run(&decoded, &mut resampled) {
                                    log::warn!("重采样失败: {err}");
                                    continue;
                                }

                                let written =
                                    Self::append_frame(&state, &resampled, output_channels, true);
                                if written > 0 {
                                    let frames = written / output_channels;
                                    samples_processed += frames as u64;
                                }
                            }
                            Err(ffmpeg::Error::Other { errno })
                                if errno == ffmpeg::util::error::EAGAIN =>
                            {
                                break;
                            }
                            Err(ffmpeg::Error::Eof) => break,
                            Err(err) => {
                                log::warn!("接收音频帧失败: {err}");
                                break;
                            }
                        }
                    }
                } else {
                    decoder.flush();
                    let mut flush_frames_pts = Vec::new();

                    loop {
                        match decoder.receive_frame(&mut decoded) {
                            Ok(_) => {
                                // 记录 flush 后读取到的帧的 PTS
                                if let Some(pts) = decoded.pts() {
                                    let pts_secs = pts as f64 * time_base.numerator() as f64
                                        / time_base.denominator() as f64;
                                    flush_frames_pts.push(pts_secs);
                                }

                                if let Err(err) = resampler.run(&decoded, &mut resampled) {
                                    log::warn!("重采样失败: {err}");
                                    continue;
                                }
                                let written =
                                    Self::append_frame(&state, &resampled, output_channels, true);
                                if written > 0 {
                                    let frames = written / output_channels;
                                    samples_processed += frames as u64;
                                }
                            }
                            Err(ffmpeg::Error::Other { errno })
                                if errno == ffmpeg::util::error::EAGAIN =>
                            {
                                break
                            }
                            Err(ffmpeg::Error::Eof) => break,
                            Err(_) => break,
                        }
                    }

                    // 解码器帧读完后，flush 重采样器可能还会输出尾部数据
                    Self::flush_resampler_into_buffer(
                        &mut resampler,
                        &mut resampled,
                        &state,
                        output_channels,
                        &mut samples_processed,
                    );

                    let buffer_samples = state
                        .buffer
                        .lock()
                        .map(|g| g.len() / state.output_channels)
                        .unwrap_or(0);
                    if buffer_samples == 0 {
                        completed = true;
                        playing = false;
                        state.playing_flag.store(false, Ordering::Relaxed);
                        let _ = output_stream.pause();
                        stream_started = false; // 下次播放需要重新启动输出流
                        packet_iter = None; // 重置迭代器以便下次播放从头读取
                    }
                }

                if last_position_update.elapsed() >= Duration::from_millis(33) {
                    let buffer_samples = state
                        .buffer
                        .lock()
                        .map(|g| g.len() / state.output_channels)
                        .unwrap_or(0);
                    let start_pts = *state.start_audio_pts.lock().unwrap();
                    let current_pos = Self::current_position(
                        samples_processed,
                        buffer_samples,
                        state.output_sample_rate,
                        start_pts,
                        duration,
                    );
                    *current_position.lock().unwrap() = current_pos;
                    last_position_update = Instant::now();
                }

                if emit_state_events && last_state_emit.elapsed() >= Duration::from_millis(120) {
                    if let Some(em) = &emitter {
                        let state_payload = json!({
                            "position": *current_position.lock().unwrap(),
                            "duration": duration,
                            "state": "playing",
                            "volume": f32::from_bits(volume.load(Ordering::Relaxed)),
                        });
                        em.emit("player-state-update", state_payload);
                    }
                    last_state_emit = Instant::now();
                }
            }
        })
    }

    fn open_input(path: &str) -> Result<(ffmpeg::format::context::Input, f64), String> {
        ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;
        let ictx = ffmpeg::format::input(path).map_err(|e| format!("打开音频文件失败: {}", e))?;
        let duration = Self::probe_duration(path)?;
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
            .ok_or_else(|| "未找到音频流".to_string())?;
        let stream = ictx.stream(index).unwrap();
        let time_base = stream.time_base();
        Ok((index, stream, time_base))
    }

    fn create_decoder(
        stream: &ffmpeg::format::stream::Stream,
    ) -> Result<ffmpeg::decoder::Audio, String> {
        ffmpeg::codec::context::Context::from_parameters(stream.parameters())
            .and_then(|ctx| ctx.decoder().audio())
            .map_err(|e| format!("创建音频解码器失败: {e}"))
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
            .ok_or_else(|| "未找到默认音频输出设备".to_string())?;
        let supported = device
            .default_output_config()
            .map_err(|e| format!("获取默认音频配置失败: {e}"))?;
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
        let input_format = decoder.format();
        let input_layout = {
            let layout = decoder.channel_layout();
            if layout.is_empty() {
                ChannelLayout::default(decoder.channels() as i32)
            } else {
                layout
            }
        };
        let input_rate = decoder.rate() as u32;
        let output_layout = ChannelLayout::default(output_channels as i32);
        ffmpeg::software::resampling::context::Context::get(
            input_format,
            input_layout,
            input_rate,
            Sample::F32(SampleType::Packed),
            output_layout,
            output_sample_rate,
        )
        .map_err(|e| format!("创建重采样器失败: {e}"))
    }

    fn build_state(
        volume: Arc<AtomicU32>,
        current_position: Arc<Mutex<f64>>,
        output_sample_rate: u32,
        output_channels: usize,
    ) -> SharedState {
        let buffer_size = (output_sample_rate as usize * output_channels * 2).max(4096);
        SharedState {
            buffer: Arc::new(Mutex::new(VecDeque::with_capacity(buffer_size))),
            playing_flag: Arc::new(AtomicBool::new(false)),
            volume,
            current_position,
            start_audio_pts: Arc::new(Mutex::new(0.0)),
            played_samples_total: Arc::new(AtomicU64::new(0)),
            output_channels,
            output_sample_rate,
            buffer_size,
        }
    }

    fn build_output_stream(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        sample_format: cpal::SampleFormat,
        state: &SharedState,
    ) -> Result<cpal::Stream, String> {
        let buffer = state.buffer.clone();
        let playing = state.playing_flag.clone();
        let volume = state.volume.clone();
        let played_samples = state.played_samples_total.clone();
        let channels = state.output_channels;

        let err_fn = |err| log::error!("音频输出流错误: {err}");

        match sample_format {
            cpal::SampleFormat::F32 => device
                .build_output_stream(
                    config,
                    move |data: &mut [f32], _| {
                        let vol = f32::from_bits(volume.load(Ordering::Relaxed));
                        let is_playing = playing.load(Ordering::Relaxed);
                        let mut written_frames = 0u64;
                        data.fill(0.0);
                        if let Ok(mut guard) = buffer.lock() {
                            for chunk in data.chunks_mut(channels) {
                                if guard.len() < channels {
                                    break;
                                }
                                for dst in chunk.iter_mut() {
                                    if let Some(src) = guard.pop_front() {
                                        *dst = (src * vol).clamp(-1.0, 1.0);
                                    }
                                }
                                written_frames += 1;
                            }
                        }
                        if !is_playing {
                            data.fill(0.0);
                        }
                        if written_frames > 0 {
                            played_samples.fetch_add(written_frames, Ordering::Relaxed);
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("创建音频输出流失败: {e}")),
            cpal::SampleFormat::I16 => device
                .build_output_stream(
                    config,
                    move |data: &mut [i16], _| {
                        let vol = f32::from_bits(volume.load(Ordering::Relaxed));
                        let is_playing = playing.load(Ordering::Relaxed);
                        let mut written_frames = 0u64;
                        data.fill(0);
                        if let Ok(mut guard) = buffer.lock() {
                            for chunk in data.chunks_mut(channels) {
                                if guard.len() < channels {
                                    break;
                                }
                                for dst in chunk.iter_mut() {
                                    if let Some(src) = guard.pop_front() {
                                        *dst = (src * vol * i16::MAX as f32) as i16;
                                    }
                                }
                                written_frames += 1;
                            }
                        }
                        if !is_playing {
                            data.fill(0);
                        }
                        if written_frames > 0 {
                            played_samples.fetch_add(written_frames, Ordering::Relaxed);
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("创建音频输出流失败: {e}")),
            cpal::SampleFormat::U16 => device
                .build_output_stream(
                    config,
                    move |data: &mut [u16], _| {
                        let vol = f32::from_bits(volume.load(Ordering::Relaxed));
                        let is_playing = playing.load(Ordering::Relaxed);
                        let mut written_frames = 0u64;
                        data.fill(u16::MAX / 2);
                        if let Ok(mut guard) = buffer.lock() {
                            for chunk in data.chunks_mut(channels) {
                                if guard.len() < channels {
                                    break;
                                }
                                for dst in chunk.iter_mut() {
                                    if let Some(src) = guard.pop_front() {
                                        let scaled = ((src * vol).clamp(-1.0, 1.0) + 1.0) * 0.5;
                                        *dst = (scaled * u16::MAX as f32) as u16;
                                    }
                                }
                                written_frames += 1;
                            }
                        }
                        if !is_playing {
                            data.fill(u16::MAX / 2);
                        }
                        if written_frames > 0 {
                            played_samples.fetch_add(written_frames, Ordering::Relaxed);
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("创建音频输出流失败: {e}")),
            f => Err(format!("不支持的音频采样格式: {f:?}")),
        }
    }

    fn extract_samples(frame: &ffmpeg::frame::Audio, output_channels: usize) -> (Vec<f32>, usize) {
        let expected = frame.samples() * output_channels;
        let expected_bytes = expected * std::mem::size_of::<f32>();
        let raw = frame.data(0);
        let take = expected_bytes.min(raw.len());
        let samples: Vec<f32> = bytemuck::cast_slice(&raw[..take]).to_vec();
        (samples, expected)
    }

    fn append_frame(
        state: &SharedState,
        frame: &ffmpeg::frame::Audio,
        output_channels: usize,
        block_on_full: bool,
    ) -> usize {
        let (samples, _) = Self::extract_samples(frame, output_channels);
        let take_len = samples.len();
        if take_len == 0 {
            return 0;
        }

        loop {
            if let Ok(mut guard) = state.buffer.lock() {
                if guard.len() + take_len <= state.buffer_size {
                    guard.extend(samples.iter().cloned());
                    return take_len;
                }
            }

            if !block_on_full || !state.playing_flag.load(Ordering::Relaxed) {
                return 0;
            }

            thread::sleep(Duration::from_millis(1));
        }
    }

    fn flush_resampler_into_buffer(
        resampler: &mut ffmpeg::software::resampling::context::Context,
        resampled: &mut ffmpeg::frame::Audio,
        state: &SharedState,
        output_channels: usize,
        samples_processed: &mut u64,
    ) {
        if let Err(err) = resampler.flush(resampled) {
            log::warn!("重采样 flush 失败: {err}");
            return;
        }
        if resampled.samples() == 0 {
            return;
        }
        let written = Self::append_frame(state, resampled, output_channels, true);
        if written > 0 {
            *samples_processed += (written / output_channels) as u64;
        }
    }

    fn current_position(
        samples_processed: u64,
        buffer_samples: usize,
        output_sample_rate: u32,
        start_audio_pts: f64,
        duration: f64,
    ) -> f64 {
        let played = samples_processed.saturating_sub(buffer_samples as u64);
        let relative = played as f64 / output_sample_rate as f64;
        let pos = start_audio_pts + relative;
        pos.min(duration).max(0.0)
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
