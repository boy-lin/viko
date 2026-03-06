use serde::Deserialize;
use std::marker::PhantomData;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::events::EventEmitter;
use crate::media_common::player_control::DynAudioPlaybackController;
use crate::services::player::audio::create_video_audio_player;
use crate::services::player::video_utils;
use tauri::ipc::{Channel, InvokeResponseBody};

use video_rs::frame::RawFrame;
use video_rs::{Decoder, Error as VideoError};

const FRAME_EMIT_INTERVAL_MS: u64 = 66; // ~15 FPS to reduce UI pressure
const IDLE_SLEEP_MS: u64 = 10;
const PAUSED_WAIT_MS: u64 = 120;
const AV_SYNC_TOLERANCE_SEC: f64 = 0.03;
type LoopState = video_utils::PlaybackLoopState;
type Runtime<E> = video_utils::PlaybackRuntime<E>;
pub type FrameChannel = Channel<InvokeResponseBody>;

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
    /// Internal: audio init failure propagated to video thread.
    AudioError(String),
}

pub struct VideoPlayer<E: EventEmitter> {
    command_tx: mpsc::Sender<PlayerCommand>,
    state: Arc<Mutex<PlaybackState>>,
    current_position: Arc<Mutex<f64>>,
    duration: f64,
    width: u32,
    height: u32,
    playback_thread: Option<thread::JoinHandle<()>>,
    audio_player: Option<Arc<DynAudioPlaybackController<PlayerCommand>>>,
    has_started: Arc<AtomicBool>,
    _marker: PhantomData<E>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
pub struct PreviewSize {
    pub width: u32,
    pub height: u32,
}

impl<E: EventEmitter> VideoPlayer<E> {
    fn frame_byte_capacity(loop_state: &LoopState) -> usize {
        (loop_state.frame_width as usize)
            .saturating_mul(loop_state.frame_height as usize)
            .saturating_mul(4)
    }

    fn send_audio_command(
        audio_player: Option<&Arc<DynAudioPlaybackController<PlayerCommand>>>,
        cmd: PlayerCommand,
    ) {
        if let Some(audio) = audio_player {
            let _ = audio.command(cmd);
        }
    }

    fn set_state(state: &Arc<Mutex<PlaybackState>>, playback_state: PlaybackState) {
        *state.lock().unwrap() = playback_state;
    }

    fn get_state(state: &Arc<Mutex<PlaybackState>>) -> PlaybackState {
        *state.lock().unwrap()
    }

    fn get_position(current_position: &Arc<Mutex<f64>>) -> f64 {
        *current_position.lock().unwrap()
    }

    fn set_position(current_position: &Arc<Mutex<f64>>, position: f64) {
        *current_position.lock().unwrap() = position;
    }

    pub fn new(path: &str, emitter: E, preview: Option<PreviewSize>) -> Result<Self, String> {
        Self::new_with_channel(path, emitter, preview, None)
    }

    pub fn new_with_channel(
        path: &str,
        emitter: E,
        preview: Option<PreviewSize>,
        frame_channel: Option<FrameChannel>,
    ) -> Result<Self, String> {
        video_rs::init().map_err(|e| format!("FFmpeg init failed: {}", e))?;
        let decoder = video_utils::build_decoder_with_preview(path, preview)?;
        let (width, height) = decoder.size_out();
        let duration = decoder
            .duration()
            .map(|t| t.as_secs_f64())
            .unwrap_or(0.0_f64);
        log::debug!("Video duration (init): {}s", duration);
        let state = Arc::new(Mutex::new(PlaybackState::Stopped));
        let current_position = Arc::new(Mutex::new(0.0_f64));
        let (command_tx, command_rx) = mpsc::channel();
        let has_started = Arc::new(AtomicBool::new(false));
        let audio_player = create_video_audio_player::<E>(path);

        let playback_thread = Some(Self::spawn_playback(
            decoder,
            emitter,
            command_rx,
            state.clone(),
            current_position.clone(),
            audio_player.clone(),
            frame_channel,
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
            _marker: PhantomData,
        })
    }

    pub fn start_playback(&mut self) -> Result<(), String> {
        self.has_started.store(true, Ordering::Relaxed);
        self.command_tx
            .send(PlayerCommand::Play)
            .map_err(|e| format!("Failed to start playback thread: {}", e))?;
        Self::send_audio_command(self.audio_player.as_ref(), PlayerCommand::Play);
        Self::set_state(&self.state, PlaybackState::Playing);
        Ok(())
    }

    pub fn pause(&self) {
        let _ = self.command_tx.send(PlayerCommand::Pause);
        Self::send_audio_command(self.audio_player.as_ref(), PlayerCommand::Pause);
        Self::set_state(&self.state, PlaybackState::Paused);
    }

    pub fn resume(&self) {
        let current_state = Self::get_state(&self.state);
        let _ = self.command_tx.send(PlayerCommand::Play);
        Self::send_audio_command(self.audio_player.as_ref(), PlayerCommand::Play);
        // If never started and currently stopped, mark start after resume request.
        if current_state == PlaybackState::Stopped && !self.has_started.load(Ordering::Relaxed) {
            self.has_started.store(true, Ordering::Relaxed);
        }
        Self::set_state(&self.state, PlaybackState::Playing);
    }

    pub fn stop(&mut self) {
        let _ = self.command_tx.send(PlayerCommand::Stop);
        Self::send_audio_command(self.audio_player.as_ref(), PlayerCommand::Stop);
        Self::set_state(&self.state, PlaybackState::Stopped);
        if let Some(handle) = self.playback_thread.take() {
            let _ = handle.join();
        }
        self.audio_player = None;
    }

    pub fn seek(&mut self, position: f64) -> Result<(), String> {
        self.command_tx
            .send(PlayerCommand::Seek(position))
            .map_err(|e| format!("Failed to send seek command: {}", e))?;
        Self::send_audio_command(self.audio_player.as_ref(), PlayerCommand::Seek(position));
        Ok(())
    }

    pub fn get_current_position(&self) -> f64 {
        Self::get_position(&self.current_position)
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

    fn restart_after_completion(
        decoder: &mut Decoder,
        loop_state: &mut LoopState,
        runtime: &Runtime<E>,
    ) {
        let decoder_target = runtime.target_size.or(Some(PreviewSize {
            width: loop_state.frame_width,
            height: loop_state.frame_height,
        }));
        match video_utils::build_decoder_with_preview(&runtime.source_path, decoder_target) {
            Ok(new_decoder) => {
                *decoder = new_decoder;
                loop_state.time_base = decoder.time_base();
                (loop_state.frame_width, loop_state.frame_height) = decoder.size_out();
                loop_state.rgba_buffer = Vec::with_capacity(Self::frame_byte_capacity(loop_state));
                Self::set_position(&runtime.current_position, 0.0);
                loop_state.last_frame_skipped = false;
                loop_state.last_emit = Instant::now() - runtime.frame_emit_interval;
            }
            Err(err) => {
                log::error!("Failed to rebuild video decoder: {err}");
            }
        }

        Self::send_audio_command(runtime.audio_player.as_ref(), PlayerCommand::Seek(0.0));
    }

    fn handle_seek_failure(
        err: &VideoError,
        target: f64,
        clamped: f64,
        runtime: &Runtime<E>,
        loop_state: &mut LoopState,
    ) {
        log::error!("Video seek failed: {err} (target={target}, clamped={clamped})");
        Self::finalize_as_completed(runtime, loop_state);
    }

    fn switch_to_playing(runtime: &Runtime<E>, loop_state: &mut LoopState) {
        loop_state.completed = false;
        loop_state.final_state_sent = false;
        loop_state.playing = true;
        Self::set_state(&runtime.state, PlaybackState::Playing);
        let anchor =
            Instant::now() - Duration::from_secs_f64(Self::get_position(&runtime.current_position));
        loop_state.wall_clock_anchor = Some(anchor);
    }

    fn switch_to_paused(runtime: &Runtime<E>, loop_state: &mut LoopState) {
        loop_state.playing = false;
        Self::set_state(&runtime.state, PlaybackState::Paused);
        loop_state.wall_clock_anchor = None;
    }

    fn apply_seek_success(clamped: f64, runtime: &Runtime<E>, loop_state: &mut LoopState) {
        Self::set_position(&runtime.current_position, clamped);
        loop_state.completed = false;
        loop_state.final_state_sent = false;
        if loop_state.playing {
            let anchor = Instant::now()
                - Duration::from_secs_f64(Self::get_position(&runtime.current_position));
            loop_state.wall_clock_anchor = Some(anchor);
        }
    }

    fn finalize_as_completed(runtime: &Runtime<E>, loop_state: &mut LoopState) {
        Self::set_position(&runtime.current_position, runtime.duration);
        Self::set_state(&runtime.state, PlaybackState::Stopped);
        Self::send_audio_command(runtime.audio_player.as_ref(), PlayerCommand::Pause);
        Self::send_audio_command(
            runtime.audio_player.as_ref(),
            PlayerCommand::Seek(runtime.duration),
        );
        runtime.emitter.emit("video-complete", "Playback completed");
        loop_state.completed = true;
        loop_state.final_state_sent = false;
        loop_state.playing = false;
        loop_state.wall_clock_anchor = None;
    }

    fn handle_command(
        cmd: PlayerCommand,
        decoder: &mut Decoder,
        loop_state: &mut LoopState,
        runtime: &Runtime<E>,
    ) -> bool {
        match cmd {
            PlayerCommand::AudioError(err) => {
                runtime.emitter.emit("video-error", format!("Audio init failed: {err}"));
            }
            PlayerCommand::Play => {
                loop_state.smoothed_audio_clock = None;
                if loop_state.completed {
                    Self::restart_after_completion(decoder, loop_state, runtime);
                }
                Self::switch_to_playing(runtime, loop_state);
            }
            PlayerCommand::Pause => {
                Self::switch_to_paused(runtime, loop_state);
            }
            PlayerCommand::Seek(target) => {
                log::debug!("Video seek target: {target}");
                let clamped = target.min((runtime.duration - 0.5).max(0.0)).max(0.0);
                if let Err(err) = decoder.seek((clamped * 1000.0) as i64) {
                    Self::handle_seek_failure(&err, target, clamped, runtime, loop_state);
                    return false;
                }
                Self::apply_seek_success(clamped, runtime, loop_state);
            }
            PlayerCommand::Stop => {
                Self::set_state(&runtime.state, PlaybackState::Stopped);
                return true;
            }
        }
        false
    }

    fn handle_decoded_frame(
        frame: &RawFrame,
        loop_state: &mut LoopState,
        runtime: &Runtime<E>,
    ) {
        let pts_secs = video_utils::frame_timestamp_secs(frame, loop_state.time_base);
        Self::set_position(&runtime.current_position, pts_secs);

        let raw_audio_clock = runtime
            .audio_player
            .as_ref()
            .map(|ap| ap.get_audio_clock())
            .unwrap_or_else(|| {
                if let Some(anchor) = loop_state.wall_clock_anchor {
                    anchor.elapsed().as_secs_f64()
                } else {
                    pts_secs
                }
            });
        let audio_clock = match loop_state.smoothed_audio_clock {
            Some(prev) => {
                let alpha = 0.2;
                let smoothed = prev + alpha * (raw_audio_clock - prev);
                loop_state.smoothed_audio_clock = Some(smoothed);
                smoothed
            }
            None => {
                loop_state.smoothed_audio_clock = Some(raw_audio_clock);
                raw_audio_clock
            }
        };

        let diff = pts_secs - audio_clock;
        if diff > AV_SYNC_TOLERANCE_SEC {
            let sleep_dur = diff.min(AV_SYNC_TOLERANCE_SEC);
            thread::sleep(Duration::from_secs_f64(sleep_dur));
            loop_state.last_frame_skipped = false;
        } else if diff < -AV_SYNC_TOLERANCE_SEC {
            if !loop_state.last_frame_skipped {
                log::debug!(
                    "Video behind audio by {:.2}ms, dropping frame",
                    diff * 1000.0
                );
            }
            loop_state.last_frame_skipped = true;
            return;
        } else {
            loop_state.last_frame_skipped = false;
        }

        if loop_state.last_emit.elapsed() < runtime.frame_emit_interval {
            return;
        }

        video_utils::frame_to_rgba_into(
            frame,
            loop_state.frame_width,
            loop_state.frame_height,
            &mut loop_state.rgba_buffer,
        );
        if let Some(frame_channel) = runtime.frame_channel.as_ref() {
            let next_capacity = Self::frame_byte_capacity(loop_state);
            let frame_bytes = std::mem::replace(
                &mut loop_state.rgba_buffer,
                Vec::with_capacity(next_capacity),
            );
            let _ = frame_channel.send(InvokeResponseBody::Raw(frame_bytes));
        } else {
            let payload = video_utils::build_video_frame_payload(
                loop_state.frame_width,
                loop_state.frame_height,
                &loop_state.rgba_buffer,
            );
            runtime.emitter.emit("video-frame", payload);
        }
        loop_state.last_emit = Instant::now();
    }

    fn handle_decode_exhausted(loop_state: &mut LoopState, runtime: &Runtime<E>) {
        if !loop_state.completed {
            log::debug!(
                "Video decode reached end: current_position={:.3}s, duration={:.3}s",
                Self::get_position(&runtime.current_position),
                runtime.duration
            );
            Self::finalize_as_completed(runtime, loop_state);
            loop_state.smoothed_audio_clock = Some(
                video_utils::frame_timestamp_secs(&RawFrame::empty(), loop_state.time_base)
                    .max(Self::get_position(&runtime.current_position)),
            );
        }
        thread::sleep(Duration::from_millis(IDLE_SLEEP_MS));
    }

    fn handle_decode_error(err: &VideoError, runtime: &Runtime<E>) {
        Self::set_state(&runtime.state, PlaybackState::Stopped);
        runtime.emitter.emit("video-error", format!("Video decode failed: {err}"));
        log::error!("Video decode failed: {err}");
    }

    fn emit_player_state_update(loop_state: &mut LoopState, runtime: &Runtime<E>) {
        if loop_state.last_state_emit.elapsed() < Duration::from_millis(120) {
            return;
        }
        if loop_state.completed && loop_state.final_state_sent {
            loop_state.last_state_emit = Instant::now();
            return;
        }

        let position = Self::get_position(&runtime.current_position);
        let state_val = Self::get_state(&runtime.state);
        let volume = runtime
            .audio_player
            .as_ref()
            .map(|ap| ap.get_volume())
            .unwrap_or(1.0);
        let payload =
            video_utils::build_player_state_payload(position, runtime.duration, state_val, volume);
        runtime.emitter.emit("player-state-update", payload);
        loop_state.last_state_emit = Instant::now();
        if loop_state.completed {
            loop_state.final_state_sent = true;
        }
    }

    fn handle_decode_step(
        decoder: &mut Decoder,
        loop_state: &mut LoopState,
        runtime: &Runtime<E>,
    ) -> bool {
        match decoder.decode_raw() {
            Ok(frame) => {
                Self::handle_decoded_frame(&frame, loop_state, runtime);
                false
            }
            Err(VideoError::DecodeExhausted) | Err(VideoError::ReadExhausted) => {
                Self::handle_decode_exhausted(loop_state, runtime);
                false
            }
            Err(err) => {
                Self::handle_decode_error(&err, runtime);
                true
            }
        }
    }

    fn drain_commands(
        command_rx: &mpsc::Receiver<PlayerCommand>,
        decoder: &mut Decoder,
        loop_state: &mut LoopState,
        runtime: &Runtime<E>,
    ) -> bool {
        while let Ok(cmd) = command_rx.try_recv() {
            let should_exit = Self::handle_command(cmd, decoder, loop_state, runtime);
            if should_exit {
                return true;
            }
        }
        false
    }

    fn handle_loop_iteration(
        command_rx: &mpsc::Receiver<PlayerCommand>,
        decoder: &mut Decoder,
        loop_state: &mut LoopState,
        runtime: &Runtime<E>,
    ) -> bool {
        if !loop_state.playing {
            match command_rx.recv_timeout(Duration::from_millis(PAUSED_WAIT_MS)) {
                Ok(cmd) => {
                    if Self::handle_command(cmd, decoder, loop_state, runtime) {
                        return true;
                    }
                    if Self::drain_commands(command_rx, decoder, loop_state, runtime) {
                        return true;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => return true,
            }
            Self::emit_player_state_update(loop_state, runtime);
            return false;
        }

        if Self::drain_commands(command_rx, decoder, loop_state, runtime) {
            return true;
        }
        Self::emit_player_state_update(loop_state, runtime);
        Self::handle_decode_step(decoder, loop_state, runtime)
    }

    fn spawn_playback(
        mut decoder: Decoder,
        emitter: E,
        command_rx: mpsc::Receiver<PlayerCommand>,
        state: Arc<Mutex<PlaybackState>>,
        current_position: Arc<Mutex<f64>>,
        audio_player: Option<Arc<DynAudioPlaybackController<PlayerCommand>>>,
        frame_channel: Option<FrameChannel>,
        duration: f64,
        source_path: String,
        target_size: Option<PreviewSize>,
    ) -> thread::JoinHandle<()> {
        thread::spawn(move || {
            let runtime = Runtime {
                current_position,
                state,
                audio_player,
                frame_channel,
                emitter,
                duration,
                source_path,
                target_size,
                frame_emit_interval: Duration::from_millis(FRAME_EMIT_INTERVAL_MS),
            };
            let mut loop_state =
                LoopState::new(&decoder, runtime.target_size, runtime.frame_emit_interval);

            loop {
                if Self::handle_loop_iteration(&command_rx, &mut decoder, &mut loop_state, &runtime)
                {
                    return;
                }
            }
        })
    }
}

impl<E: EventEmitter> Drop for VideoPlayer<E> {
    fn drop(&mut self) {
        self.stop();
    }
}
