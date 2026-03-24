use image::ImageFormat;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tauri::command;

use crate::media_common;
use crate::media_common::MediaFileType;
use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};
use crate::services::media_tools::thumbnail::{self, ThumbnailOptions};

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
    #[serde(default)]
    pub frame_rate: Option<String>,
    #[serde(default)]
    pub quality: Option<u32>,
    #[serde(default)]
    pub preserve_transparency: Option<bool>,
    #[serde(default)]
    pub color_mode: Option<String>,
    #[serde(default)]
    pub dpi: Option<f64>,
    #[serde(default)]
    pub loop_count: Option<i32>,
    #[serde(default)]
    pub frame_delay: Option<u32>,
    #[serde(default)]
    pub colors: Option<u32>,
    #[serde(default)]
    pub preserve_extensions: Option<bool>,
    #[serde(default)]
    pub sharpen: Option<bool>,
    #[serde(default)]
    pub denoise: Option<bool>,
    #[serde(default)]
    pub watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
    #[serde(default)]
    pub forced_watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ImageConversionReport {
    pub output_media: MediaDetails,
}

fn canonical_image_codec_name(codec: &str) -> Option<&'static str> {
    match codec.trim().to_lowercase().as_str() {
        "jpg" | "jpeg" | "mjpeg" => Some("jpeg"),
        "png" => Some("png"),
        "apng" => Some("apng"),
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
    args.output_path = media_common::ensure_unique_output_path(&args.output_path);
    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }
    // Run in a blocking task to avoid blocking the async runtime with heavy CPU operations
    tauri::async_runtime::spawn_blocking(move || convert_image_file_impl(args))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn convert_image_file_impl(args: ImageConversionParams) -> Result<ImageConversionReport, String> {
    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }

    if matches!(
        media_common::detect_media_file_type(Path::new(&args.input_path)),
        MediaFileType::Video | MediaFileType::Audio
    ) {
        return convert_media_frame_to_image(args);
    }

    let mut dynamic =
        image::open(&args.input_path).map_err(|e| format!("无法打开图片文件: {}", e))?;

    let (target_width, target_height) = media_common::calculate_scaled_dimensions(
        dynamic.width(),
        dynamic.height(),
        args.width,
        args.height,
    );
    if target_width != dynamic.width() || target_height != dynamic.height() {
        dynamic = dynamic.resize(target_width, target_height, image::imageops::FilterType::Lanczos3);
    }

    let watermarks: Vec<&crate::services::media_tools::watermark::WatermarkConfig> = [
        args.watermark.as_ref(),
        args.forced_watermark.as_ref(),
    ]
    .into_iter()
    .flatten()
    .collect();
    if !watermarks.is_empty() {
        let mut rgba_img = dynamic.to_rgba8();
        crate::services::media_tools::watermark::apply_all_watermarks(&mut rgba_img, &watermarks)
            .map_err(|e| format!("Watermark failed: {}", e))?;
        dynamic = image::DynamicImage::ImageRgba8(rgba_img);
    }

    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }

    let output_format_name = pick_codec_name(&args.format, args.image_encoder.as_deref())?;
    let save_format = codec_to_image_format(&output_format_name).unwrap_or(ImageFormat::Jpeg);
    if save_format == ImageFormat::Ico {
        let max_icon_size = 256;
        let current_width = dynamic.width();
        let current_height = dynamic.height();
        if current_width == 0 || current_height == 0 {
            return Err("Save image failed: invalid icon size".to_string());
        }
        if current_width > max_icon_size || current_height > max_icon_size {
            let scale = (max_icon_size as f32 / current_width as f32)
                .min(max_icon_size as f32 / current_height as f32);
            let target_width = ((current_width as f32 * scale).round() as u32).max(1);
            let target_height = ((current_height as f32 * scale).round() as u32).max(1);
            dynamic = dynamic.resize(
                target_width,
                target_height,
                image::imageops::FilterType::Lanczos3,
            );
        }
    }
    dynamic
        .save_with_format(&args.output_path, save_format)
        .map_err(|e| format!("Save image failed: {}", e))?;

    let output_size = std::fs::metadata(&args.output_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let color = dynamic.color();
    let channel_count = color.channel_count() as u32;
    let bits_per_pixel = color.bits_per_pixel() as u32;
    let bits_per_sample = if channel_count > 0 {
        Some(bits_per_pixel / channel_count)
    } else {
        None
    };
    let stream = StreamDetails {
        index: 0,
        codec_type: "video".to_string(),
        codec_name: output_format_name.clone(),
        codec_long_name: None,
        time_base: None,
        pix_fmt: Some(format!("{:?}", color).to_lowercase()),
        width: Some(dynamic.width()),
        height: Some(dynamic.height()),
        frame_rate: None,
        channels: None,
        sample_rate: None,
        bit_rate: None,
        bit_depth: bits_per_sample,
        bits_per_sample,
    };
    let output_media = MediaDetails {
        path: args.output_path.clone(),
        extension: std::path::Path::new(&args.output_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default(),
        format_names: output_format_name,
        format_long_name: None,
        duration: 0.0,
        size: output_size,
        streams: vec![stream],
        tags: HashMap::new(),
        stream_tags: Vec::new(),
    };

    Ok(ImageConversionReport { output_media })
}

fn convert_media_frame_to_image(
    args: ImageConversionParams,
) -> Result<ImageConversionReport, String> {
    let thumb = thumbnail::generate_thumbnail(
        &args.input_path,
        Some(ThumbnailOptions {
            width: args.width,
            height: args.height,
            fit_mode: Some("contain".to_string()),
        }),
    )?
    .ok_or_else(|| "无法从媒体文件提取封面帧".to_string())?;

    let mut forwarded_args = args;
    forwarded_args.input_path = thumb.thumbnail_path;
    forwarded_args.input_file_type = Some("image".to_string());
    convert_image_file_impl(forwarded_args)
}

pub fn is_animated_image_target(format: &str, output_path: &str, input_path: &str) -> bool {
    let normalized = format.trim().to_lowercase();
    if normalized == "gif" || normalized == "apng" {
        return true;
    }

    let output_ext = std::path::Path::new(output_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase());
    if matches!(output_ext.as_deref(), Some("gif" | "apng")) {
        return true;
    }

    let input_ext = std::path::Path::new(input_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase());
    matches!(input_ext.as_deref(), Some("gif" | "apng"))
}
