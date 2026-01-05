use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

use serde_json::json;
use video_rs::ffmpeg::Rational;
use video_rs::frame::RawFrame;
use video_rs::{Decoder, DecoderBuilder, Error as VideoError, Resize};

use crate::audio::AudioPlayer;

const FRAME_EMIT_INTERVAL_MS: u64 = 66; // ~15 FPS to reduce UI pressure

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PlaybackState {
    Stopped,
    Playing,
    Paused,
}

pub enum PlayerCommand {
    Play,
    Pause,
    Stop,
    Seek(f64),
    /// 内部使用：音频模块初始化失败时回报
    AudioError(String),
}

#[derive(Serialize, Clone)]
struct FramePayload {
    width: u32,
    height: u32,
    data: Vec<u8>,
}

pub struct VideoPlayer {
    command_tx: mpsc::Sender<PlayerCommand>,
    state: Arc<Mutex<PlaybackState>>,
    current_position: Arc<Mutex<f64>>,
    duration: f64,
    width: u32,
    height: u32,
    playback_thread: Option<thread::JoinHandle<()>>,
    audio_player: Option<Arc<AudioPlayer>>,
    has_started: Arc<AtomicBool>,
    source_path: String,
}

#[derive(Debug, Deserialize, Clone, Copy)]
pub struct PreviewSize {
    pub width: u32,
    pub height: u32,
}

impl VideoPlayer {
    pub fn new(
        path: &str,
        window: tauri::WebviewWindow,
        preview: Option<PreviewSize>,
    ) -> Result<Self, String> {
        video_rs::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;

        let decoder_builder = DecoderBuilder::new(Path::new(path));
        let decoder_builder = if let Some(p) = preview {
            if p.width > 0 && p.height > 0 {
                decoder_builder.with_resize(Resize::FitEven(p.width, p.height))
            } else {
                decoder_builder
            }
        } else {
            decoder_builder
        };

        let decoder = decoder_builder
            .build()
            .map_err(|e| format!("创建解码器失败: {}", e))?;
        let (width, height) = decoder.size_out();
        let duration = decoder
            .duration()
            .map(|t| t.as_secs_f64())
            .unwrap_or(0.0_f64);
        log::debug!("视频时长（初始化）: {} 秒", duration);
        let state = Arc::new(Mutex::new(PlaybackState::Stopped));
        let current_position = Arc::new(Mutex::new(0.0_f64));
        let (command_tx, command_rx) = mpsc::channel();
        let has_started = Arc::new(AtomicBool::new(false));
        let audio_player = AudioPlayer::new(path.to_string(), false, None)
            .ok()
            .map(|ap| Arc::new(ap));

        let playback_thread = Some(Self::spawn_playback(
            decoder,
            window,
            command_rx,
            state.clone(),
            current_position.clone(),
            audio_player.clone(),
            duration,
            path.to_string(),
            preview,
        ));

        Ok(Self {
            command_tx,
            state,
            current_position,
            duration,
            width,
            height,
            playback_thread,
            audio_player,
            has_started,
            source_path: path.to_string(),
        })
    }

    pub fn start_playback(&mut self) -> Result<(), String> {
        self.has_started.store(true, Ordering::Relaxed);
        self.command_tx
            .send(PlayerCommand::Play)
            .map_err(|e| format!("启动播放线程失败: {}", e))?;
        if let Some(audio) = &self.audio_player {
            let _ = audio.command(PlayerCommand::Play);
        }
        *self.state.lock().unwrap() = PlaybackState::Playing;
        Ok(())
    }

    pub fn pause(&self) {
        let _ = self.command_tx.send(PlayerCommand::Pause);
        if let Some(audio) = &self.audio_player {
            let _ = audio.command(PlayerCommand::Pause);
        }
        *self.state.lock().unwrap() = PlaybackState::Paused;
    }

    pub fn resume(&self) {
        let current_state = *self.state.lock().unwrap();
        // 如果当前是停止状态且从未启动过，需要先启动播放
        if current_state == PlaybackState::Stopped && !self.has_started.load(Ordering::Relaxed) {
            let _ = self.command_tx.send(PlayerCommand::Play);
            if let Some(audio) = &self.audio_player {
                let _ = audio.command(PlayerCommand::Play);
            }
            self.has_started.store(true, Ordering::Relaxed);
            *self.state.lock().unwrap() = PlaybackState::Playing;
        } else {
            let _ = self.command_tx.send(PlayerCommand::Play);
            if let Some(audio) = &self.audio_player {
                let _ = audio.command(PlayerCommand::Play);
            }
            *self.state.lock().unwrap() = PlaybackState::Playing;
        }
    }

    pub fn stop(&mut self) {
        let _ = self.command_tx.send(PlayerCommand::Stop);
        if let Some(audio) = &self.audio_player {
            let _ = audio.command(PlayerCommand::Stop);
        }
        *self.state.lock().unwrap() = PlaybackState::Stopped;
        if let Some(handle) = self.playback_thread.take() {
            let _ = handle.join();
        }
        self.audio_player = None;
    }

    pub fn seek(&mut self, position: f64) -> Result<(), String> {
        self.command_tx
            .send(PlayerCommand::Seek(position))
            .map_err(|e| format!("发送跳转指令失败: {}", e))?;
        if let Some(audio) = &self.audio_player {
            let _ = audio.command(PlayerCommand::Seek(position));
        }
        Ok(())
    }

    pub fn get_current_position(&self) -> f64 {
        *self.current_position.lock().unwrap()
    }

    pub fn get_duration(&self) -> f64 {
        self.duration
    }

    pub fn size(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    pub fn set_volume(&self, volume: f32) {
        if let Some(audio) = &self.audio_player {
            audio.set_volume(volume);
        }
    }

    fn spawn_playback(
        mut decoder: Decoder,
        window: tauri::WebviewWindow,
        command_rx: mpsc::Receiver<PlayerCommand>,
        state: Arc<Mutex<PlaybackState>>,
        current_position: Arc<Mutex<f64>>,
        audio_player: Option<Arc<AudioPlayer>>,
        duration: f64,
        source_path: String,
        target_size: Option<PreviewSize>,
    ) -> thread::JoinHandle<()> {
        thread::spawn(move || {
            let mut time_base = decoder.time_base();
            let (raw_width, raw_height) = decoder.size_out();
            let (mut frame_width, mut frame_height) = match target_size {
                Some(p) if p.width > 0 && p.height > 0 => {
                    let scale = (p.width as f64 / raw_width as f64)
                        .min(p.height as f64 / raw_height as f64)
                        .min(1.0);
                    (
                        (raw_width as f64 * scale) as u32,
                        (raw_height as f64 * scale) as u32,
                    )
                }
                _ => (raw_width, raw_height),
            };
            let mut playing = false;
            let mut wall_clock_anchor: Option<Instant> = None; // 保留作为后备，但优先使用音频时钟
            let frame_emit_interval = Duration::from_millis(FRAME_EMIT_INTERVAL_MS);
            let mut last_emit = Instant::now() - frame_emit_interval;
            // 平滑后的音频时钟，减少抖动
            let mut smoothed_audio_clock: Option<f64> = None;
            let mut completed = false;
            let mut last_frame_skipped = false; // 用于跟踪是否跳过了上一帧
            let mut last_state_emit = Instant::now();
            let mut final_state_sent = false;

            loop {
                while let Ok(cmd) = command_rx.try_recv() {
                    match cmd {
                        PlayerCommand::AudioError(err) => {
                            let _ = window.emit("video-error", format!("音频初始化失败: {err}"));
                        }
                        PlayerCommand::Play => {
                            // 重置平滑音频时钟，避免上次结束时的尾值影响重新播放
                            smoothed_audio_clock = None;
                            if completed {
                                // 重新从头播放：重新创建解码器，避免 drain 状态无法继续解码
                                match DecoderBuilder::new(Path::new(&source_path))
                                    .with_resize(
                                        target_size
                                            .and_then(|p| {
                                                if p.width > 0 && p.height > 0 {
                                                    Some(Resize::FitEven(p.width, p.height))
                                                } else {
                                                    None
                                                }
                                            })
                                    .unwrap_or_else(|| {
                                        Resize::FitEven(frame_width, frame_height)
                                    }),
                            )
                            .build()
                        {
                                    Ok(new_decoder) => {
                                        decoder = new_decoder;
                                        time_base = decoder.time_base();
                                        (frame_width, frame_height) = decoder.size_out();
                                        *current_position.lock().unwrap() = 0.0;
                                        completed = false;
                                        last_frame_skipped = false;
                                        last_emit = Instant::now() - frame_emit_interval;
                                    }
                                    Err(err) => {
                                        log::error!("重建视频解码器失败: {err}");
                                    }
                                }
                                // 音频也回到开头，保持同步
                                if let Some(ap) = &audio_player {
                                    let _ = ap.command(PlayerCommand::Seek(0.0));
                                }
                            }
                            completed = false;
                            final_state_sent = false;
                            playing = true;
                            *state.lock().unwrap() = PlaybackState::Playing;
                            let anchor = Instant::now()
                                - Duration::from_secs_f64(*current_position.lock().unwrap());
                            wall_clock_anchor = Some(anchor);
                        }
                        PlayerCommand::Pause => {
                            playing = false;
                            *state.lock().unwrap() = PlaybackState::Paused;
                            wall_clock_anchor = None;
                        }
                        PlayerCommand::Seek(target) => {
                            log::debug!("跳转视频目标位置: {target}");
                            let clamped = target.min((duration - 0.5).max(0.0)).max(0.0);
                            if let Err(err) = decoder.seek((clamped * 1000.0) as i64) {
                                log::error!(
                                    "跳转视频失败: {err} (target={target}, clamped={clamped})"
                                );
                                // 视为到达结尾，统一状态，暂停音频
                                *current_position.lock().unwrap() = duration;
                                *state.lock().unwrap() = PlaybackState::Stopped;
                                if let Some(ap) = &audio_player {
                                    let _ = ap.command(PlayerCommand::Pause);
                                    let _ = ap.command(PlayerCommand::Seek(duration));
                                }
                                let _ = window.emit("video-complete", "播放完成");
                                completed = true;
                                final_state_sent = false;
                                playing = false;
                                wall_clock_anchor = None;
                                continue;
                            }
                            *current_position.lock().unwrap() = clamped;
                            completed = false;
                            final_state_sent = false;
                            if playing {
                                let anchor = Instant::now()
                                    - Duration::from_secs_f64(*current_position.lock().unwrap());
                                wall_clock_anchor = Some(anchor);
                            }
                        }
                        PlayerCommand::Stop => {
                            *state.lock().unwrap() = PlaybackState::Stopped;
                            return;
                        }
                    }
                }

                if last_state_emit.elapsed() >= Duration::from_millis(120) {
                    if completed && final_state_sent {
                        last_state_emit = Instant::now();
                        continue;
                    }
                    let position = *current_position.lock().unwrap();
                    let state_val = *state.lock().unwrap();
                    let state_str = match state_val {
                        PlaybackState::Playing => "playing",
                        PlaybackState::Paused => "paused",
                        PlaybackState::Stopped => "stopped",
                    };
                    let volume = audio_player
                        .as_ref()
                        .map(|ap| ap.get_volume())
                        .unwrap_or(1.0);
                    let payload = json!({
                        "position": position,
                        "duration": duration,
                        "state": state_str,
                        "volume": volume,
                    });
                    let _ = window.emit("player-state-update", payload);
                    last_state_emit = Instant::now();
                    if completed {
                        final_state_sent = true;
                    }
                }

                if !playing {
                    thread::sleep(Duration::from_millis(10));
                    continue;
                }

                match decoder.decode_raw() {
                    Ok(frame) => {
                        let pts_secs = frame_timestamp_secs(&frame, time_base);
                        *current_position.lock().unwrap() = pts_secs;

                        // 优先使用音频时钟进行同步
                        let raw_audio_clock = audio_player
                            .as_ref()
                            .map(|ap| ap.get_audio_clock())
                            .unwrap_or_else(|| {
                                // 如果没有音频播放器，使用视频 PTS + 单调时钟作为主时钟
                                // 主时钟 = 起始视频 PTS + (当前单调时钟 - 开始播放时的单调时钟)
                                if let Some(anchor) = wall_clock_anchor {
                                    // anchor 已经设置为：Instant::now() - current_position
                                    // 所以 anchor.elapsed() 就是：当前时间 - (开始时间 - 起始PTS) = 当前时间 - 开始时间 + 起始PTS
                                    // 这正好等于：起始PTS + elapsed_time
                                    anchor.elapsed().as_secs_f64()
                                } else {
                                    // 如果还没有设置 anchor（比如暂停后恢复），使用当前帧的 PTS
                                    // 这种情况不应该发生，但作为安全后备
                                    pts_secs
                                }
                            });
                        // 简单一阶低通，减少音频时钟跳变导致的大幅校正
                        let audio_clock = match smoothed_audio_clock {
                            Some(prev) => {
                                let alpha = 0.2; // 保守平滑系数
                                let smoothed = prev + alpha * (raw_audio_clock - prev);
                                smoothed_audio_clock = Some(smoothed);
                                smoothed
                            }
                            None => {
                                smoothed_audio_clock = Some(raw_audio_clock);
                                raw_audio_clock
                            }
                        };

                        // 计算视频帧与音频时钟的差值
                        let diff = pts_secs - audio_clock;

                        // 同步策略：
                        // - diff > +30ms: 视频提前，小幅等待（上限1帧时间）
                        // - diff < -30ms: 视频落后，尝试丢少量帧追赶
                        // - |diff| <= 30ms: 正常显示
                        if diff > 0.03 {
                            let sleep_dur = diff.min(0.03); // 不超过一帧时间，避免长时间停顿
                            thread::sleep(Duration::from_secs_f64(sleep_dur));
                            last_frame_skipped = false;
                        } else if diff < -0.03 {
                            // 视频落后 > 30ms，丢帧追赶
                            if !last_frame_skipped {
                                log::debug!("视频落后音频 {:.2}ms，丢帧追赶", diff * 1000.0);
                            }
                            last_frame_skipped = true;
                            continue; // 跳过当前帧，解码下一帧
                        } else {
                            // 正常显示
                            last_frame_skipped = false;
                        }

                        let payload = FramePayload {
                            width: frame_width,
                            height: frame_height,
                            data: frame_to_rgba(&frame, frame_width, frame_height),
                        };

                        if last_emit.elapsed() >= frame_emit_interval {
                            if let Err(err) = window.emit("video-frame", payload) {
                                log::error!("发送视频帧事件失败: {err}");
                            } else {
                                last_emit = Instant::now();
                            }
                        }
                    }
                    Err(VideoError::DecodeExhausted) | Err(VideoError::ReadExhausted) => {
                        if !completed {
                            log::debug!(
                                "视频解码到达结尾: current_position={:.3}s, duration={:.3}s",
                                *current_position.lock().unwrap(),
                                duration
                            );
                            *state.lock().unwrap() = PlaybackState::Stopped;
                            *current_position.lock().unwrap() = duration;
                            let _ = window.emit("video-complete", "播放完成");
                            completed = true;
                            final_state_sent = false;
                            // 将平滑时钟钉在视频总时长，避免结束后 diff 继续为负导致额外丢帧/等待
                            smoothed_audio_clock = Some(
                                self::frame_timestamp_secs(&RawFrame::empty(), time_base)
                                    .max(*current_position.lock().unwrap()),
                            );
                            if let Some(ap) = &audio_player {
                                let _ = ap.command(PlayerCommand::Pause);
                                let _ = ap.command(PlayerCommand::Seek(duration));
                            }
                        }
                        playing = false;
                        wall_clock_anchor = None;
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(err) => {
                        *state.lock().unwrap() = PlaybackState::Stopped;
                        let _ = window.emit("video-error", format!("视频解码失败: {err}"));
                        log::error!("视频解码失败: {err}");
                        return;
                    }
                }
            }
        })
    }
}

impl Drop for VideoPlayer {
    fn drop(&mut self) {
        self.stop();
    }
}

fn frame_timestamp_secs(frame: &RawFrame, time_base: Rational) -> f64 {
    frame
        .timestamp()
        .or_else(|| frame.pts())
        .map(|pts| pts as f64 * (time_base.numerator() as f64 / time_base.denominator() as f64))
        .unwrap_or(0.0)
}

fn frame_to_rgba(frame: &RawFrame, width: u32, height: u32) -> Vec<u8> {
    let stride = frame.stride(0);
    let data = frame.data(0);
    let width = width as usize;
    let height = height as usize;

    let mut rgba = Vec::with_capacity(width * height * 4);

    for row in 0..height {
        let offset = row * stride;
        let row_len = width
            .saturating_mul(3)
            .min(data.len().saturating_sub(offset));
        if row_len < width * 3 {
            break;
        }
        let row_data = &data[offset..offset + row_len];
        for chunk in row_data.chunks_exact(3) {
            rgba.extend_from_slice(&[chunk[0], chunk[1], chunk[2], 255]);
        }
    }

    rgba
}
