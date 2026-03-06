use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde_json::{json, Value};
use std::path::Path;

use video_rs::ffmpeg::Rational;
use video_rs::frame::RawFrame;
use video_rs::{Decoder, DecoderBuilder, Resize};

use crate::events::EventEmitter;
use crate::media_common::player_control::DynAudioPlaybackController;
use crate::services::player::video::{FrameChannel, PlaybackState, PlayerCommand, PreviewSize};

pub fn build_decoder_with_preview(
    path: &str,
    preview: Option<PreviewSize>,
) -> Result<Decoder, String> {
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

    decoder_builder
        .build()
        .map_err(|e| format!("Failed to create decoder: {}", e))
}

pub fn frame_timestamp_secs(frame: &RawFrame, time_base: Rational) -> f64 {
    frame
        .timestamp()
        .or_else(|| frame.pts())
        .map(|pts| pts as f64 * (time_base.numerator() as f64 / time_base.denominator() as f64))
        .unwrap_or(0.0)
}

pub fn frame_to_rgba_into(frame: &RawFrame, width: u32, height: u32, out: &mut Vec<u8>) {
    let stride = frame.stride(0);
    let data = frame.data(0);
    let width = width as usize;
    let height = height as usize;

    out.clear();
    out.reserve(width.saturating_mul(height).saturating_mul(4));

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
            out.extend_from_slice(&[chunk[0], chunk[1], chunk[2], 255]);
        }
    }
}

fn playback_state_name(state: PlaybackState) -> &'static str {
    match state {
        PlaybackState::Playing => "playing",
        PlaybackState::Paused => "paused",
        PlaybackState::Stopped => "stopped",
    }
}

pub fn build_player_state_payload(
    position: f64,
    duration: f64,
    state: PlaybackState,
    volume: f32,
) -> Value {
    json!({
        "position": position,
        "duration": duration,
        "state": playback_state_name(state),
        "volume": volume,
    })
}

pub fn build_video_frame_payload(width: u32, height: u32, data: &[u8]) -> Value {
    json!({
        "width": width,
        "height": height,
        "data_base64": BASE64_STANDARD.encode(data),
    })
}

pub struct PlaybackLoopState {
    pub time_base: video_rs::ffmpeg::Rational,
    pub frame_width: u32,
    pub frame_height: u32,
    pub playing: bool,
    pub wall_clock_anchor: Option<Instant>,
    pub last_emit: Instant,
    pub smoothed_audio_clock: Option<f64>,
    pub completed: bool,
    pub last_frame_skipped: bool,
    pub last_state_emit: Instant,
    pub final_state_sent: bool,
    pub rgba_buffer: Vec<u8>,
}

impl PlaybackLoopState {
    pub fn new(
        decoder: &Decoder,
        target_size: Option<PreviewSize>,
        frame_emit_interval: Duration,
    ) -> Self {
        let time_base = decoder.time_base();
        let (raw_width, raw_height) = decoder.size_out();
        let (frame_width, frame_height) = match target_size {
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

        Self {
            time_base,
            frame_width,
            frame_height,
            playing: false,
            wall_clock_anchor: None,
            last_emit: Instant::now() - frame_emit_interval,
            smoothed_audio_clock: None,
            completed: false,
            last_frame_skipped: false,
            last_state_emit: Instant::now(),
            final_state_sent: false,
            rgba_buffer: Vec::with_capacity(
                (frame_width as usize).saturating_mul(frame_height as usize).saturating_mul(4),
            ),
        }
    }
}

pub struct PlaybackRuntime<E: EventEmitter> {
    pub current_position: Arc<Mutex<f64>>,
    pub state: Arc<Mutex<PlaybackState>>,
    pub audio_player: Option<Arc<DynAudioPlaybackController<PlayerCommand>>>,
    pub frame_channel: Option<FrameChannel>,
    pub emitter: E,
    pub duration: f64,
    pub source_path: String,
    pub target_size: Option<PreviewSize>,
    pub frame_emit_interval: Duration,
}
