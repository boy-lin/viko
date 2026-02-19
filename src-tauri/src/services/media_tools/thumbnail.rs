use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use ffmpeg_next as ffmpeg;
use image::imageops::{crop_imm, resize, FilterType};
use image::{ImageFormat, RgbImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;

use crate::media_common;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// contain(默认): 等比缩放完整显示; cover: 等比放大后居中裁切
    pub fit_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailResult {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

/// Generate a base64 encoded thumbnail for the given media file.
/// For video: extracts the first frame.
/// For audio: extracts attached picture (cover art).
pub fn generate_thumbnail(
    path: &str,
    options: Option<ThumbnailOptions>,
) -> Result<Option<ThumbnailResult>, String> {
    if !Path::new(path).exists() {
        return Err(format!("文件不存在: {}", path));
    }

    media_common::init_ffmpeg()?;

    let mut ictx = media_common::open_input(path)?;

    // 1. Try to find a video stream (for video files or audio with cover art as video stream)
    if let Some(stream) = ictx.streams().best(ffmpeg::media::Type::Video) {
        let stream_index = stream.index();

        let decoder_ctx = ffmpeg::codec::context::Context::from_parameters(stream.parameters())
            .map_err(|e| format!("Decoder context failed: {}", e))?;
        let mut decoder = decoder_ctx
            .decoder()
            .video()
            .map_err(|e| format!("Decoder failed: {}", e))?;

        let requested_width = options.as_ref().and_then(|o| o.width);
        let requested_height = options.as_ref().and_then(|o| o.height);
        let fit_mode = options
            .as_ref()
            .and_then(|o| o.fit_mode.as_deref())
            .unwrap_or("contain")
            .to_ascii_lowercase();

        let mut scaler = if decoder.width() > 0 && decoder.height() > 0 {
            let src_width = decoder.width();
            let src_height = decoder.height();
            ffmpeg::software::scaling::context::Context::get(
                decoder.format(),
                src_width,
                src_height,
                ffmpeg::format::Pixel::RGB24,
                src_width,
                src_height,
                ffmpeg::software::scaling::flag::Flags::BILINEAR,
            )
            .ok()
        } else {
            None
        };

        // Iterate through packets to find the first video frame
        for (stream, packet) in ictx.packets() {
            if stream.index() == stream_index {
                decoder
                    .send_packet(&packet)
                    .map_err(|e| format!("Send packet failed: {}", e))?;
                let mut decoded = ffmpeg::frame::Video::empty();
                if decoder.receive_frame(&mut decoded).is_ok() {
                    // Got a frame!

                    // Convert/Scale to RGB24
                    let mut rgb_frame = ffmpeg::frame::Video::empty();
                    if let Some(scaler) = &mut scaler {
                        scaler
                            .run(&decoded, &mut rgb_frame)
                            .map_err(|e| format!("Scaling failed: {}", e))?;
                    } else {
                        // Fallback structure if scaling failed setup (shouldn't happen on valid video)
                        // Just use original if format matches? No, we want RGB for image crate.
                        // Simple return if scaler failed.
                        return Ok(None);
                    }

                    // Encode to JPEG using image crate
                    let mut img_buffer = media_common::frame_to_rgb_image(&rgb_frame)?;

                    if requested_width.is_some() || requested_height.is_some() {
                        let (target_width, target_height) = resolve_target_size(
                            img_buffer.width(),
                            img_buffer.height(),
                            requested_width,
                            requested_height,
                        );
                        img_buffer = apply_fit_mode(img_buffer, target_width, target_height, &fit_mode);
                    }

                    let mut cursor = Cursor::new(Vec::new());
                    img_buffer
                        .write_to(&mut cursor, ImageFormat::Jpeg)
                        .map_err(|e| format!("Image encode failed: {}", e))?;

                    let base64_str = BASE64.encode(cursor.get_ref());
                    return Ok(Some(ThumbnailResult {
                        data_url: format!("data:image/jpeg;base64,{}", base64_str),
                        width: img_buffer.width(),
                        height: img_buffer.height(),
                    }));
                }
            }
        }
    }

    // 2. If no video stream found (or valid frame not found), check for audio attached pictures (APIC)
    // Sometimes cover art is a video stream with disposition attached_pic (handled above usually),
    // but sometimes it's metadata?
    // ffmpeg-next `best(Video)` usually catches attached pics too.

    // If we are here, mainly because we couldn't decode a frame from the video stream or there isn't one.

    Ok(None)
}

fn resolve_target_size(
    src_width: u32,
    src_height: u32,
    requested_width: Option<u32>,
    requested_height: Option<u32>,
) -> (u32, u32) {
    match (requested_width, requested_height) {
        (Some(w), Some(h)) => (w.max(1), h.max(1)),
        (Some(w), None) => {
            let h = ((src_height as f64 * w as f64) / src_width as f64).round() as u32;
            (w.max(1), h.max(1))
        }
        (None, Some(h)) => {
            let w = ((src_width as f64 * h as f64) / src_height as f64).round() as u32;
            (w.max(1), h.max(1))
        }
        (None, None) => (src_width.max(1), src_height.max(1)),
    }
}

fn apply_fit_mode(img: RgbImage, target_width: u32, target_height: u32, fit_mode: &str) -> RgbImage {
    if fit_mode == "cover" {
        return resize_and_cover(img, target_width, target_height);
    }
    resize(&img, target_width, target_height, FilterType::Lanczos3)
}

fn resize_and_cover(img: RgbImage, target_width: u32, target_height: u32) -> RgbImage {
    let src_w = img.width() as f64;
    let src_h = img.height() as f64;
    let target_w = target_width as f64;
    let target_h = target_height as f64;

    let scale = (target_w / src_w).max(target_h / src_h);
    let scaled_w = (src_w * scale).round().max(1.0) as u32;
    let scaled_h = (src_h * scale).round().max(1.0) as u32;

    let resized = resize(&img, scaled_w, scaled_h, FilterType::Lanczos3);
    let crop_x = ((scaled_w.saturating_sub(target_width)) / 2).min(scaled_w.saturating_sub(1));
    let crop_y = ((scaled_h.saturating_sub(target_height)) / 2).min(scaled_h.saturating_sub(1));
    crop_imm(&resized, crop_x, crop_y, target_width.min(scaled_w), target_height.min(scaled_h))
        .to_image()
}
