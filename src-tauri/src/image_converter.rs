use image::ImageFormat;
use tauri::command;
use ffmpeg_next as ffmpeg;
use serde::Deserialize;
use crate::media_common;

#[derive(Deserialize)]
pub struct ImageConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: String, // jpg, png, webp, etc.
    pub watermark: Option<crate::watermark::WatermarkConfig>,
}

#[command]
pub async fn convert_image_file(args: ImageConversionParams) -> Result<String, String> {
     // Run in a blocking task to avoid blocking the async runtime with heavy CPU operations
    tauri::async_runtime::spawn_blocking(move || {
        convert_image_file_impl(args)
    }).await.map_err(|e| format!("Task join error: {}", e))?
}

fn convert_image_file_impl(args: ImageConversionParams) -> Result<String, String> {
    media_common::init_ffmpeg()?;

    let mut ictx = media_common::open_input(&args.input_path)?;

    // Find best video stream (covers video files and audio with cover art)
    let stream = ictx.streams().best(ffmpeg::media::Type::Video)
        .ok_or("No video stream or cover art found".to_string())?;
    
    let stream_index = stream.index();
    
    let decoder_ctx = ffmpeg::codec::context::Context::from_parameters(stream.parameters())
            .map_err(|e| format!("Decoder context failed: {}", e))?;
    let mut decoder = decoder_ctx.decoder().video()
            .map_err(|e| format!("Decoder failed: {}", e))?;

    // Determine target size
    // If width/height provided, use them. Otherwise use original.
    // If only one provided, maintain aspect ratio? For now simple implementation:
    // If args provided, scale. specific scaler setup loop logic similar to thumbnail.
    
    let (target_width, target_height) = media_common::calculate_scaled_dimensions(
        decoder.width(),
        decoder.height(),
        args.width,
        args.height,
    );
    
    // Setup Scaler
    // We always want to scale/convert to RGB24 for the image crate
    let mut scaler = ffmpeg::software::scaling::context::Context::get(
            decoder.format(),
            decoder.width(),
            decoder.height(),
            ffmpeg::format::Pixel::RGB24,
            target_width,
            target_height,
            ffmpeg::software::scaling::flag::Flags::BILINEAR,
    ).map_err(|e| format!("Scaler creation failed: {}", e))?;


    for (stream, packet) in ictx.packets() {
        if stream.index() == stream_index {
            decoder.send_packet(&packet).map_err(|e| format!("Send packet failed: {}", e))?;
            let mut decoded = ffmpeg::frame::Video::empty();
            if decoder.receive_frame(&mut decoded).is_ok() {
                // Got frame
                let mut rgb_frame = ffmpeg::frame::Video::empty();
                scaler.run(&decoded, &mut rgb_frame).map_err(|e| format!("Scaling failed: {}", e))?;

                // Convert to image crate buffer
                let img_buffer = media_common::frame_to_rgb_image(&rgb_frame)?;

                // Save to file
                let save_format = match args.format.to_lowercase().as_str() {
                    "jpg" | "jpeg" => ImageFormat::Jpeg,
                    "png" => ImageFormat::Png,
                    "webp" => ImageFormat::WebP,
                    "gif" => ImageFormat::Gif,
                    "bmp" => ImageFormat::Bmp,
                    "tiff" | "tif" => ImageFormat::Tiff,
                    "ico" => ImageFormat::Ico,
                    _ => ImageFormat::Jpeg, // Default
                };

                if let Some(wm) = &args.watermark {
                    let mut rgba_img = image::DynamicImage::ImageRgb8(img_buffer).to_rgba8();
                    wm.apply_watermark(&mut rgba_img)
                        .map_err(|e| format!("Watermark failed: {}", e))?;
                    rgba_img.save_with_format(&args.output_path, save_format)
                        .map_err(|e| format!("Save image failed: {}", e))?;
                } else {
                    img_buffer.save_with_format(&args.output_path, save_format)
                        .map_err(|e| format!("Save image failed: {}", e))?;
                }

                return Ok(args.output_path);
            }
        }
    }

    Err("Could not decode any frames".to_string())
}
