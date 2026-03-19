use std::fs::{self, File};
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;

use ffmpeg_next as ffmpeg;
use gifski::{progress::NoProgress, Repeat, Settings};
use image::codecs::gif::{GifDecoder, GifEncoder, Repeat as GifRepeat};
use image::codecs::png::PngDecoder;
use image::{AnimationDecoder, Delay, DynamicImage, Frame, GenericImageView, RgbaImage};
use imgref::ImgVec;
use rgb::RGBA8;
use tauri::{AppHandle, Manager};

use crate::commands::GifConversionArgs;
use crate::events;
use crate::events::TaskEmitter;
use crate::media_common;
use crate::services::animated_image::{ImageCompressionParams, ImageCompressionReport};
use crate::services::convert::image::{ImageConversionParams, ImageConversionReport};
use crate::services::ffmpeg::media_info;

#[derive(Clone)]
struct AnimatedFrameData {
    image: RgbaImage,
    delay_ms: u32,
}

struct FrameTransformOptions<'a> {
    width: Option<u32>,
    height: Option<u32>,
    watermark: Option<&'a crate::services::media_tools::watermark::WatermarkConfig>,
    denoise: bool,
    sharpen: bool,
    color_mode: Option<&'a str>,
    crop_whitespace: bool,
    keep_transparency: bool,
}

fn parse_output_format(format: &str, output_path: &str) -> String {
    let normalized = format.trim().to_lowercase();
    if normalized == "gif" || normalized == "apng" {
        return normalized;
    }

    Path::new(output_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .filter(|ext| ext == "gif" || ext == "png")
        .map(|ext| if ext == "png" { "apng".to_string() } else { ext })
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

fn is_video_input(input_path: &str, input_file_type: Option<&str>) -> bool {
    if matches!(input_file_type, Some("video")) {
        return true;
    }

    Path::new(input_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_lowercase().as_str(),
                "mp4"
                    | "mov"
                    | "mkv"
                    | "avi"
                    | "wmv"
                    | "webm"
                    | "flv"
                    | "3gp"
                    | "mpg"
                    | "mpeg"
                    | "vob"
                    | "ogv"
                    | "m4v"
                    | "ts"
                    | "m2ts"
            )
        })
        .unwrap_or(false)
}

fn is_apng_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("png"))
        .unwrap_or(false)
}

fn filter_type(sharpen: bool) -> image::imageops::FilterType {
    if sharpen {
        image::imageops::FilterType::Lanczos3
    } else {
        image::imageops::FilterType::Triangle
    }
}

fn repeat_from_loop_count(loop_count: Option<i32>) -> Repeat {
    match loop_count.unwrap_or(0) {
        value if value < 0 => Repeat::Finite(1),
        0 => Repeat::Infinite,
        value => Repeat::Finite(value as u16),
    }
}

fn gif_repeat_from_loop_count(loop_count: Option<i32>) -> GifRepeat {
    match loop_count.unwrap_or(0) {
        value if value < 0 => GifRepeat::Finite(1),
        0 => GifRepeat::Infinite,
        value => GifRepeat::Finite(value as u16),
    }
}

fn build_gifski_settings(width: Option<u32>, height: Option<u32>, quality: Option<u32>, loop_count: Option<i32>) -> Settings {
    Settings {
        width,
        height,
        quality: quality.unwrap_or(80) as u8,
        fast: quality.unwrap_or(80) < 50,
        repeat: repeat_from_loop_count(loop_count),
    }
}

fn rgba_image_to_imgvec(image: &RgbaImage) -> ImgVec<RGBA8> {
    let pixels = image
        .pixels()
        .map(|pixel| RGBA8::new(pixel[0], pixel[1], pixel[2], pixel[3]))
        .collect::<Vec<_>>();
    ImgVec::new(pixels, image.width() as usize, image.height() as usize)
}

fn delay_ms_from_frame(frame: &Frame) -> u32 {
    let duration = std::time::Duration::from(frame.delay());
    duration.as_millis().clamp(1, u128::from(u32::MAX)) as u32
}

fn frame_delay_from_args(frame_rate: Option<f32>, frame_delay: Option<u32>) -> u32 {
    if let Some(delay) = frame_delay {
        return delay.max(1);
    }
    if let Some(fps) = frame_rate {
        return ((1000.0 / fps.max(1.0)) as u32).max(1);
    }
    100
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

fn flatten_alpha_to_white(dynamic: &DynamicImage) -> DynamicImage {
    let mut rgb_img = image::RgbImage::new(dynamic.width(), dynamic.height());
    for (x, y, pixel) in dynamic.to_rgba8().enumerate_pixels() {
        let alpha = pixel[3] as f32 / 255.0;
        let r = (pixel[0] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
        let g = (pixel[1] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
        let b = (pixel[2] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
        rgb_img.put_pixel(x, y, image::Rgb([r, g, b]));
    }
    DynamicImage::ImageRgb8(rgb_img)
}

fn transform_frame(
    source: RgbaImage,
    options: &FrameTransformOptions<'_>,
) -> Result<RgbaImage, String> {
    let mut dynamic = DynamicImage::ImageRgba8(source);

    if options.crop_whitespace {
        dynamic = crop_whitespace_dynamic(dynamic);
    }

    let (target_width, target_height) = crate::media_common::calculate_scaled_dimensions(
        dynamic.width(),
        dynamic.height(),
        options.width,
        options.height,
    );
    if target_width != dynamic.width() || target_height != dynamic.height() {
        dynamic = dynamic.resize_exact(target_width, target_height, filter_type(options.sharpen));
    }

    if let Some(watermark) = options.watermark {
        let mut rgba = dynamic.to_rgba8();
        watermark.apply_watermark(&mut rgba)?;
        dynamic = DynamicImage::ImageRgba8(rgba);
    }

    if options.denoise {
        dynamic = DynamicImage::ImageRgba8(image::imageops::blur(&dynamic.to_rgba8(), 0.6));
    }

    if !options.keep_transparency && dynamic.color().has_alpha() {
        dynamic = flatten_alpha_to_white(&dynamic);
    }

    let color_mode = options
        .color_mode
        .unwrap_or("default")
        .trim()
        .to_lowercase();
    if color_mode == "gray" || color_mode == "grayscale" {
        if options.keep_transparency && dynamic.color().has_alpha() {
            dynamic = DynamicImage::ImageLumaA8(dynamic.to_luma_alpha8());
        } else {
            dynamic = DynamicImage::ImageLuma8(dynamic.to_luma8());
        }
        dynamic = DynamicImage::ImageRgba8(dynamic.to_rgba8());
    }

    Ok(dynamic.to_rgba8())
}

fn load_frames_from_image_path(input_path: &str, default_delay_ms: u32) -> Result<Vec<AnimatedFrameData>, String> {
    let path = Path::new(input_path);
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .unwrap_or_default();

    if ext == "gif" {
        let reader = BufReader::new(
            File::open(input_path).map_err(|error| format!("打开 GIF 输入文件失败: {}", error))?,
        );
        let decoder = GifDecoder::new(reader).map_err(|error| format!("解析 GIF 输入失败: {}", error))?;
        let frames = decoder
            .into_frames()
            .collect_frames()
            .map_err(|error| format!("读取 GIF 帧失败: {}", error))?;
        return Ok(frames
            .into_iter()
            .map(|frame| {
                let delay_ms = delay_ms_from_frame(&frame);
                let image = frame.into_buffer();
                AnimatedFrameData { image, delay_ms }
            })
            .collect());
    }

    if ext == "png" {
        let reader = BufReader::new(
            File::open(input_path).map_err(|error| format!("打开 PNG 输入文件失败: {}", error))?,
        );
        let decoder = PngDecoder::new(reader).map_err(|error| format!("解析 PNG 输入失败: {}", error))?;
        let frames = decoder
            .apng()
            .map_err(|error| format!("解析 APNG 输入失败: {}", error))?
            .into_frames()
            .collect_frames()
            .map_err(|error| format!("读取 APNG 帧失败: {}", error))?;
        if !frames.is_empty() {
            return Ok(frames
                .into_iter()
                .map(|frame| {
                    let delay_ms = delay_ms_from_frame(&frame);
                    let image = frame.into_buffer();
                    AnimatedFrameData { image, delay_ms }
                })
                .collect());
        }
    }

    let image = image::open(input_path)
        .map_err(|error| format!("打开源图片失败: {}", error))?
        .to_rgba8();
    Ok(vec![AnimatedFrameData {
        image,
        delay_ms: default_delay_ms,
    }])
}

fn pts_to_seconds(pts: i64, time_base: ffmpeg::Rational) -> f64 {
    (pts as f64) * (time_base.0 as f64) / (time_base.1 as f64)
}

fn decode_frame_to_rgba(
    decoded: &ffmpeg::frame::Video,
    scaler: &mut ffmpeg::software::scaling::context::Context,
) -> Result<RgbaImage, String> {
    let mut rgba_frame = ffmpeg::frame::Video::empty();
    scaler
        .run(decoded, &mut rgba_frame)
        .map_err(|error| format!("视频帧缩放失败: {}", error))?;

    let width = rgba_frame.width();
    let height = rgba_frame.height();
    let stride = rgba_frame.stride(0);
    let data = rgba_frame.data(0);
    if data.len() < stride * height as usize {
        return Err("RGBA 帧缓冲区大小异常".to_string());
    }

    let mut output = RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let idx = y as usize * stride + x as usize * 4;
            if idx + 3 < data.len() {
                output.put_pixel(
                    x,
                    y,
                    image::Rgba([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]),
                );
            }
        }
    }
    Ok(output)
}

fn collect_video_frames<E: TaskEmitter>(
    emitter: &E,
    args: &GifConversionArgs,
) -> Result<Vec<AnimatedFrameData>, String> {
    media_common::init_ffmpeg()?;
    let mut input_ctx = media_common::open_input(&args.input_path)?;
    let input_duration = input_ctx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    let input_stream = input_ctx
        .streams()
        .best(ffmpeg::media::Type::Video)
        .ok_or_else(|| "未找到视频流".to_string())?;
    let stream_index = input_stream.index();
    let stream_time_base = input_stream.time_base();
    let codec_context = ffmpeg::codec::context::Context::from_parameters(input_stream.parameters())
        .map_err(|error| format!("创建视频解码器失败: {}", error))?;
    let mut decoder = codec_context
        .decoder()
        .video()
        .map_err(|error| format!("初始化视频解码器失败: {}", error))?;

    let source_width = decoder.width().max(1);
    let source_height = decoder.height().max(1);
    let (target_width, target_height) = crate::media_common::calculate_scaled_dimensions(
        source_width,
        source_height,
        args.width,
        args.height,
    );
    let mut scaler = ffmpeg::software::scaling::context::Context::get(
        decoder.format(),
        source_width,
        source_height,
        ffmpeg::format::Pixel::RGBA,
        target_width,
        target_height,
        ffmpeg::software::scaling::flag::Flags::BILINEAR,
    )
    .map_err(|error| format!("创建缩放器失败: {}", error))?;

    let min_frame_interval = f64::from(frame_delay_from_args(args.frame_rate, args.frame_delay)) / 1000.0;
    let delay_ms = frame_delay_from_args(args.frame_rate, args.frame_delay);
    let options = FrameTransformOptions {
        width: args.width,
        height: args.height,
        watermark: args.watermark.as_ref(),
        denoise: args.denoise.unwrap_or(false),
        sharpen: args.sharpen.unwrap_or(false),
        color_mode: args.color_mode.as_deref(),
        crop_whitespace: false,
        keep_transparency: args.preserve_transparency.unwrap_or(true),
    };

    let mut frames = Vec::new();
    let mut next_capture_seconds = 0.0f64;
    let mut last_progress = 0.0f64;

    let mut push_frame = |decoded: &ffmpeg::frame::Video| -> Result<(), String> {
        let frame_pts = decoded.pts().unwrap_or(frames.len() as i64);
        let pts_seconds = pts_to_seconds(frame_pts, stream_time_base);
        if !frames.is_empty() && pts_seconds + 0.000_001 < next_capture_seconds {
            return Ok(());
        }

        let rgba = decode_frame_to_rgba(decoded, &mut scaler)?;
        let image = transform_frame(rgba, &options)?;
        frames.push(AnimatedFrameData { image, delay_ms });
        next_capture_seconds = pts_seconds + min_frame_interval;

        if input_duration > 0.0 {
            let progress = ((pts_seconds / input_duration).clamp(0.0, 1.0) * 92.0).max(last_progress);
            if progress - last_progress >= 0.5 {
                last_progress = progress;
                emitter.emit("progress", Some(progress), None, None);
            }
        }
        Ok(())
    };

    for (stream, packet) in input_ctx.packets() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }
        if stream.index() != stream_index {
            continue;
        }

        decoder
            .send_packet(&packet)
            .map_err(|error| format!("发送视频包到解码器失败: {}", error))?;
        let mut decoded = ffmpeg::frame::Video::empty();
        while decoder.receive_frame(&mut decoded).is_ok() {
            push_frame(&decoded)?;
        }
    }

    decoder
        .send_eof()
        .map_err(|error| format!("刷新视频解码器失败: {}", error))?;
    let mut decoded = ffmpeg::frame::Video::empty();
    while decoder.receive_frame(&mut decoded).is_ok() {
        push_frame(&decoded)?;
    }

    if frames.is_empty() {
        return Err("未解码到可用于动画编码的视频帧".to_string());
    }

    Ok(frames)
}

fn collect_image_conversion_frames<E: TaskEmitter>(
    emitter: &E,
    args: &ImageConversionParams,
) -> Result<Vec<AnimatedFrameData>, String> {
    let frames = load_frames_from_image_path(&args.input_path, frame_delay_from_args(args.frame_rate, args.frame_delay))?;
    let total = frames.len().max(1);
    let options = FrameTransformOptions {
        width: args.width,
        height: args.height,
        watermark: args.watermark.as_ref(),
        denoise: args.denoise.unwrap_or(false),
        sharpen: args.sharpen.unwrap_or(false),
        color_mode: args.color_mode.as_deref(),
        crop_whitespace: false,
        keep_transparency: args.preserve_transparency.unwrap_or(true),
    };

    let mut processed = Vec::with_capacity(frames.len());
    for (index, frame) in frames.into_iter().enumerate() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }
        let image = transform_frame(frame.image, &options)?;
        processed.push(AnimatedFrameData {
            image,
            delay_ms: frame.delay_ms,
        });
        let progress = ((index + 1) as f64 / total as f64) * 85.0;
        emitter.emit("progress", Some(progress), None, None);
    }
    Ok(processed)
}

fn collect_image_compression_frames<E: TaskEmitter>(
    emitter: &E,
    params: &ImageCompressionParams,
) -> Result<Vec<AnimatedFrameData>, String> {
    let frames = load_frames_from_image_path(&params.input_path, 100)?;
    let total = frames.len().max(1);
    let options = FrameTransformOptions {
        width: params.width,
        height: params.height,
        watermark: None,
        denoise: false,
        sharpen: true,
        color_mode: params.color_mode.as_deref(),
        crop_whitespace: params.crop_whitespace.unwrap_or(false),
        keep_transparency: params.keep_transparency.unwrap_or(true),
    };

    let mut processed = Vec::with_capacity(frames.len());
    for (index, frame) in frames.into_iter().enumerate() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }
        let image = transform_frame(frame.image, &options)?;
        processed.push(AnimatedFrameData {
            image,
            delay_ms: frame.delay_ms,
        });
        let progress = ((index + 1) as f64 / total as f64) * 85.0;
        emitter.emit("progress", Some(progress), None, None);
    }
    Ok(processed)
}

fn encode_gif_frames_with_gifski(
    output_path: &str,
    frames: &[AnimatedFrameData],
    quality: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
    loop_count: Option<i32>,
) -> Result<(), String> {
    let settings = build_gifski_settings(width, height, quality, loop_count);
    let (mut collector, writer) =
        gifski::new(settings).map_err(|error| format!("初始化 gifski 失败: {}", error))?;
    let output_file =
        File::create(output_path).map_err(|error| format!("创建 GIF 输出文件失败: {}", error))?;
    let writer_handle = thread::spawn(move || -> Result<(), String> {
        writer
            .write(output_file, &mut NoProgress {})
            .map_err(|error| format!("写入 GIF 失败: {}", error))
    });

    let mut timestamp = 0.0f64;
    for (index, frame) in frames.iter().enumerate() {
        let img = rgba_image_to_imgvec(&frame.image);
        collector
            .add_frame_rgba(index, img, timestamp)
            .map_err(|error| format!("添加 GIF 帧失败: {}", error))?;
        timestamp += f64::from(frame.delay_ms.max(1)) / 1000.0;
    }

    drop(collector);
    writer_handle
        .join()
        .map_err(|_| "gifski 写入线程异常退出".to_string())??;
    Ok(())
}

fn encode_gif_frames_with_image(
    output_path: &str,
    frames: Vec<AnimatedFrameData>,
    loop_count: Option<i32>,
) -> Result<(), String> {
    let file = File::create(output_path).map_err(|error| format!("创建 GIF 输出文件失败: {}", error))?;
    let mut encoder = GifEncoder::new(file);
    encoder
        .set_repeat(gif_repeat_from_loop_count(loop_count))
        .map_err(|error| format!("设置 GIF 循环次数失败: {}", error))?;

    let image_frames = frames.into_iter().map(|frame| {
        Frame::from_parts(
            frame.image,
            0,
            0,
            Delay::from_numer_denom_ms(frame.delay_ms.max(1), 1),
        )
    });
    encoder
        .encode_frames(image_frames)
        .map_err(|error| format!("编码 GIF 帧失败: {}", error))
}

fn resolve_ffmpeg_executable(app: &AppHandle) -> String {
    if cfg!(target_os = "windows") {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let candidate = exe_dir.join("ffmpeg.exe");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(resource_dir) = app.path().resource_dir() {
            let candidates = [
                resource_dir.join("ffmpeg.exe"),
                resource_dir.join("resources").join("ffmpeg.exe"),
                resource_dir.join("ffmpeg").join("windows").join("ffmpeg.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }
    }

    "ffmpeg".to_string()
}

fn temp_frames_dir(prefix: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "figurex_{}_{}_{}",
        prefix,
        std::process::id(),
        crate::shared::get_millis()
    ))
}

fn encode_apng_frames_with_ffmpeg(
    app: &AppHandle,
    output_path: &str,
    frames: &[AnimatedFrameData],
    loop_count: Option<i32>,
) -> Result<(), String> {
    let temp_dir = temp_frames_dir("apng");
    fs::create_dir_all(&temp_dir).map_err(|error| format!("创建 APNG 临时目录失败: {}", error))?;

    let result = (|| -> Result<(), String> {
        for (index, frame) in frames.iter().enumerate() {
            let frame_path = temp_dir.join(format!("frame_{index:06}.png"));
            frame
                .image
                .save(&frame_path)
                .map_err(|error| format!("写入 APNG 临时帧失败: {}", error))?;
        }

        let concat_path = temp_dir.join("frames.txt");
        let mut concat_file =
            File::create(&concat_path).map_err(|error| format!("创建 APNG 列表文件失败: {}", error))?;
        for (index, frame) in frames.iter().enumerate() {
            let frame_path = temp_dir.join(format!("frame_{index:06}.png"));
            writeln!(concat_file, "file '{}'", frame_path.to_string_lossy().replace('\'', "'\\''"))
                .map_err(|error| format!("写入 APNG 列表文件失败: {}", error))?;
            writeln!(concat_file, "duration {}", f64::from(frame.delay_ms.max(1)) / 1000.0)
                .map_err(|error| format!("写入 APNG 帧时长失败: {}", error))?;
        }
        if let Some(last_index) = frames.len().checked_sub(1) {
            let last_frame_path = temp_dir.join(format!("frame_{last_index:06}.png"));
            writeln!(
                concat_file,
                "file '{}'",
                last_frame_path.to_string_lossy().replace('\'', "'\\''")
            )
            .map_err(|error| format!("写入 APNG 尾帧失败: {}", error))?;
        }

        let ffmpeg_path = resolve_ffmpeg_executable(app);
        let plays = loop_count.unwrap_or(0).max(0).to_string();
        let status = Command::new(&ffmpeg_path)
            .args([
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_path.to_string_lossy().as_ref(),
                "-plays",
                plays.as_str(),
                "-pix_fmt",
                "rgba",
                "-f",
                "apng",
                output_path,
            ])
            .status()
            .map_err(|error| format!("启动 ffmpeg 生成 APNG 失败: {}", error))?;

        if !status.success() {
            return Err(format!("ffmpeg 生成 APNG 失败，退出码: {:?}", status.code()));
        }
        Ok(())
    })();

    let _ = fs::remove_dir_all(&temp_dir);
    result
}

pub fn convert_to_gif<E: TaskEmitter>(
    emitter: E,
    args: GifConversionArgs,
) -> Result<ImageConversionReport, String> {
    let output_path = args
        .output_path
        .as_ref()
        .filter(|path| !path.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| {
            let input_path = Path::new(&args.input_path);
            let stem = input_path.file_stem().and_then(|value| value.to_str()).unwrap_or("output");
            let parent = input_path.parent().unwrap_or_else(|| Path::new("."));
            parent.join(format!("{stem}.gif")).to_string_lossy().to_string()
        });
    let output_path = crate::media_common::ensure_unique_output_path(&output_path);
    emitter.emit("progress", Some(0.0), None, None);

    let frames = if is_video_input(&args.input_path, args.input_file_type.as_deref()) {
        collect_video_frames(&emitter, &args)?
    } else {
        let image_args = ImageConversionParams {
            task_id: args.task_id,
            input_path: args.input_path,
            input_file_type: args.input_file_type,
            output_path: output_path.clone(),
            width: args.width,
            height: args.height,
            format: "gif".to_string(),
            image_encoder: None,
            frame_rate: args.frame_rate,
            quality: args.quality,
            preserve_transparency: args.preserve_transparency,
            color_mode: args.color_mode,
            dpi: args.dpi,
            loop_count: args.loop_count,
            frame_delay: args.frame_delay,
            colors: args.colors,
            preserve_extensions: args.preserve_extensions,
            sharpen: args.sharpen,
            denoise: args.denoise,
            watermark: args.watermark,
        };
        collect_image_conversion_frames(&emitter, &image_args)?
    };

    if frames.len() > 1 {
        encode_gif_frames_with_gifski(
            &output_path,
            &frames,
            args.quality,
            args.width,
            args.height,
            args.loop_count,
        )?;
    } else {
        encode_gif_frames_with_image(&output_path, frames, args.loop_count)?;
    }

    let output_media = media_info::get_media_details(&output_path)?;
    emitter.emit("complete", Some(100.0), Some(output_path.clone()), None);
    Ok(ImageConversionReport { output_media })
}

pub fn convert_to_apng<E: TaskEmitter>(
    app: &AppHandle,
    emitter: E,
    args: GifConversionArgs,
) -> Result<ImageConversionReport, String> {
    let output_path = args
        .output_path
        .as_ref()
        .filter(|path| !path.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| {
            let input_path = Path::new(&args.input_path);
            let stem = input_path.file_stem().and_then(|value| value.to_str()).unwrap_or("output");
            let parent = input_path.parent().unwrap_or_else(|| Path::new("."));
            parent.join(format!("{stem}.png")).to_string_lossy().to_string()
        });
    let mut output_path = crate::media_common::ensure_unique_output_path(&output_path);
    if !is_apng_path(&output_path) {
        let path = Path::new(&output_path);
        let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("output");
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        output_path = parent.join(format!("{stem}.png")).to_string_lossy().to_string();
    }

    emitter.emit("progress", Some(0.0), None, None);
    let frames = if is_video_input(&args.input_path, args.input_file_type.as_deref()) {
        collect_video_frames(&emitter, &args)?
    } else {
        let image_args = ImageConversionParams {
            task_id: args.task_id,
            input_path: args.input_path,
            input_file_type: args.input_file_type,
            output_path: output_path.clone(),
            width: args.width,
            height: args.height,
            format: "apng".to_string(),
            image_encoder: None,
            frame_rate: args.frame_rate,
            quality: args.quality,
            preserve_transparency: args.preserve_transparency,
            color_mode: args.color_mode,
            dpi: args.dpi,
            loop_count: args.loop_count,
            frame_delay: args.frame_delay,
            colors: args.colors,
            preserve_extensions: args.preserve_extensions,
            sharpen: args.sharpen,
            denoise: args.denoise,
            watermark: args.watermark,
        };
        collect_image_conversion_frames(&emitter, &image_args)?
    };

    encode_apng_frames_with_ffmpeg(app, &output_path, &frames, args.loop_count)?;
    let output_media = media_info::get_media_details(&output_path)?;
    emitter.emit("complete", Some(100.0), Some(output_path.clone()), None);
    Ok(ImageConversionReport { output_media })
}

pub fn convert_animated_image(
    app: &AppHandle,
    task_id: String,
    task_type: &str,
    args: ImageConversionParams,
) -> Result<ImageConversionReport, String> {
    let emitter = events::window_emitter(
        app,
        task_id,
        task_type.to_string(),
        args.input_file_type.clone().unwrap_or_else(|| "image".to_string()),
    )?;

    let output_format = parse_output_format(&args.format, &args.output_path);
    let output_path = crate::media_common::ensure_unique_output_path(&args.output_path);
    let animated_args = GifConversionArgs {
        task_id: args.task_id,
        input_path: args.input_path,
        input_file_type: args.input_file_type,
        output_path: Some(output_path),
        format: output_format.clone(),
        width: args.width,
        height: args.height,
        frame_rate: args.frame_rate,
        quality: args.quality,
        preserve_transparency: args.preserve_transparency,
        color_mode: args.color_mode,
        dpi: args.dpi,
        loop_count: args.loop_count,
        frame_delay: args.frame_delay,
        colors: args.colors,
        preserve_extensions: args.preserve_extensions,
        sharpen: args.sharpen,
        denoise: args.denoise,
        watermark: args.watermark,
    };

    if output_format == "apng" {
        convert_to_apng(app, emitter, animated_args)
    } else {
        convert_to_gif(emitter, animated_args)
    }
}

pub fn compress_animated_image(
    app: &AppHandle,
    task_id: String,
    task_type: &str,
    mut params: ImageCompressionParams,
) -> Result<ImageCompressionReport, String> {
    let emitter = events::window_emitter(app, task_id, task_type.to_string(), "image".to_string())?;
    params.output_path = crate::media_common::ensure_unique_output_path(&params.output_path);

    emitter.emit("progress", Some(0.0), None, None);
    let frames = collect_image_compression_frames(&emitter, &params)?;
    let output_format = parse_output_format_optional(params.format.as_deref(), &params.output_path);

    let mut output_path = params.output_path.clone();
    if output_format == "apng" {
        if !is_apng_path(&output_path) {
            let path = Path::new(&output_path);
            let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("output");
            let parent = path.parent().unwrap_or_else(|| Path::new("."));
            output_path = parent.join(format!("{stem}.png")).to_string_lossy().to_string();
        }
        encode_apng_frames_with_ffmpeg(app, &output_path, &frames, None)?;
    } else {
        encode_gif_frames_with_gifski(
            &output_path,
            &frames,
            params.quality,
            params.width,
            params.height,
            None,
        )?;
    }

    let output_media = media_info::get_media_details(&output_path)?;
    emitter.emit("complete", Some(100.0), Some(output_path.clone()), None);
    Ok(ImageCompressionReport { output_media })
}
