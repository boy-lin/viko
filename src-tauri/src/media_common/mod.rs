use ffmpeg_next as ffmpeg;
use ffmpeg::format::sample::Type as SampleType;
use ffmpeg::util::channel_layout::ChannelLayout;
use ffmpeg::util::format::Sample;

pub mod fifo;
pub mod codec;
pub mod resolution;

pub use fifo::AudioFifo;
pub use codec::*;
pub use resolution::*;

use image::RgbImage;

pub fn ensure_ffmpeg_init() -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init failed: {}", e))
}

pub fn get_audio_duration(input_path: &str) -> Result<f64, String> {
    ensure_ffmpeg_init()?;

    let ictx = ffmpeg::format::input(input_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let duration = if let Some(audio_stream) = ictx.streams().best(ffmpeg::media::Type::Audio) {
        let time_base = audio_stream.time_base();
        let duration_ts = audio_stream.duration();
        if duration_ts > 0 {
            duration_ts as f64 * time_base.numerator() as f64 / time_base.denominator() as f64
        } else {
            let dur_raw = ictx.duration();
            if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
                dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
            } else {
                0.0
            }
        }
    } else {
        let dur_raw = ictx.duration();
        if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
            dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
        } else {
            0.0
        }
    };

    Ok(duration)
}

/// Media duration helper for future audio/video callers.
pub fn get_media_duration(input_path: &str) -> Result<f64, String> {
    get_audio_duration(input_path)
}

/// Initialize FFmpeg once.
pub fn init_ffmpeg() -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init failed: {}", e))
}

/// Open input context with common error handling.
pub fn open_input(path: &str) -> Result<ffmpeg::format::context::Input, String> {
    ffmpeg::format::input(path).map_err(|e| format!("Failed to open input: {}", e))
}

/// Greatest common divisor.
pub fn gcd(a: u32, b: u32) -> u32 {
    let (mut x, mut y) = (a, b);
    while y != 0 {
        let tmp = y;
        y = x % y;
        x = tmp;
    }
    x
}

/// Calculate scaled dimensions preserving aspect ratio if one side missing.
pub fn calculate_scaled_dimensions(
    src_w: u32,
    src_h: u32,
    target_w: Option<u32>,
    target_h: Option<u32>,
) -> (u32, u32) {
    match (target_w, target_h) {
        (Some(w), Some(h)) => (w.max(1), h.max(1)),
        (Some(w), None) => {
            let h = ((w as f64 * src_h as f64 / src_w as f64).round() as u32).max(1);
            (w.max(1), h)
        }
        (None, Some(h)) => {
            let w = ((h as f64 * src_w as f64 / src_h as f64).round() as u32).max(1);
            (w, h.max(1))
        }
        _ => (src_w, src_h),
    }
}

/// Convert an FFmpeg video frame (RGB24) to image::RgbImage, respecting stride.
pub fn frame_to_rgb_image(frame: &ffmpeg::frame::Video) -> Result<RgbImage, String> {
    let width = frame.width();
    let height = frame.height();
    let data = frame.data(0);
    let stride = frame.stride(0);
    let row_bytes = (width as usize) * 3;

    let mut buffer = Vec::with_capacity(row_bytes * height as usize);
    if stride == row_bytes {
        buffer.extend_from_slice(&data[..row_bytes * height as usize]);
    } else {
        for y in 0..height {
            let offset = y as usize * stride;
            buffer.extend_from_slice(&data[offset..offset + row_bytes]);
        }
    }

    RgbImage::from_raw(width, height, buffer).ok_or_else(|| "Failed to create RgbImage".to_string())
}

pub fn preferred_sample_from_bit_depth(
    bit_depth: Option<u32>,
    format_hint: Option<&str>,
) -> Sample {
    match bit_depth {
        Some(16) => Sample::I16(SampleType::Packed),
        Some(24) => Sample::I32(SampleType::Packed),
        Some(32) => Sample::F32(SampleType::Packed),
        _ => match format_hint {
            Some("wav") | Some("flac") => Sample::I16(SampleType::Packed),
            _ => Sample::F32(SampleType::Planar),
        },
    }
}

pub fn pick_sample_format(encoder_codec: &ffmpeg::Codec, preferred: Sample) -> Sample {
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(formats) = audio.formats() {
            let supported: Vec<Sample> = formats.collect();
            for candidate in [
                preferred,
                preferred.planar(),
                preferred.packed(),
                Sample::F32(SampleType::Planar),
                Sample::F32(SampleType::Packed),
            ] {
                if supported.iter().any(|f| *f == candidate) {
                    return candidate;
                }
            }
            if let Some(first) = supported.first() {
                return *first;
            }
        }
    }
    preferred
}

pub fn pick_channel_layout(
    encoder_codec: &ffmpeg::Codec,
    desired: Option<ChannelLayout>,
    input_layout: ChannelLayout,
) -> ChannelLayout {
    let wanted = desired.unwrap_or_else(|| {
        if input_layout.is_empty() {
            ChannelLayout::STEREO
        } else {
            input_layout
        }
    });
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(layouts) = audio.channel_layouts() {
            let mut collected = Vec::new();
            for l in layouts {
                if l == wanted {
                    return wanted;
                }
                collected.push(l);
            }
            if let Some(best) = collected.iter().find(|l| l.channels() == wanted.channels()) {
                return *best;
            }
            if let Some(first) = collected.first() {
                return *first;
            }
        }
    }
    wanted
}

pub fn pick_sample_rate(encoder_codec: &ffmpeg::Codec, requested: u32, fallback: u32) -> u32 {
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(rates) = audio.rates() {
            let supported: Vec<i32> = rates.collect();
            if supported.is_empty() {
                return requested.max(1);
            }
            if supported.iter().any(|r| *r == requested as i32) {
                return requested;
            }
            if let Some(best) = supported.iter().min_by_key(|r| (requested as i32 - **r).abs()) {
                return *best as u32;
            }
        }
    }
    if requested > 0 {
        requested
    } else {
        fallback
    }
}

pub fn channel_layout_from_count(ch: u32) -> Option<ChannelLayout> {
    match ch {
        1 => Some(ChannelLayout::MONO),
        2 => Some(ChannelLayout::STEREO),
        _ => None,
    }
}
