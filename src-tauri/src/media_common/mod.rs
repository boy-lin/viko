use ffmpeg::{format, Rational};
use ffmpeg_next as ffmpeg;
use std::sync::Once;

pub mod codec;
pub mod fifo;
pub mod resolution;

// Re-export codec functions directly
pub use codec::*;
pub use fifo::AudioFifo;
pub use resolution::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaFileType {
    Image,
    Video,
    Audio,
    Unknown,
}

static FFMPEG_INIT: Once = Once::new();

pub fn init_ffmpeg() -> Result<(), String> {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().unwrap();
    });
    Ok(())
}

pub fn ensure_ffmpeg_init() -> Result<(), String> {
    init_ffmpeg()
}

pub fn open_input(path: &str) -> Result<format::context::Input, String> {
    format::input(&path).map_err(|e| format!("无法打开输入文件: {}", e))
}

pub fn detect_media_file_type(path: &std::path::Path) -> MediaFileType {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase());

    match ext.as_deref() {
        Some("jpg") | Some("jpeg") | Some("png") | Some("webp") | Some("bmp") | Some("gif")
        | Some("tif") | Some("tiff") | Some("ico") | Some("avif") => MediaFileType::Image,
        Some("mp4") | Some("mkv") | Some("mov") | Some("avi") | Some("webm") | Some("flv")
        | Some("m4v") | Some("wmv") | Some("3gp") | Some("mts") | Some("m2ts") => {
            MediaFileType::Video
        }
        Some("mp3") | Some("wav") | Some("flac") | Some("aac") | Some("m4a") | Some("ogg")
        | Some("oga") | Some("opus") | Some("wma") => MediaFileType::Audio,
        _ => MediaFileType::Unknown,
    }
}

pub fn gcd(a: u32, b: u32) -> u32 {
    let mut max = a;
    let mut min = b;
    if min > max {
        let val = max;
        max = min;
        min = val;
    }

    loop {
        let res = max % min;
        if res == 0 {
            return min;
        }

        max = min;
        min = res;
    }
}

pub fn calculate_scaled_dimensions(
    src_width: u32,
    src_height: u32,
    max_width: Option<u32>,
    max_height: Option<u32>,
) -> (u32, u32) {
    let src_ratio = src_width as f64 / src_height as f64;

    match (max_width, max_height) {
        (Some(mw), Some(mh)) => {
            let max_ratio = mw as f64 / mh as f64;
            if src_ratio > max_ratio {
                // Width constrained
                let target_width = mw;
                let target_height = (target_width as f64 / src_ratio).round() as u32;
                (target_width, target_height.max(1))
            } else {
                // Height constrained
                let target_height = mh;
                let target_width = (target_height as f64 * src_ratio).round() as u32;
                (target_width.max(1), target_height)
            }
        }
        (Some(mw), None) => {
            let target_width = mw;
            let target_height = (target_width as f64 / src_ratio).round() as u32;
            (target_width, target_height.max(1))
        }
        (None, Some(mh)) => {
            let target_height = mh;
            let target_width = (target_height as f64 * src_ratio).round() as u32;
            (target_width.max(1), target_height)
        }
        (None, None) => (src_width, src_height),
    }
}

pub fn channel_layout_from_count(channels: u32) -> Option<ffmpeg::ChannelLayout> {
    match channels {
        1 => Some(ffmpeg::ChannelLayout::MONO),
        2 => Some(ffmpeg::ChannelLayout::STEREO),
        _ => Some(ffmpeg::ChannelLayout::default(channels as i32)),
    }
}

pub fn preferred_sample_from_bit_depth(
    bit_depth: Option<u32>,
    default: Option<format::Sample>,
) -> format::Sample {
    match bit_depth {
        Some(16) => format::Sample::I16(format::sample::Type::Packed),
        Some(24) => format::Sample::I32(format::sample::Type::Packed), // FFmpeg typically uses S32 for 24-bit container
        Some(32) => format::Sample::I32(format::sample::Type::Packed),
        _ => default.unwrap_or(format::Sample::I16(format::sample::Type::Packed)),
    }
}

/// Helper to get audio duration (re-implemented as it was missing)
pub fn get_audio_duration(path: &str) -> Result<f64, String> {
    let ictx = open_input(path)?;
    Ok(ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64)
}

pub fn frame_to_rgb_image(frame: &ffmpeg::frame::Video) -> Result<image::RgbImage, String> {
    let width = frame.width();
    let height = frame.height();
    let data = frame.data(0);
    let stride = frame.stride(0);

    // Safety check
    if data.len() < (stride * height as usize) {
        return Err("Frame buffer size mismatch".to_string());
    }

    let mut img = image::RgbImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let idx = y as usize * stride + x as usize * 3;
            if idx + 2 < data.len() {
                let r = data[idx];
                let g = data[idx + 1];
                let b = data[idx + 2];
                img.put_pixel(x, y, image::Rgb([r, g, b]));
            }
        }
    }
    Ok(img)
}

/// Rescale a 64-bit integer timestamp from one time base to another.
///
/// Corresponds to `av_rescale_q` logic: `a * bq / cq`.
/// Calculation: `val * src.num * dst.den / (src.den * dst.num)`
pub fn rescale_ts(val: i64, src: Rational, dst: Rational) -> i64 {
    if val == 0 {
        return 0;
    }
    if src.0 == 0 || src.1 == 0 || dst.0 == 0 || dst.1 == 0 {
        return 0; // Invalid timebase
    }

    // Use u128 to prevent overflow during multiplication
    let a = val as i128;
    let b = (src.0 as i128) * (dst.1 as i128); // numerator part
    let c = (src.1 as i128) * (dst.0 as i128); // denominator part

    if c == 0 {
        return 0;
    }

    // integer division (floor)
    let result = a * b / c;

    result as i64
}
