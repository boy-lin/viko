use crate::events::TaskEmitter;
use crate::media_common;
use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, PngEncoder};
use image::codecs::webp::WebPEncoder;
use image::imageops::FilterType;
use image::{GenericImageView, ImageEncoder, ImageFormat};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::BufWriter;

/// 图片压缩参数
#[derive(Deserialize)]
pub struct ImageCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub quality: Option<u32>,            // 0-100，质量百分比
    pub format: Option<String>,          // "jpg", "png", "webp" 等
    pub width: Option<u32>,              // 目标宽度
    pub height: Option<u32>,             // 目标高度
    pub color_mode: Option<String>,      // "RGB", "RGBA", "Gray", "CMYK" (转RGB)
    pub colors: Option<u32>,             // GIF/APNG 调色板颜色数
    pub strip_metadata: Option<bool>,    // 是否去除元数据(默认去除)
    pub keep_transparency: Option<bool>, // 是否保留透明通道
    pub dpi: Option<f64>,                // 图片分辨率密度(DPI)
    pub crop_whitespace: Option<bool>,   // 是否裁剪冗余白边 (自动裁剪空白)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageCompressionReport {
    pub output_media: MediaDetails,
}

pub fn is_animated_image_target(
    format: Option<&str>,
    output_path: &str,
    input_path: &str,
) -> bool {
    let normalized = format
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());
    if matches!(normalized.as_deref(), Some("gif" | "apng")) {
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

// 仍待优化：strip_metadata、dpi 参数未实际生效，WebP 质量粒度受当前编码器限制。
/// 使用图片库压缩图片文件
pub fn compress_image_file<E: TaskEmitter>(
    emitter: E,
    params: ImageCompressionParams,
) -> Result<ImageCompressionReport, String> {
    let mut params = params;
    params.output_path = media_common::ensure_unique_output_path(&params.output_path);
    // 发送初始进度
    emitter.emit("progress", Some(10.0), None, None);

    // 1. 读取图片
    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }
    let mut img =
        image::open(&params.input_path).map_err(|e| format!("无法打开图片文件: {}", e))?;

    emitter.emit("progress", Some(20.0), None, None);

    // 2. 自动裁剪 (Crop Whitespace)
    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }
    if params.crop_whitespace.unwrap_or(false) {
        // 简单实现：基于左上角像素颜色进行裁剪
        let (width, height) = img.dimensions();
        if width > 0 && height > 0 {
            let top_left_pixel = img.get_pixel(0, 0);

            let mut min_x = width;
            let mut result_min_y = height; // rename to avoid confusion
            let mut max_x = 0;
            let mut max_y = 0;

            let mut found = false;

            for y in 0..height {
                for x in 0..width {
                    if img.get_pixel(x, y) != top_left_pixel {
                        if x < min_x {
                            min_x = x;
                        }
                        if x > max_x {
                            max_x = x;
                        }
                        if y < result_min_y {
                            result_min_y = y;
                        }
                        if y > max_y {
                            max_y = y;
                        }
                        found = true;
                    }
                }
            }

            if found {
                let crop_width = max_x - min_x + 1;
                let crop_height = max_y - result_min_y + 1;
                img = img.crop(min_x, result_min_y, crop_width, crop_height);
            }
        }
    }

    emitter.emit("progress", Some(40.0), None, None);

    // 3. 调整大小 (Resize)
    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }
    // 如果指定了宽高
    if params.width.is_some() || params.height.is_some() {
        let current_ratio = img.width() as f64 / img.height() as f64;

        let target_width = params.width.unwrap_or_else(|| {
            // 如果只给了高度，按比例算宽度
            (params.height.unwrap() as f64 * current_ratio) as u32
        });

        let target_height = params.height.unwrap_or_else(|| {
            // 如果只给了宽度，按比例算高度
            (params.width.unwrap() as f64 / current_ratio) as u32
        });

        // 使用 Lanczos3 算法保证较高的压缩质量
        img = img.resize(target_width, target_height, FilterType::Lanczos3);
    }

    emitter.emit("progress", Some(60.0), None, None);

    // 4. 颜色模式与透明度处理
    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }
    let keep_transparency = params.keep_transparency.unwrap_or(true);
    let target_color_mode = params.color_mode.as_deref().unwrap_or("Default");

    if !keep_transparency || target_color_mode == "RGB" || target_color_mode == "CMYK" {
        // 去除透明通道：合成白色背景
        if img.color().has_alpha() {
            let mut rgb_img = image::RgbImage::new(img.width(), img.height());
            for (x, y, pixel) in img.pixels() {
                // 简单的 alpha 叠加 (Matte white)
                let alpha = pixel[3] as f32 / 255.0;
                let r = (pixel[0] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                let g = (pixel[1] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                let b = (pixel[2] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                rgb_img.put_pixel(x, y, image::Rgb([r, g, b]));
            }
            img = image::DynamicImage::ImageRgb8(rgb_img);
        }
    }

    // 灰度模式
    if target_color_mode == "Gray" {
        if keep_transparency && img.color().has_alpha() {
            img = image::DynamicImage::ImageLumaA8(img.to_luma_alpha8());
        } else {
            img = image::DynamicImage::ImageLuma8(img.to_luma8());
        }
    }

    // CMYK 目前 image crate 支持有限，默认转为 RGB 保存

    // 5. 确定格式和保存
    if crate::task::cancel::is_cancelled() {
        return Err("Task cancelled".to_string());
    }
    let output_ext = params
        .output_path
        .split('.')
        .last()
        .unwrap_or("jpg")
        .to_lowercase();
    let format_override = params.format.as_deref().unwrap_or(&output_ext);

    let save_format = match format_override {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "webp" => ImageFormat::WebP,
        "gif" => ImageFormat::Gif,
        "bmp" => ImageFormat::Bmp,
        "tiff" | "tif" => ImageFormat::Tiff,
        "ico" => ImageFormat::Ico,
        _ => ImageFormat::Jpeg,
    };

    let file = File::create(&params.output_path).map_err(|e| format!("无法创建输出文件: {}", e))?;
    let mut writer = BufWriter::new(file);

    emitter.emit("progress", Some(80.0), None, None);

    // 根据格式使用特定的Encoder
    match save_format {
        ImageFormat::Jpeg => {
            let quality = params.quality.unwrap_or(80).clamp(1, 100) as u8; // JpegEncoder uses u8 (1-100)
            let encoder = JpegEncoder::new_with_quality(writer, quality);
            encoder
                .write_image(
                    img.as_bytes(),
                    img.width(),
                    img.height(),
                    img.color().into(),
                )
                .map_err(|e| format!("JPEG 编码失败: {}", e))?;
        }
        ImageFormat::Png => {
            // Map quality 0-100 to CompressionType
            let quality = params.quality.unwrap_or(70).clamp(0, 100);
            let compression = if quality > 90 {
                CompressionType::Best
            } else if quality > 50 {
                CompressionType::Default
            } else {
                CompressionType::Fast
            };

            let encoder = PngEncoder::new_with_quality(
                writer,
                compression,
                image::codecs::png::FilterType::Adaptive,
            );
            encoder
                .write_image(
                    img.as_bytes(),
                    img.width(),
                    img.height(),
                    img.color().into(),
                )
                .map_err(|e| format!("PNG 编码失败: {}", e))?;
        }
        ImageFormat::WebP => {
            // image-webp: encode() 走默认有损质量，encode_lossless() 走无损；暂未暴露质量控制
            let quality = params.quality.unwrap_or(80).clamp(0, 100);
            if quality >= 100 {
                let encoder = WebPEncoder::new_lossless(writer);
                encoder
                    .write_image(
                        img.as_bytes(),
                        img.width(),
                        img.height(),
                        img.color().into(),
                    )
                    .map_err(|e| format!("WebP 编码失败: {}", e))?;
            } else {
                // WebPEncoder 没有 new()，用通用写入走默认有损编码
                img.write_to(&mut writer, ImageFormat::WebP)
                    .map_err(|e| format!("WebP 编码失败: {}", e))?;
            }
        }
        _ => {
            // Fallback for other formats
            img.write_to(&mut writer, save_format)
                .map_err(|e| format!("保存图片失败: {}", e))?;
        }
    }

    let output_path = params.output_path.clone();
    emitter.emit("complete", Some(100.0), Some(output_path.clone()), None);

    let size = std::fs::metadata(&output_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let ext = std::path::Path::new(&output_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let stream = StreamDetails {
        index: 0,
        codec_type: "video".to_string(),
        codec_name: ext.clone(),
        codec_long_name: None,
        time_base: None,
        pix_fmt: Some(format!("{:?}", img.color())),
        width: Some(img.width()),
        height: Some(img.height()),
        frame_rate: None,
        channels: None,
        sample_rate: None,
        bit_rate: None,
        bit_depth: None,
        bits_per_sample: None,
    };
    let output_media = MediaDetails {
        path: output_path,
        extension: ext.clone(),
        format_names: ext,
        format_long_name: None,
        duration: 0.0,
        size,
        streams: vec![stream],
        tags: HashMap::new(),
        stream_tags: Vec::new(),
    };

    Ok(ImageCompressionReport { output_media })
}

