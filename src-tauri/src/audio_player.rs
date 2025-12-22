use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use bytemuck;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use video_rs::ffmpeg::{
    self,
    format::sample::Type as SampleType,
    util::error::EAGAIN,
    util::{channel_layout::ChannelLayout, format::Sample},
};

use crate::video_player::PlayerCommand;

pub struct AudioPlayer {
    command_tx: mpsc::Sender<PlayerCommand>,
    handle: Option<thread::JoinHandle<()>>,
    volume: Arc<AtomicU32>,
    duration: Arc<Mutex<f64>>,
    current_position: Arc<Mutex<f64>>,
    /// 音频主时钟：基于实际播放的样本数计算
    audio_clock: Arc<Mutex<f64>>,
}

impl AudioPlayer {
    pub fn new(path: String) -> Result<Self, String> {
        // 先获取音频时长（在创建线程之前）
        let audio_duration = {
            ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;
            let ictx =
                ffmpeg::format::input(&path).map_err(|e| format!("打开音频文件失败: {}", e))?;
            let dur_raw = ictx.duration();
            // 检查 duration 是否有效（AV_NOPTS_VALUE 通常是 i64::MIN）
            let dur = if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
                dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
            } else {
                // 如果 duration 无效，尝试从音频流获取
                log::warn!("格式 duration 无效，尝试从音频流获取");
                if let Some(audio_stream) = ictx.streams().best(ffmpeg::media::Type::Audio) {
                    let time_base = audio_stream.time_base();
                    let duration_ts = audio_stream.duration();
                    if duration_ts > 0 {
                        duration_ts as f64 * time_base.numerator() as f64
                            / time_base.denominator() as f64
                    } else {
                        0.0
                    }
                } else {
                    0.0
                }
            };
            log::debug!("音频时长（初始化）: {} 秒", dur);
            dur
        };

        let (command_tx, command_rx) = mpsc::channel();
        let volume = Arc::new(AtomicU32::new(f32::to_bits(1.0)));
        let duration = Arc::new(Mutex::new(audio_duration));
        let current_position = Arc::new(Mutex::new(0.0));
        let audio_clock = Arc::new(Mutex::new(0.0));
        let handle = Some(Self::spawn_thread(
            path,
            command_rx,
            volume.clone(),
            duration.clone(),
            current_position.clone(),
            audio_clock.clone(),
        ));
        Ok(Self {
            command_tx,
            handle,
            volume,
            duration,
            current_position,
            audio_clock,
        })
    }

    pub fn get_duration(&self) -> f64 {
        *self.duration.lock().unwrap()
    }

    pub fn get_current_position(&self) -> f64 {
        *self.current_position.lock().unwrap()
    }

    /// 获取音频主时钟（基于实际播放的样本数）
    /// 这是视频同步的基准时钟
    pub fn get_audio_clock(&self) -> f64 {
        *self.audio_clock.lock().unwrap()
    }

    pub fn command(&self, cmd: PlayerCommand) -> Result<(), String> {
        self.command_tx
            .send(cmd)
            .map_err(|e| format!("发送音频指令失败: {e}"))
    }

    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 1.5);
        self.volume.store(clamped.to_bits(), Ordering::Relaxed);
    }

    fn spawn_thread(
        path: String,
        command_rx: mpsc::Receiver<PlayerCommand>,
        volume: Arc<AtomicU32>,
        duration: Arc<Mutex<f64>>,
        current_position: Arc<Mutex<f64>>,
        audio_clock: Arc<Mutex<f64>>,
    ) -> thread::JoinHandle<()> {
        thread::spawn(move || {
            // 初始化 FFmpeg
            if let Err(e) = ffmpeg::init() {
                log::error!("FFmpeg 初始化失败: {}", e);
                return;
            }

            // 打开音频文件
            let mut ictx = match ffmpeg::format::input(&path) {
                Ok(ctx) => ctx,
                Err(err) => {
                    log::error!("打开音频文件失败: {err}");
                    return;
                }
            };

            // 获取音频时长
            let audio_duration = {
                let dur_raw = ictx.duration();
                let dur = if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
                    dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
                } else {
                    // 如果 duration 无效，尝试从音频流获取
                    log::warn!("格式 duration 无效，尝试从音频流获取");
                    if let Some(audio_stream) = ictx.streams().best(ffmpeg::media::Type::Audio) {
                        let time_base = audio_stream.time_base();
                        let duration_ts = audio_stream.duration();
                        if duration_ts > 0 {
                            duration_ts as f64 * time_base.numerator() as f64
                                / time_base.denominator() as f64
                        } else {
                            0.0
                        }
                    } else {
                        0.0
                    }
                };
                let mut dur_guard = duration.lock().unwrap();
                if *dur_guard == 0.0 {
                    *dur_guard = dur;
                }
                *dur_guard
            };
            log::info!(
                "🎵 音频时长: {:.2} 秒 (原始 duration: {})",
                audio_duration,
                ictx.duration()
            );

            // 查找音频流
            let audio_stream_index = match ictx
                .streams()
                .best(ffmpeg::media::Type::Audio)
                .map(|s| s.index())
            {
                Some(idx) => idx,
                None => {
                    log::warn!("未找到音频流");
                    return;
                }
            };

            let audio_stream = ictx.stream(audio_stream_index).unwrap();
            let audio_time_base = audio_stream.time_base(); // 获取音频流的时间基
            log::debug!("音频流时间基: {:?}", audio_time_base);
            let codec_params = audio_stream.parameters();
            let mut decoder = match ffmpeg::codec::context::Context::from_parameters(codec_params)
                .and_then(|ctx| ctx.decoder().audio())
            {
                Ok(dec) => dec,
                Err(err) => {
                    log::error!("创建音频解码器失败: {err}");
                    return;
                }
            };

            // 获取音频设备配置
            let host = cpal::default_host();
            let device = match host.default_output_device() {
                Some(d) => d,
                None => {
                    log::error!("未找到默认音频输出设备");
                    return;
                }
            };

            let supported_config = match device.default_output_config() {
                Ok(cfg) => cfg,
                Err(err) => {
                    log::error!("获取默认音频配置失败: {err}");
                    return;
                }
            };

            let config = supported_config.config();
            let output_sample_rate = config.sample_rate.0;
            let output_channels = config.channels as usize;
            log::debug!(
                "音频设备配置: sample_rate={}, channels={}, format={:?}",
                output_sample_rate,
                output_channels,
                supported_config.sample_format()
            );

            // 准备输入格式和布局
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

            // 准备输出格式和布局
            let output_layout = if output_channels > 0 {
                ChannelLayout::default(output_channels as i32)
            } else {
                ChannelLayout::STEREO
            };

            // 创建重采样器
            let mut resampler = match ffmpeg::software::resampling::context::Context::get(
                input_format,
                input_layout,
                input_rate,
                Sample::F32(SampleType::Packed),
                output_layout,
                output_sample_rate,
            ) {
                Ok(r) => r,
                Err(err) => {
                    log::error!("创建音频重采样器失败: {err}");
                    return;
                }
            };

            // 创建音频缓冲区
            let buffer_size = (output_sample_rate as usize * output_channels * 2).max(4096); // 至少2秒的缓冲区
            let buffer: Arc<Mutex<VecDeque<f32>>> =
                Arc::new(Mutex::new(VecDeque::with_capacity(buffer_size)));
            let buffer_for_stream = buffer.clone();
            let playing_flag = Arc::new(AtomicBool::new(false));
            let playing_for_stream = playing_flag.clone();
            let volume_for_stream = volume.clone();

            // 音频时钟相关：跟踪实际播放的样本数和起始 PTS
            let audio_clock_for_stream = audio_clock.clone();
            let start_audio_pts = Arc::new(Mutex::new(0.0_f64)); // 播放起始位置的 PTS（秒），用于计算音频时钟
            let start_audio_pts_for_stream = start_audio_pts.clone();
            let played_samples_total = Arc::new(AtomicU64::new(0)); // 实际送进设备的样本总数（单通道）
            let played_samples_total_for_stream = played_samples_total.clone();

            let err_fn = |err| log::error!("音频输出流错误: {err}");

            // 创建音频输出流（参考 audio.rs 的实现）
            let output_stream = match supported_config.sample_format() {
                cpal::SampleFormat::F32 => {
                    let buffer_clone = buffer_for_stream.clone();
                    let playing_clone = playing_for_stream.clone();
                    let volume_clone = volume_for_stream.clone();
                    let audio_clock_clone = audio_clock_for_stream.clone();
                    let start_pts_clone = start_audio_pts_for_stream.clone();
                    let played_samples_clone = played_samples_total_for_stream.clone();
                    let sample_rate = output_sample_rate as f64;
                    match device.build_output_stream(
                        &config,
                        move |data: &mut [f32], _| {
                            let vol = f32::from_bits(volume_clone.load(Ordering::Relaxed));
                            let is_playing = playing_clone.load(Ordering::Relaxed);
                            let mut samples_played_this_call = 0u64;

                            if let Ok(mut guard) = buffer_clone.lock() {
                                let mut filled = 0;
                                for sample in data.iter_mut() {
                                    if let Some(s) = guard.pop_front() {
                                        *sample = (s * vol).clamp(-1.0, 1.0);
                                        filled += 1;
                                        samples_played_this_call += 1;
                                    } else {
                                        break;
                                    }
                                }
                                // 如果缓冲区数据不足，填充静音
                                if !is_playing || filled < data.len() {
                                    data[filled..].fill(0.0);
                                }
                            } else {
                                data.fill(0.0);
                            }

                            // 更新音频时钟：实际播放的样本数（单通道）
                            if is_playing && samples_played_this_call > 0 {
                                let samples_played_single_channel =
                                    samples_played_this_call / output_channels as u64;
                                let total_played = played_samples_clone
                                    .fetch_add(samples_played_single_channel, Ordering::Relaxed)
                                    + samples_played_single_channel;

                                // audio_clock = start_audio_pts + played_samples / sample_rate
                                // 这是正确的公式：起始位置 + 已播放的时间
                                if let Ok(start_pts) = start_pts_clone.lock() {
                                    let clock = *start_pts + (total_played as f64 / sample_rate);
                                    if let Ok(mut clock_guard) = audio_clock_clone.lock() {
                                        *clock_guard = clock;
                                    }
                                }
                            }
                        },
                        err_fn,
                        None,
                    ) {
                        Ok(stream) => stream,
                        Err(err) => {
                            log::error!("创建音频输出流失败: {err}");
                            return;
                        }
                    }
                }
                cpal::SampleFormat::I16 => {
                    let buffer_clone = buffer_for_stream.clone();
                    let playing_clone = playing_for_stream.clone();
                    let volume_clone = volume_for_stream.clone();
                    match device.build_output_stream(
                        &config,
                        move |data: &mut [i16], _| {
                            let vol = f32::from_bits(volume_clone.load(Ordering::Relaxed));
                            let is_playing = playing_clone.load(Ordering::Relaxed);
                            if let Ok(mut guard) = buffer_clone.lock() {
                                let mut filled = 0;
                                for sample in data.iter_mut() {
                                    if let Some(s) = guard.pop_front() {
                                        let scaled = (s * vol).clamp(-1.0, 1.0);
                                        *sample = (scaled * i16::MAX as f32) as i16;
                                        filled += 1;
                                    } else {
                                        break;
                                    }
                                }
                                // 如果缓冲区数据不足，填充静音
                                if !is_playing || filled < data.len() {
                                    data[filled..].fill(0);
                                }
                            } else {
                                data.fill(0);
                            }
                        },
                        err_fn,
                        None,
                    ) {
                        Ok(stream) => stream,
                        Err(err) => {
                            log::error!("创建音频输出流失败: {err}");
                            return;
                        }
                    }
                }
                cpal::SampleFormat::U16 => {
                    let buffer_clone = buffer_for_stream.clone();
                    let playing_clone = playing_for_stream.clone();
                    let volume_clone = volume_for_stream.clone();
                    match device.build_output_stream(
                        &config,
                        move |data: &mut [u16], _| {
                            let vol = f32::from_bits(volume_clone.load(Ordering::Relaxed));
                            let is_playing = playing_clone.load(Ordering::Relaxed);
                            if let Ok(mut guard) = buffer_clone.lock() {
                                let mut filled = 0;
                                for sample in data.iter_mut() {
                                    if let Some(s) = guard.pop_front() {
                                        let scaled = (s * vol).clamp(-1.0, 1.0);
                                        *sample = (((scaled + 1.0) * 0.5) * u16::MAX as f32) as u16;
                                        filled += 1;
                                    } else {
                                        break;
                                    }
                                }
                                // 如果缓冲区数据不足，填充静音
                                if !is_playing || filled < data.len() {
                                    data[filled..].fill(u16::MAX / 2);
                                }
                            } else {
                                data.fill(u16::MAX / 2);
                            }
                        },
                        err_fn,
                        None,
                    ) {
                        Ok(stream) => stream,
                        Err(err) => {
                            log::error!("创建音频输出流失败: {err}");
                            return;
                        }
                    }
                }
                sample_format => {
                    log::warn!("不支持的音频采样格式: {:?}", sample_format);
                    return;
                }
            };

            // 不立即启动音频流，等待用户点击播放
            // 这样可以确保在播放前有足够的数据填充到缓冲区
            let mut stream_started = false;

            // 播放状态
            let mut playing = false;
            let mut packet_iter = ictx.packets();
            let mut completed = false;
            let mut samples_processed = 0u64; // 已处理的样本数
            let mut last_position_update = std::time::Instant::now();

            let mut decoded = ffmpeg::frame::Audio::empty();
            let mut resampled = ffmpeg::frame::Audio::empty();

            loop {
                // 处理命令
                while let Ok(cmd) = command_rx.try_recv() {
                    match cmd {
                        PlayerCommand::Play => {
                            if completed {
                                // 重新开始
                                let _ = ictx.seek(0, ..);
                                decoder.flush();
                                resampler.flush(&mut resampled);
                                packet_iter = ictx.packets();
                                // 清空缓冲区
                                if let Ok(mut guard) = buffer.lock() {
                                    guard.clear();
                                }
                                samples_processed = 0;
                                *current_position.lock().unwrap() = 0.0;
                                completed = false;
                                stream_started = false;
                            }
                            playing = true;
                            playing_flag.store(true, Ordering::Relaxed);

                            // 如果流已经启动但被暂停了，恢复播放
                            if stream_started {
                                if let Err(err) = output_stream.play() {
                                    log::error!("恢复音频输出流失败: {err}");
                                    playing = false;
                                    playing_flag.store(false, Ordering::Relaxed);
                                } else {
                                    log::debug!("音频流已恢复播放");
                                }
                            } else {
                                // 如果流还没启动，先预填充缓冲区再启动
                                // 预填充至少0.1秒的音频数据（约10%的缓冲区）
                                let min_prefill_samples =
                                    (output_sample_rate as usize * output_channels / 10)
                                        .max(buffer_size / 10);
                                log::debug!("开始预填充，最小样本数: {}", min_prefill_samples);

                                let mut prefill_samples = 0;

                                // 预填充循环（直接使用 packet_iter）
                                while prefill_samples < min_prefill_samples {
                                    let next_packet = packet_iter.next();
                                    let Some((packet_stream, packet)) = next_packet else {
                                        break;
                                    };

                                    if packet_stream.index() != audio_stream_index {
                                        continue;
                                    }

                                    if decoder.send_packet(&packet).is_ok() {
                                        loop {
                                            match decoder.receive_frame(&mut decoded) {
                                                Ok(_) => {
                                                    if resampler
                                                        .run(&decoded, &mut resampled)
                                                        .is_ok()
                                                    {
                                                        // 注意：Audio::plane() 返回的切片大小可能不正确
                                                        // 重采样后的数据应该匹配输出通道数
                                                        let expected_samples =
                                                            resampled.samples() * output_channels;
                                                        let expected_bytes = expected_samples
                                                            * std::mem::size_of::<f32>();
                                                        let raw_data = resampled.data(0);
                                                        let take_bytes =
                                                            expected_bytes.min(raw_data.len());
                                                        let samples: &[f32] = bytemuck::cast_slice(
                                                            &raw_data[..take_bytes],
                                                        );
                                                        let take_len = samples.len();

                                                        if let Ok(mut guard) = buffer.lock() {
                                                            // 预填充阶段，如果缓冲区满了就停止
                                                            if guard.len() + take_len > buffer_size
                                                            {
                                                                break;
                                                            }
                                                            guard.extend(
                                                                samples[..take_len].iter().cloned(),
                                                            );
                                                            prefill_samples += take_len;
                                                        }
                                                    }
                                                }
                                                Err(ffmpeg::Error::Other { errno })
                                                    if errno == EAGAIN =>
                                                {
                                                    break;
                                                }
                                                Err(_) => break,
                                            }
                                        }
                                    }

                                    if prefill_samples >= min_prefill_samples {
                                        break;
                                    }
                                }

                                // 检查预填充是否足够
                                let buffer_len = buffer.lock().map(|g| g.len()).unwrap_or(0);
                                if buffer_len >= min_prefill_samples {
                                    // 启动音频流
                                    if let Err(err) = output_stream.play() {
                                        log::error!("启动音频输出流失败: {err}");
                                        playing = false;
                                        playing_flag.store(false, Ordering::Relaxed);
                                    } else {
                                        stream_started = true;
                                        log::info!("✅ 音频流已启动（预填充完成），缓冲区大小: {} (最小: {})", buffer_len, min_prefill_samples);
                                    }
                                } else {
                                    log::warn!(
                                        "⚠️ 预填充不足，缓冲区大小: {} (需要: {})，但继续播放",
                                        buffer_len,
                                        min_prefill_samples
                                    );
                                    // 即使预填充不足，也启动流（避免卡住）
                                    if let Err(err) = output_stream.play() {
                                        log::error!("启动音频输出流失败: {err}");
                                        playing = false;
                                        playing_flag.store(false, Ordering::Relaxed);
                                    } else {
                                        stream_started = true;
                                    }
                                }
                            }
                            log::debug!("播放命令");
                        }
                        PlayerCommand::Pause => {
                            playing = false;
                            playing_flag.store(false, Ordering::Relaxed);
                            if stream_started {
                                let _ = output_stream.pause();
                            }
                            log::debug!("暂停命令");
                        }
                        PlayerCommand::Seek(target) => {
                            // seek 需要的时间戳单位是 AV_TIME_BASE（微秒），不是毫秒
                            let ts = (target * ffmpeg::ffi::AV_TIME_BASE as f64) as i64;
                            log::debug!("跳转到位置: {} 秒，时间戳: {}", target, ts);

                            // 先暂停流和清空缓冲区
                            let was_playing = playing;
                            if stream_started {
                                let _ = output_stream.pause();
                                stream_started = false;
                            }
                            if let Ok(mut guard) = buffer.lock() {
                                guard.clear();
                            }

                            // 重置音频时钟相关状态
                            played_samples_total.store(0, Ordering::Relaxed);
                            if let Ok(mut guard) = start_audio_pts.lock() {
                                *guard = target; // 设置新的起始 PTS
                            }
                            if let Ok(mut guard) = audio_clock.lock() {
                                *guard = target; // 重置音频时钟
                            }

                            // 执行 seek，指定到音频流
                            // seek 的 range 参数需要 i64 类型，且不支持 RangeInclusive
                            // 使用 audio_stream_index as i64.. 来从音频流开始跳转
                            let stream_idx = audio_stream_index as i64;
                            if let Err(err) = ictx.seek(ts, stream_idx..) {
                                log::error!("跳转失败（指定流）: {}", err);
                                // 如果 seek 失败，尝试不使用流索引限制
                                if let Err(err2) = ictx.seek(ts, ..) {
                                    log::error!("跳转失败（无流限制）: {}", err2);
                                }
                            }

                            // 刷新解码器和重采样器
                            decoder.flush();
                            resampler.flush(&mut resampled);

                            // 重新获取数据包迭代器（从 seek 后的位置开始）
                            packet_iter = ictx.packets();

                            // 更新样本数和位置
                            samples_processed = (target * output_sample_rate as f64) as u64;
                            *current_position.lock().unwrap() = target;
                            completed = false;

                            log::debug!(
                                "跳转完成，samples_processed: {}, 位置: {} 秒",
                                samples_processed,
                                target
                            );

                            // 如果之前正在播放，需要重新预填充并启动
                            if was_playing {
                                playing = true; // 保持播放状态
                                playing_flag.store(true, Ordering::Relaxed);

                                // 立即开始预填充
                                let min_prefill_samples =
                                    (output_sample_rate as usize * output_channels / 10)
                                        .max(buffer_size / 10);
                                log::debug!(
                                    "跳转后开始预填充，最小样本数: {}",
                                    min_prefill_samples
                                );

                                let mut prefill_samples = 0;

                                // 预填充循环
                                while prefill_samples < min_prefill_samples {
                                    let next_packet = packet_iter.next();
                                    let Some((packet_stream, packet)) = next_packet else {
                                        // 数据包迭代器提前结束，尝试 flush 解码器获取剩余帧
                                        log::debug!(
                                            "跳转后预填充时数据包迭代器结束，尝试 flush 获取剩余帧"
                                        );
                                        decoder.flush();
                                        resampler.flush(&mut resampled);

                                        // 尝试读取剩余帧
                                        let mut found_flush_frames = false;
                                        loop {
                                            match decoder.receive_frame(&mut decoded) {
                                                Ok(_) => {
                                                    found_flush_frames = true;
                                                    if resampler
                                                        .run(&decoded, &mut resampled)
                                                        .is_ok()
                                                    {
                                                        let expected_samples =
                                                            resampled.samples() * output_channels;
                                                        let expected_bytes = expected_samples
                                                            * std::mem::size_of::<f32>();
                                                        let raw_data = resampled.data(0);
                                                        let take_bytes =
                                                            expected_bytes.min(raw_data.len());
                                                        let samples: &[f32] = bytemuck::cast_slice(
                                                            &raw_data[..take_bytes],
                                                        );
                                                        let take_len = samples.len();

                                                        if let Ok(mut guard) = buffer.lock() {
                                                            if guard.len() + take_len <= buffer_size
                                                            {
                                                                guard.extend(
                                                                    samples[..take_len]
                                                                        .iter()
                                                                        .cloned(),
                                                                );
                                                                prefill_samples += take_len;
                                                            }
                                                        }
                                                    }
                                                }
                                                Err(ffmpeg::Error::Other { errno })
                                                    if errno == EAGAIN =>
                                                {
                                                    break;
                                                }
                                                Err(_) => break,
                                            }
                                        }

                                        if found_flush_frames {
                                            log::debug!(
                                                "跳转后 flush 找到 {} 样本",
                                                prefill_samples
                                            );
                                        }

                                        break;
                                    };

                                    if packet_stream.index() != audio_stream_index {
                                        continue;
                                    }

                                    if decoder.send_packet(&packet).is_ok() {
                                        loop {
                                            match decoder.receive_frame(&mut decoded) {
                                                Ok(_) => {
                                                    if resampler
                                                        .run(&decoded, &mut resampled)
                                                        .is_ok()
                                                    {
                                                        let expected_samples =
                                                            resampled.samples() * output_channels;
                                                        let expected_bytes = expected_samples
                                                            * std::mem::size_of::<f32>();
                                                        let raw_data = resampled.data(0);
                                                        let take_bytes =
                                                            expected_bytes.min(raw_data.len());
                                                        let samples: &[f32] = bytemuck::cast_slice(
                                                            &raw_data[..take_bytes],
                                                        );
                                                        let take_len = samples.len();

                                                        if let Ok(mut guard) = buffer.lock() {
                                                            if guard.len() + take_len > buffer_size
                                                            {
                                                                break;
                                                            }
                                                            guard.extend(
                                                                samples[..take_len].iter().cloned(),
                                                            );
                                                            prefill_samples += take_len;
                                                        }
                                                    }
                                                }
                                                Err(ffmpeg::Error::Other { errno })
                                                    if errno == EAGAIN =>
                                                {
                                                    break;
                                                }
                                                Err(_) => break,
                                            }
                                        }
                                    }

                                    if prefill_samples >= min_prefill_samples {
                                        break;
                                    }
                                }

                                // 检查预填充是否足够并启动流
                                let buffer_len = buffer.lock().map(|g| g.len()).unwrap_or(0);
                                if buffer_len >= min_prefill_samples {
                                    if let Err(err) = output_stream.play() {
                                        log::error!("跳转后启动音频输出流失败: {err}");
                                        playing = false;
                                        playing_flag.store(false, Ordering::Relaxed);
                                    } else {
                                        stream_started = true;
                                        log::info!(
                                            "✅ 跳转后音频流已启动，缓冲区大小: {}",
                                            buffer_len
                                        );
                                    }
                                } else {
                                    log::warn!("⚠️ 跳转后预填充不足，缓冲区大小: {} (需要: {})，但继续播放", buffer_len, min_prefill_samples);
                                    if let Err(err) = output_stream.play() {
                                        log::error!("跳转后启动音频输出流失败: {err}");
                                        playing = false;
                                        playing_flag.store(false, Ordering::Relaxed);
                                    } else {
                                        stream_started = true;
                                    }
                                }
                            } else {
                                // 如果之前没有播放，只是跳转位置，不需要启动流
                                playing = false;
                                playing_flag.store(false, Ordering::Relaxed);
                            }

                            log::debug!("跳转命令完成: {} 秒", target);
                        }
                        PlayerCommand::Stop => {
                            playing_flag.store(false, Ordering::Relaxed);
                            // 清空缓冲区
                            if let Ok(mut guard) = buffer.lock() {
                                guard.clear();
                            }
                            if stream_started {
                                let _ = output_stream.pause();
                            }
                            return;
                        }
                        PlayerCommand::AudioError(err) => {
                            log::error!("音频错误: {}", err);
                            playing_flag.store(false, Ordering::Relaxed);
                        }
                    }
                }

                if !playing {
                    thread::sleep(Duration::from_millis(10));
                    continue;
                }

                // 处理数据包
                let next_packet = packet_iter.next();

                let Some((packet_stream, packet)) = next_packet else {
                    // 数据包迭代器返回 None，但在进入 flush 逻辑之前
                    // 先确保最后一个数据包的所有帧都已经从解码器读取出来
                    // 因为最后一个数据包发送后，可能还有帧在解码器缓冲区中
                    // log::debug!("数据包迭代器返回 None，先尝试读取解码器中可能残留的帧（最后一个数据包的帧）");

                    // 尝试读取最后一个数据包的残留帧（不 flush）
                    let mut found_last_packet_frames = false;
                    loop {
                        match decoder.receive_frame(&mut decoded) {
                            Ok(_) => {
                                found_last_packet_frames = true;
                                log::debug!("发现最后一个数据包的残留帧");
                                // 处理这个帧
                                if resampler.run(&decoded, &mut resampled).is_ok() {
                                    let expected_samples =
                                        resampled.samples() * resampled.channels() as usize;
                                    let expected_bytes =
                                        expected_samples * std::mem::size_of::<f32>();
                                    let raw_data = resampled.data(0);
                                    let take_bytes = expected_bytes.min(raw_data.len());
                                    let samples: &[f32] =
                                        bytemuck::cast_slice(&raw_data[..take_bytes]);
                                    let take_len = samples.len();

                                    if let Ok(mut guard) = buffer.lock() {
                                        if guard.len() + take_len <= buffer_size {
                                            guard.extend(samples[..take_len].iter().cloned());
                                            let frames_added = take_len / output_channels;
                                            samples_processed += frames_added as u64;
                                        }
                                    }
                                }
                            }
                            Err(ffmpeg::Error::Other { errno }) if errno == EAGAIN => {
                                break;
                            }
                            Err(_) => break,
                        }
                    }

                    if found_last_packet_frames {
                        log::info!("✅ 处理了最后一个数据包的残留帧，继续检查是否还有数据包");
                        continue; // 继续循环，看看是否还有数据包（虽然不太可能）
                    }
                    // 没有更多数据包，但解码器可能还有未处理的帧
                    // 重要：在 flush 之前，先尝试读取解码器中可能残留的帧
                    // 因为最后一个数据包发送后，可能还有帧在解码器缓冲区中
                    let current_pos_before_flush = {
                        let clock = *audio_clock.lock().unwrap();
                        if clock > 0.0 {
                            clock.min(audio_duration)
                        } else {
                            let buffer_samples = buffer
                                .lock()
                                .map(|guard| guard.len() / output_channels)
                                .unwrap_or(0);
                            let played_samples =
                                samples_processed.saturating_sub(buffer_samples as u64);
                            played_samples as f64 / output_sample_rate as f64
                        }
                    };
                    // log::info!(
                    //     "📦 数据包迭代器结束，当前位置: {:.2}s / {:.2}s (进度: {:.1}%)，已处理样本: {}，缓冲区: {} 样本",
                    //     current_pos_before_flush,
                    //     audio_duration,
                    //     if audio_duration > 0.0 { current_pos_before_flush / audio_duration * 100.0 } else { 0.0 },
                    //     samples_processed,
                    //     buffer.lock().map(|g| g.len() / output_channels).unwrap_or(0)
                    // );
                    // log::debug!("数据包迭代器结束，先尝试读取解码器中残留的帧");

                    // 先尝试读取可能残留的帧（不 flush）
                    let mut found_residual_frames = false;
                    loop {
                        match decoder.receive_frame(&mut decoded) {
                            Ok(_) => {
                                found_residual_frames = true;
                                log::debug!("数据包迭代器结束前，发现解码器中还有残留帧");
                                // 处理这个帧
                                if resampler.run(&decoded, &mut resampled).is_ok() {
                                    let expected_samples =
                                        resampled.samples() * resampled.channels() as usize;
                                    let expected_bytes =
                                        expected_samples * std::mem::size_of::<f32>();
                                    let raw_data = resampled.data(0);
                                    let take_bytes = expected_bytes.min(raw_data.len());
                                    let samples: &[f32] =
                                        bytemuck::cast_slice(&raw_data[..take_bytes]);
                                    let take_len = samples.len();

                                    if let Ok(mut guard) = buffer.lock() {
                                        if guard.len() + take_len <= buffer_size {
                                            guard.extend(samples[..take_len].iter().cloned());
                                            let frames_added = take_len / output_channels;
                                            samples_processed += frames_added as u64;
                                        }
                                    }
                                }
                            }
                            Err(ffmpeg::Error::Other { errno }) if errno == EAGAIN => {
                                break;
                            }
                            Err(_) => break,
                        }
                    }

                    if found_residual_frames {
                        log::info!("✅ 数据包迭代器结束前，处理了残留帧，继续检查是否还有数据包");
                        continue; // 继续循环，看看是否还有数据包
                    }

                    // 如果没有残留帧，再 flush 解码器和重采样器，确保所有缓冲的帧都被输出
                    let buffer_before_flush = buffer
                        .lock()
                        .map(|g| g.len() / output_channels)
                        .unwrap_or(0);
                    let samples_before_flush = samples_processed;
                    let clock_before_flush = *audio_clock.lock().unwrap();
                    log::info!(
                        "🔄 数据包迭代器结束，开始 flush: 缓冲区={} 样本, 已处理样本={}, 音频时钟={:.2}s",
                        buffer_before_flush,
                        samples_before_flush,
                        clock_before_flush
                    );
                    decoder.flush();
                    resampler.flush(&mut resampled);

                    // 继续从解码器中读取剩余的帧
                    // 可能需要多次循环才能读取完所有帧
                    let mut has_more_frames = false;
                    let mut flush_iteration = 0;
                    loop {
                        flush_iteration += 1;
                        match decoder.receive_frame(&mut decoded) {
                            Ok(_) => {
                                has_more_frames = true;
                                log::debug!("Flush 后读取到帧 (迭代 {})", flush_iteration);
                                // 重采样
                                if let Err(err) = resampler.run(&decoded, &mut resampled) {
                                    log::error!("音频重采样失败: {err}");
                                    continue;
                                }

                                // 将重采样后的数据放入缓冲区
                                let expected_samples =
                                    resampled.samples() * resampled.channels() as usize;
                                let expected_bytes = expected_samples * std::mem::size_of::<f32>();
                                let raw_data = resampled.data(0);
                                let take_bytes = expected_bytes.min(raw_data.len());
                                let samples: &[f32] = bytemuck::cast_slice(&raw_data[..take_bytes]);
                                let take_len = samples.len();

                                // 如果缓冲区满了，等待空间
                                let mut wait_count = 0;
                                loop {
                                    if let Ok(mut guard) = buffer.lock() {
                                        if guard.len() + take_len <= buffer_size {
                                            guard.extend(samples[..take_len].iter().cloned());
                                            break;
                                        }
                                        drop(guard);
                                    }
                                    thread::sleep(Duration::from_millis(1));
                                    wait_count += 1;
                                    if wait_count > 1000 {
                                        log::error!("缓冲区等待超时，跳过这一帧");
                                        break;
                                    }
                                }

                                // 更新已处理的样本数
                                let frames_added = take_len / output_channels;
                                samples_processed += frames_added as u64;
                            }
                            Err(ffmpeg::Error::Other { errno }) if errno == EAGAIN => {
                                //log::debug!("Flush 后读取完成 (EAGAIN)，迭代 {}", flush_iteration);
                                break;
                            }
                            Err(ffmpeg::Error::Eof) => {
                                // EOF 表示解码器没有更多数据
                                log::debug!("Flush 后读取完成 (EOF)，迭代 {}", flush_iteration);
                                break;
                            }
                            Err(err) => {
                                log::error!("接收音频帧失败: {err}");
                                break;
                            }
                        }
                    }

                    let samples_after_flush = samples_processed;
                    let current_pos_after_flush = {
                        let clock = *audio_clock.lock().unwrap();
                        if clock > 0.0 {
                            clock.min(audio_duration)
                        } else {
                            let buffer_samples = buffer
                                .lock()
                                .map(|guard| guard.len() / output_channels)
                                .unwrap_or(0);
                            let played_samples =
                                samples_processed.saturating_sub(buffer_samples as u64);
                            played_samples as f64 / output_sample_rate as f64
                        }
                    };

                    let buffer_after_flush = buffer
                        .lock()
                        .map(|g| g.len() / output_channels)
                        .unwrap_or(0);
                    let samples_added_by_flush = samples_after_flush - samples_before_flush;
                    if has_more_frames {
                        log::info!(
                            "✅ Flush 后处理了 {} 帧，新增样本={}, 当前位置: {:.2}s / {:.2}s，已处理样本: {}，缓冲区: {} 样本，继续循环",
                            flush_iteration,
                            samples_added_by_flush,
                            current_pos_after_flush,
                            audio_duration,
                            samples_after_flush,
                            buffer_after_flush
                        );
                    } else {
                        log::info!(
                            "⚠️ Flush 后没有更多帧，新增样本={}, 当前位置: {:.2}s / {:.2}s，已处理样本: {}，缓冲区: {} 样本，进入等待缓冲区播放逻辑",
                            samples_added_by_flush,
                            current_pos_after_flush,
                            audio_duration,
                            samples_after_flush,
                            buffer_after_flush
                        );
                    }

                    // 如果刚才处理了更多帧，继续循环处理数据包
                    if has_more_frames {
                        continue;
                    }

                    // 没有更多数据包，也没有更多帧了
                    if playing {
                        // 检查缓冲区是否还有数据
                        let buffer_samples = buffer
                            .lock()
                            .map(|guard| guard.len() / output_channels)
                            .unwrap_or(0);

                        // 计算预期应该有的缓冲区样本数
                        let expected_samples = (audio_duration * output_sample_rate as f64) as u64;
                        let clock_pos = *audio_clock.lock().unwrap();
                        let expected_buffer_samples = if clock_pos > 0.0 {
                            expected_samples
                                .saturating_sub(((clock_pos * output_sample_rate as f64) as u64))
                        } else {
                            buffer_samples as u64
                        };

                        log::info!(
                            "📈 数据包迭代器结束后的状态: 已处理样本={}, 预期总样本={}, 缓冲区样本={}, 预期缓冲区样本={}, 音频时钟={:.2}s, 总时长={:.2}s, 差异={} 样本",
                            samples_processed,
                            expected_samples,
                            buffer_samples,
                            expected_buffer_samples,
                            clock_pos,
                            audio_duration,
                            expected_buffer_samples.saturating_sub(buffer_samples as u64)
                        );

                        // 优先使用音频时钟（基于实际播放的样本数），更精确
                        // 如果音频时钟不可用，回退到 samples_processed - buffer_samples
                        let current_pos = {
                            let clock = *audio_clock.lock().unwrap();
                            if clock > 0.0 {
                                clock.min(audio_duration)
                            } else {
                                // 回退到基于 samples_processed 的计算
                                let played_samples =
                                    samples_processed.saturating_sub(buffer_samples as u64);
                                let pos = played_samples as f64 / output_sample_rate as f64;
                                pos.min(audio_duration)
                            }
                        };
                        *current_position.lock().unwrap() = current_pos;

                        // 计算播放进度百分比
                        let progress_ratio = if audio_duration > 0.0 {
                            current_pos / audio_duration
                        } else {
                            1.0
                        };

                        if buffer_samples == 0 {
                            // 缓冲区已空，检查是否真的播放完成
                            let clock_pos = *audio_clock.lock().unwrap();
                            // log::info!(
                            //     "🔍 播放完成检查: 位置={:.2}s / {:.2}s (进度={:.1}%)，音频时钟={:.2}s，已处理样本={}，缓冲区={} 样本",
                            //     current_pos,
                            //     audio_duration,
                            //     progress_ratio * 100.0,
                            //     clock_pos,
                            //     samples_processed,
                            //     buffer_samples
                            // );

                            // 使用更严格的判断：只有当音频时钟或计算位置真正接近总时长时才完成
                            // 同时检查 samples_processed 是否接近预期值
                            let expected_samples =
                                (audio_duration * output_sample_rate as f64) as u64;
                            let samples_ratio = if expected_samples > 0 {
                                samples_processed as f64 / expected_samples as f64
                            } else {
                                0.0
                            };

                            if (progress_ratio >= 0.99 || current_pos >= audio_duration * 0.99)
                                && (samples_ratio >= 0.99
                                    || samples_processed
                                        >= expected_samples
                                            .saturating_sub(output_sample_rate as u64))
                            {
                                // 位置接近总时长（99%以上），播放完成
                                completed = true;
                                playing = false;
                                playing_flag.store(false, Ordering::Relaxed);
                                *current_position.lock().unwrap() = audio_duration;
                                log::info!(
                                    "✅ 音频播放完成，位置: {:.2}s / {:.2}s (进度: {:.1}%)，样本比例: {:.1}% (已处理: {} / 预期: {})",
                                    current_pos,
                                    audio_duration,
                                    progress_ratio * 100.0,
                                    samples_ratio * 100.0,
                                    samples_processed,
                                    expected_samples
                                );
                                if stream_started {
                                    let _ = output_stream.pause();
                                    stream_started = false;
                                }
                            } else {
                                // 缓冲区为空但位置未到总时长，可能是数据包提前结束
                                // 这可能是文件损坏、seek 问题或其他错误
                                // log::warn!(
                                //     "⚠️ 数据包提前结束，位置: {:.2}s / {:.2}s (进度: {:.1}%)，样本比例: {:.1}% (已处理: {} / 预期: {})，缓冲区: {} 样本，音频时钟: {:.2}s",
                                //     current_pos,
                                //     audio_duration,
                                //     progress_ratio * 100.0,
                                //     samples_ratio * 100.0,
                                //     samples_processed,
                                //     expected_samples,
                                //     buffer_samples,
                                //     clock_pos
                                // );
                                // 继续等待，看看是否还有数据
                                // 如果长时间没有数据，可能需要报告错误
                            }
                        } else {
                            // 缓冲区还有数据，继续更新位置并等待播放
                            // 在等待期间，位置应该基于音频时钟持续更新
                            // 音频时钟会在 cpal 回调中持续更新，反映实际播放进度
                            let clock_pos = *audio_clock.lock().unwrap();
                            log::debug!(
                                "等待缓冲区播放，位置: {:.2}s / {:.2}s (进度: {:.1}%)，缓冲区: {} 样本, 音频时钟: {:.2}s",
                                current_pos,
                                audio_duration,
                                progress_ratio * 100.0,
                                buffer_samples,
                                clock_pos
                            );
                        }
                    }
                    thread::sleep(Duration::from_millis(10));
                    continue;
                };

                if packet_stream.index() != audio_stream_index {
                    continue;
                }

                // 发送数据包到解码器
                // 记录数据包的 PTS 用于调试
                let packet_pts_seconds = if let Some(pts) = packet.pts() {
                    Some(
                        pts as f64 * audio_time_base.numerator() as f64
                            / audio_time_base.denominator() as f64,
                    )
                } else {
                    None
                };

                if let Some(pts_seconds) = packet_pts_seconds {
                    if pts_seconds > audio_duration * 0.95 {
                        log::debug!(
                            "📦 处理接近结尾的数据包: PTS={:.2}s (位置: {:.2}s / {:.2}s)",
                            pts_seconds,
                            pts_seconds,
                            audio_duration
                        );
                    }
                }

                if let Err(err) = decoder.send_packet(&packet) {
                    log::error!("发送音频包失败: {err}");
                    continue;
                }

                // 接收解码后的帧
                // 注意：每次 send_packet 后，必须循环读取所有帧直到 EAGAIN
                // 这确保最后一个数据包的所有帧都被处理
                let mut frames_from_packet = 0;
                let mut samples_from_packet = 0u64;
                loop {
                    match decoder.receive_frame(&mut decoded) {
                        Ok(_) => {
                            frames_from_packet += 1;
                            // 更新起始音频帧的 PTS（用于音频时钟计算）
                            // 只在第一次解码时设置，或者当 start_audio_pts 为 0 时设置
                            if let Some(pts) = decoded.pts() {
                                let pts_seconds = pts as f64 * audio_time_base.numerator() as f64
                                    / audio_time_base.denominator() as f64;
                                if let Ok(mut guard) = start_audio_pts.lock() {
                                    // 只在起始 PTS 为 0 或小于当前 PTS 时更新（确保是第一个帧）
                                    if *guard == 0.0 || pts_seconds < *guard {
                                        *guard = pts_seconds;
                                    }
                                }
                            }

                            // 重采样
                            if let Err(err) = resampler.run(&decoded, &mut resampled) {
                                log::error!("音频重采样失败: {err}");
                                continue;
                            }

                            // 将重采样后的数据放入缓冲区
                            // 注意：Audio::plane() 返回的切片大小可能不正确，需要手动计算
                            // 参考 audio.rs 中的注释：https://github.com/zmwangx/rust-ffmpeg/pull/104
                            let expected_samples =
                                resampled.samples() * resampled.channels() as usize;
                            let expected_bytes = expected_samples * std::mem::size_of::<f32>();

                            // 使用 data(0) 获取原始数据，然后手动切片
                            let raw_data = resampled.data(0);
                            let take_bytes = expected_bytes.min(raw_data.len());
                            let samples: &[f32] = bytemuck::cast_slice(&raw_data[..take_bytes]);
                            let take_len = samples.len();

                            // 如果缓冲区满了，等待空间而不是丢弃数据
                            // 这样可以确保所有数据都能被播放
                            let mut wait_count = 0;
                            loop {
                                if let Ok(mut guard) = buffer.lock() {
                                    if guard.len() + take_len <= buffer_size {
                                        // 有空间了，写入数据
                                        guard.extend(samples[..take_len].iter().cloned());
                                        break;
                                    }
                                    // 缓冲区满了，释放锁并等待
                                    drop(guard);
                                }

                                // 检查播放状态，如果未播放则不需要等待
                                if !playing_flag.load(Ordering::Relaxed) {
                                    // 播放已停止，跳出等待循环
                                    break;
                                }

                                // 等待一小段时间让音频流消费数据
                                thread::sleep(Duration::from_millis(1));
                                wait_count += 1;

                                // 如果等待太多次，说明播放可能有问题
                                if wait_count > 100 {
                                    // 等待超过100ms，记录警告但继续等待
                                    if wait_count % 100 == 0 {
                                        log::warn!("缓冲区满，等待中... (已等待 {}ms)", wait_count);
                                    }
                                }

                                // 防止无限等待（最多等待1秒）
                                if wait_count > 1000 {
                                    log::error!("缓冲区等待超时，可能播放有问题，跳过这一帧");
                                    break;
                                }
                            }

                            // 更新已处理的样本数（单通道样本数）
                            let frames_added = take_len / output_channels;
                            samples_processed += frames_added as u64;
                            samples_from_packet += frames_added as u64;

                            // 更新位置（每100ms更新一次，减少锁竞争）
                            // 优先使用音频时钟（基于实际播放的样本数），更精确
                            if last_position_update.elapsed().as_millis() >= 100 {
                                let buffer_samples = buffer
                                    .lock()
                                    .map(|guard| guard.len() / output_channels)
                                    .unwrap_or(0);

                                // 优先使用音频时钟
                                let current_pos = {
                                    let clock = *audio_clock.lock().unwrap();
                                    if clock > 0.0 {
                                        clock.min(audio_duration)
                                    } else {
                                        // 回退到基于 samples_processed 的计算
                                        let played_samples =
                                            samples_processed.saturating_sub(buffer_samples as u64);
                                        let pos = played_samples as f64 / output_sample_rate as f64;
                                        pos.min(audio_duration)
                                    }
                                };

                                *current_position.lock().unwrap() = current_pos;
                                last_position_update = std::time::Instant::now();
                                log::debug!(
                                    "位置更新: {:.2}s / {:.2}s, 缓冲区: {} 样本, 已处理: {} 样本, 音频时钟: {:.2}s",
                                    current_pos,
                                    audio_duration,
                                    buffer_samples,
                                    samples_processed,
                                    *audio_clock.lock().unwrap()
                                );
                            }
                        }
                        Err(ffmpeg::Error::Other { errno }) if errno == EAGAIN => {
                            break;
                        }
                        Err(ffmpeg::Error::Eof) => {
                            // EOF 表示解码器没有更多数据，但缓冲区可能还有数据在播放
                            break;
                        }
                        Err(err) => {
                            log::error!("接收音频帧失败: {err}");
                            break;
                        }
                    }
                }

                // 记录最后一个数据包的处理情况
                if let Some(pts_seconds) = packet_pts_seconds {
                    if pts_seconds > audio_duration * 0.95 {
                        let buffer_samples = buffer
                            .lock()
                            .map(|g| g.len() / output_channels)
                            .unwrap_or(0);
                        let clock_pos = *audio_clock.lock().unwrap();
                        log::info!(
                            "📊 数据包处理完成: PTS={:.2}s, 帧数={}, 样本数={}, 总已处理样本={}, 缓冲区={} 样本, 音频时钟={:.2}s",
                            pts_seconds,
                            frames_from_packet,
                            samples_from_packet,
                            samples_processed,
                            buffer_samples,
                            clock_pos
                        );
                    }
                }
            }
        })
    }
}

impl Drop for AudioPlayer {
    fn drop(&mut self) {
        let _ = self.command(PlayerCommand::Stop);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}
