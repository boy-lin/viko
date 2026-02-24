use ffmpeg_next as ffmpeg;
use image::ImageFormat;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::command;

use crate::media_common;
use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};

#[derive(Deserialize, Serialize, Clone, Debug)]

pub struct ImageConversionParams {
    #[serde(default)]
    pub task_id: String,
    pub input_path: String,
    #[serde(default)]
    pub input_file_type: Option<String>,
    #[serde(default)]
    pub output_path: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: String, // jpg, png, webp, etc.
    #[serde(default)]
    pub image_encoder: Option<String>,
    pub watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ImageConversionReport {
    pub output_media: MediaDetails,
}

fn canonical_image_codec_name(codec: &str) -> Option<&'static str> {
    match codec.trim().to_lowercase().as_str() {
        "jpg" | "jpeg" | "mjpeg" => Some("jpeg"),
        "png" => Some("png"),
        "webp" => Some("webp"),
        "gif" => Some("gif"),
        "bmp" => Some("bmp"),
        "tiff" | "tif" => Some("tiff"),
        "ico" => Some("ico"),
        _ => None,
    }
}

fn codec_to_image_format(codec: &str) -> Option<ImageFormat> {
    match canonical_image_codec_name(codec) {
        Some("jpeg") => Some(ImageFormat::Jpeg),
        Some("png") => Some(ImageFormat::Png),
        Some("webp") => Some(ImageFormat::WebP),
        Some("gif") => Some(ImageFormat::Gif),
        Some("bmp") => Some(ImageFormat::Bmp),
        Some("tiff") => Some(ImageFormat::Tiff),
        Some("ico") => Some(ImageFormat::Ico),
        _ => None,
    }
}

fn pick_codec_name(format: &str, image_encoder: Option<&str>) -> Result<String, String> {
    if let Some(encoder) = image_encoder {
        if !encoder.trim().is_empty() {
            if let Some(canonical) = canonical_image_codec_name(encoder) {
                return Ok(canonical.to_string());
            }
            return Err(format!(
                "Unsupported image_encoder: {}. Supported: jpeg(mjpeg), png, webp, gif, bmp, tiff, ico",
                encoder
            ));
        }
    }

    if let Some(canonical) = canonical_image_codec_name(format) {
        return Ok(canonical.to_string());
    }

    Ok("jpeg".to_string())
}

#[command]
pub async fn convert_image_file(args: ImageConversionParams) -> Result<String, String> {
    let report = convert_image_file_with_report(args).await?;
    Ok(report.output_media.path)
}

pub async fn convert_image_file_with_report(
    args: ImageConversionParams,
) -> Result<ImageConversionReport, String> {
    let mut args = args;
    let codec_name = pick_codec_name(&args.format, args.image_encoder.as_deref())?;
    if args.format.is_empty() {
        args.format = codec_name.clone();
    }

    if args.output_path.is_empty() {
        let ext = if codec_name == "jpeg" {
            "jpg"
        } else {
            codec_name.as_str()
        };
        let path = std::path::Path::new(&args.input_path);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");
        let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
        args.output_path = parent
            .join(format!("{}.{}", stem, ext))
            .to_string_lossy()
            .to_string();
    }
    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }
    // Run in a blocking task to avoid blocking the async runtime with heavy CPU operations
    tauri::async_runtime::spawn_blocking(move || convert_image_file_impl(args))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn convert_image_file_impl(args: ImageConversionParams) -> Result<ImageConversionReport, String> {
    media_common::init_ffmpeg()?;

    let mut ictx = media_common::open_input(&args.input_path)?;

    // Find best video stream (covers video files and audio with cover art)
    let stream = ictx
        .streams()
        .best(ffmpeg::media::Type::Video)
        .ok_or("No video stream or cover art found".to_string())?;

    let stream_index = stream.index();

    let decoder_ctx = ffmpeg::codec::context::Context::from_parameters(stream.parameters())
        .map_err(|e| format!("Decoder context failed: {}", e))?;
    let mut decoder = decoder_ctx
        .decoder()
        .video()
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
    )
    .map_err(|e| format!("Scaler creation failed: {}", e))?;

    for (stream, packet) in ictx.packets() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }
        if stream.index() == stream_index {
            decoder
                .send_packet(&packet)
                .map_err(|e| format!("Send packet failed: {}", e))?;
            let mut decoded = ffmpeg::frame::Video::empty();
            if decoder.receive_frame(&mut decoded).is_ok() {
                if crate::task::cancel::is_cancelled() {
                    return Err("Task cancelled".to_string());
                }
                // Got frame
                let mut rgb_frame = ffmpeg::frame::Video::empty();
                scaler
                    .run(&decoded, &mut rgb_frame)
                    .map_err(|e| format!("Scaling failed: {}", e))?;

                // Convert to image crate buffer
                let img_buffer = media_common::frame_to_rgb_image(&rgb_frame)?;

                // Save to file
                let codec_name = pick_codec_name(&args.format, args.image_encoder.as_deref())?;
                let save_format = codec_to_image_format(&codec_name).unwrap_or(ImageFormat::Jpeg);

                if let Some(wm) = &args.watermark {
                    let mut rgba_img = image::DynamicImage::ImageRgb8(img_buffer).to_rgba8();
                    wm.apply_watermark(&mut rgba_img)
                        .map_err(|e| format!("Watermark failed: {}", e))?;
                    rgba_img
                        .save_with_format(&args.output_path, save_format)
                        .map_err(|e| format!("Save image failed: {}", e))?;
                } else {
                    img_buffer
                        .save_with_format(&args.output_path, save_format)
                        .map_err(|e| format!("Save image failed: {}", e))?;
                }

                let output_size = std::fs::metadata(&args.output_path)
                    .map(|m| m.len())
                    .unwrap_or(0);
                let output_format = codec_name;
                let stream = StreamDetails {
                    index: 0,
                    codec_type: "video".to_string(),
                    codec_name: output_format.clone(),
                    codec_long_name: None,
                    time_base: None,
                    pix_fmt: Some("rgb24".to_string()),
                    width: Some(target_width),
                    height: Some(target_height),
                    frame_rate: None,
                    channels: None,
                    sample_rate: None,
                    bit_rate: None,
                };
                let output_media = MediaDetails {
                    path: args.output_path.clone(),
                    extension: std::path::Path::new(&args.output_path)
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .map(|s| s.to_lowercase())
                        .unwrap_or_default(),
                    format_names: output_format,
                    format_long_name: None,
                    duration: 0.0,
                    size: output_size,
                    streams: vec![stream],
                    tags: HashMap::new(),
                    stream_tags: Vec::new(),
                };

                return Ok(ImageConversionReport { output_media });
            }
        }
    }

    Err("Could not decode any frames".to_string())
}
