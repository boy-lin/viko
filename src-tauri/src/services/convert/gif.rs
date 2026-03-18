use std::path::Path;

use image::{DynamicImage, GenericImageView, RgbaImage};
use ril::{Image, ImageSequence, LoopCount, Quantizer, ResizeAlgorithm, Rgba};
use tauri::AppHandle;

use crate::events;
use crate::events::TaskEmitter;
use crate::services::compress::image::{ImageCompressionParams, ImageCompressionReport};
use crate::services::convert::image::{ImageConversionParams, ImageConversionReport};
use crate::services::ffmpeg::media_info;
use crate::services::media_tools::watermark::WatermarkConfig;

fn parse_output_format(format: &str, output_path: &str) -> String {
    let normalized = format.trim().to_lowercase();
    if normalized == "gif" || normalized == "apng" {
        return normalized;
    }

    Path::new(output_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .filter(|ext| ext == "gif" || ext == "apng")
        .unwrap_or_else(|| "gif".to_string())
}

fn parse_output_format_optional(format: Option<&str>, output_path: &str) -> String {
    let normalized = format
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());
    if let Some(value) = normalized {
        return parse_output_format(&value, output_path);
    }
    parse_output_format("", output_path)
}

fn map_resize_algorithm(sharpen: bool) -> ResizeAlgorithm {
    if sharpen {
        ResizeAlgorithm::Lanczos3
    } else {
        ResizeAlgorithm::Bilinear
    }
}

fn ril_rgba_to_image_rgba(source: &Image<Rgba>) -> RgbaImage {
    let (width, height) = source.dimensions();
    let mut output = RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let pixel = source.pixel(x, y);
            output.put_pixel(x, y, image::Rgba([pixel.r, pixel.g, pixel.b, pixel.a]));
        }
    }
    output
}

fn image_rgba_to_ril_rgba(source: &RgbaImage) -> Image<Rgba> {
    let (width, height) = source.dimensions();
    Image::from_fn(width, height, |x, y| {
        let pixel = source.get_pixel(x, y);
        Rgba::new(pixel[0], pixel[1], pixel[2], pixel[3])
    })
}

fn apply_watermark(frame: &mut Image<Rgba>, watermark: &WatermarkConfig) -> Result<(), String> {
    let mut rgba = ril_rgba_to_image_rgba(frame);
    watermark.apply_watermark(&mut rgba)?;
    let replaced = image_rgba_to_ril_rgba(&rgba);
    for y in 0..frame.height() {
        for x in 0..frame.width() {
            *frame.pixel_mut(x, y) = *replaced.pixel(x, y);
        }
    }
    Ok(())
}

fn load_sequence(args: &ImageConversionParams) -> Result<ImageSequence<Rgba>, String> {
    load_sequence_from_path(&args.input_path)
}

fn load_sequence_from_path(input_path: &str) -> Result<ImageSequence<Rgba>, String> {
    let input_ext = Path::new(input_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .unwrap_or_default();

    if input_ext == "gif" || input_ext == "apng" {
        return ImageSequence::<Rgba>::open(input_path)
            .and_then(|decoder| decoder.into_sequence())
            .map_err(|error| format!("Failed to open animated image: {}", error));
    }

    let image = Image::<Rgba>::open(input_path)
        .map_err(|error| format!("Failed to open source image: {}", error))?;
    let mut sequence = ImageSequence::<Rgba>::new();
    sequence.push_frame(image.into());
    Ok(sequence)
}

fn crop_whitespace_dynamic(mut img: DynamicImage) -> DynamicImage {
    let (width, height) = img.dimensions();
    if width == 0 || height == 0 {
        return img;
    }

    let top_left_pixel = img.get_pixel(0, 0);
    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0;
    let mut max_y = 0;
    let mut found = false;

    for y in 0..height {
        for x in 0..width {
            if img.get_pixel(x, y) != top_left_pixel {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
                found = true;
            }
        }
    }

    if found {
        img.crop(min_x, min_y, max_x - min_x + 1, max_y - min_y + 1)
    } else {
        img
    }
}

fn compress_frame_image(
    frame: &Image<Rgba>,
    params: &ImageCompressionParams,
) -> Result<Image<Rgba>, String> {
    let mut dynamic = DynamicImage::ImageRgba8(ril_rgba_to_image_rgba(frame));

    if params.crop_whitespace.unwrap_or(false) {
        dynamic = crop_whitespace_dynamic(dynamic);
    }

    let (target_width, target_height) = crate::media_common::calculate_scaled_dimensions(
        dynamic.width(),
        dynamic.height(),
        params.width,
        params.height,
    );
    if target_width != dynamic.width() || target_height != dynamic.height() {
        dynamic = dynamic.resize(target_width, target_height, image::imageops::FilterType::Lanczos3);
    }

    let keep_transparency = params.keep_transparency.unwrap_or(true);
    let target_color_mode = params.color_mode.as_deref().unwrap_or("Default");
    if !keep_transparency || target_color_mode == "RGB" || target_color_mode == "CMYK" {
        if dynamic.color().has_alpha() {
            let mut rgb_img = image::RgbImage::new(dynamic.width(), dynamic.height());
            for (x, y, pixel) in dynamic.pixels() {
                let alpha = pixel[3] as f32 / 255.0;
                let r = (pixel[0] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                let g = (pixel[1] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                let b = (pixel[2] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                rgb_img.put_pixel(x, y, image::Rgb([r, g, b]));
            }
            dynamic = DynamicImage::ImageRgb8(rgb_img);
        }
    }

    if target_color_mode == "Gray" {
        if keep_transparency && dynamic.color().has_alpha() {
            dynamic = DynamicImage::ImageLumaA8(dynamic.to_luma_alpha8());
        } else {
            dynamic = DynamicImage::ImageLuma8(dynamic.to_luma8());
        }
    }

    let mut output = image_rgba_to_ril_rgba(&dynamic.to_rgba8());

    if let Some(colors) = params.colors {
        let palette_size = colors.clamp(2, 256) as usize;
        let quantizer_quality = if let Some(quality) = params.quality {
            let normalized = quality.clamp(1, 100) as f32 / 100.0;
            (1.0 + normalized * 29.0).round() as u8
        } else {
            20
        };
        let (palette, indices) = Quantizer::new()
            .with_palette_size(palette_size)
            .with_gif_optimization(true)
            .with_quality(quantizer_quality.clamp(1, 30))
            .quantize(output.data.as_slice())
            .map_err(|error| format!("Failed to quantize animated frame: {}", error))?;
        let pixels = indices
            .into_iter()
            .map(|index| palette[index as usize])
            .collect::<Vec<_>>();
        output = Image::from_pixels(output.width(), pixels);
    }

    Ok(output)
}

pub fn convert_image_with_ril(
    app: &AppHandle,
    task_id: String,
    task_type: &str,
    args: ImageConversionParams,
) -> Result<ImageConversionReport, String> {
    let emitter = events::window_emitter(
        app,
        task_id,
        task_type.to_string(),
        args.input_file_type
            .clone()
            .unwrap_or_else(|| "image".to_string()),
    )?;

    let mut args = args;
    args.output_path = crate::media_common::ensure_unique_output_path(&args.output_path);

    let mut sequence = load_sequence(&args)?;
    let total_frames = sequence.len().max(1);
    let resize_algorithm = map_resize_algorithm(args.sharpen.unwrap_or(false));

    if let Some(loop_count) = args.loop_count {
        if loop_count == 0 {
            sequence.set_loop_count(LoopCount::Infinite);
        } else if loop_count > 0 {
            sequence.set_loop_count(LoopCount::Exactly(loop_count as u32));
        } else {
            sequence.set_loop_count(LoopCount::Exactly(1));
        }
    }

    for (index, frame) in sequence.iter_mut().enumerate() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }

        let (target_width, target_height) = crate::media_common::calculate_scaled_dimensions(
            frame.width(),
            frame.height(),
            args.width,
            args.height,
        );
        if target_width != frame.width() || target_height != frame.height() {
            frame.resize(target_width, target_height, resize_algorithm);
        }

        if let Some(watermark) = &args.watermark {
            apply_watermark(frame, watermark)?;
        }

        if args.denoise.unwrap_or(false) {
            let blurred = image::imageops::blur(&ril_rgba_to_image_rgba(frame), 0.6);
            let replaced = image_rgba_to_ril_rgba(&blurred);
            for y in 0..frame.height() {
                for x in 0..frame.width() {
                    *frame.pixel_mut(x, y) = *replaced.pixel(x, y);
                }
            }
        }

        let progress = ((index + 1) as f64 / total_frames as f64) * 90.0;
        emitter.emit("progress", Some(progress), None, None);
    }

    let output_format = parse_output_format(&args.format, &args.output_path);
    if output_format == "apng" {
        if !args.output_path.to_lowercase().ends_with(".png") {
            let path = Path::new(&args.output_path);
            let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("output");
            let parent = path.parent().unwrap_or_else(|| Path::new("."));
            args.output_path = parent.join(format!("{stem}.png")).to_string_lossy().to_string();
        }
    }

    sequence
        .save_inferred(&args.output_path)
        .map_err(|error| format!("Failed to save animated image: {}", error))?;

    let output_media = media_info::get_media_details(&args.output_path)?;
    emitter.emit("complete", Some(100.0), Some(args.output_path.clone()), None);
    Ok(ImageConversionReport { output_media })
}

pub fn compress_image_with_ril(
    app: &AppHandle,
    task_id: String,
    task_type: &str,
    mut params: ImageCompressionParams,
) -> Result<ImageCompressionReport, String> {
    let emitter = events::window_emitter(
        app,
        task_id,
        task_type.to_string(),
        "image".to_string(),
    )?;

    params.output_path = crate::media_common::ensure_unique_output_path(&params.output_path);
    let mut sequence = load_sequence_from_path(&params.input_path)?;
    let total_frames = sequence.len().max(1);

    for (index, frame) in sequence.iter_mut().enumerate() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }

        let processed = compress_frame_image(frame, &params)?;
        *frame.image_mut() = processed;

        let progress = ((index + 1) as f64 / total_frames as f64) * 90.0;
        emitter.emit("progress", Some(progress), None, None);
    }

    let output_format = parse_output_format_optional(params.format.as_deref(), &params.output_path);
    if output_format == "apng" && !params.output_path.to_lowercase().ends_with(".png") {
        let path = Path::new(&params.output_path);
        let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("output");
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        params.output_path = parent.join(format!("{stem}.png")).to_string_lossy().to_string();
    }

    sequence
        .save_inferred(&params.output_path)
        .map_err(|error| format!("Failed to save animated image: {}", error))?;

    let output_media = media_info::get_media_details(&params.output_path)?;
    emitter.emit("complete", Some(100.0), Some(params.output_path.clone()), None);
    Ok(ImageCompressionReport { output_media })
}
