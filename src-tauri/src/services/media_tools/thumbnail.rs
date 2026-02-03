use std::io::Cursor;
use std::path::Path;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use ffmpeg_next as ffmpeg;
use image::ImageFormat;

use crate::media_common;

/// Generate a base64 encoded thumbnail for the given media file.
/// For video: extracts the first frame.
/// For audio: extracts attached picture (cover art).
pub fn generate_thumbnail(path: &str) -> Result<Option<String>, String> {
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
        let mut decoder = decoder_ctx.decoder().video()
             .map_err(|e| format!("Decoder failed: {}", e))?;

        // 尝试缩放配置
        let target_width = 320;
        let mut scaler = if decoder.width() > 0 && decoder.height() > 0 {
             let height = (decoder.height() as f64 * target_width as f64 / decoder.width() as f64) as u32;
             ffmpeg::software::scaling::context::Context::get(
                 decoder.format(),
                 decoder.width(),
                 decoder.height(),
                 ffmpeg::format::Pixel::RGB24,
                 target_width,
                 height,
                 ffmpeg::software::scaling::flag::Flags::BILINEAR,
             ).ok()
        } else {
             None
        };

        // Iterate through packets to find the first video frame
        for (stream, packet) in ictx.packets() {
            if stream.index() == stream_index {
                decoder.send_packet(&packet).map_err(|e| format!("Send packet failed: {}", e))?;
                let mut decoded = ffmpeg::frame::Video::empty();
                if decoder.receive_frame(&mut decoded).is_ok() {
                    // Got a frame!
                    
                    // Convert/Scale to RGB24
                    let mut rgb_frame = ffmpeg::frame::Video::empty();
                    if let Some(scaler) = &mut scaler {
                        scaler.run(&decoded, &mut rgb_frame).map_err(|e| format!("Scaling failed: {}", e))?;
                    } else {
                         // Fallback structure if scaling failed setup (shouldn't happen on valid video)
                         // Just use original if format matches? No, we want RGB for image crate.
                         // Simple return if scaler failed.
                         return Ok(None);
                    }

                    // Encode to JPEG using image crate
                    let img_buffer = media_common::frame_to_rgb_image(&rgb_frame)?;

                    let mut cursor = Cursor::new(Vec::new());
                    img_buffer.write_to(&mut cursor, ImageFormat::Jpeg)
                        .map_err(|e| format!("Image encode failed: {}", e))?;
                        
                    let base64_str = BASE64.encode(cursor.get_ref());
                    return Ok(Some(format!("data:image/jpeg;base64,{}", base64_str)));
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
