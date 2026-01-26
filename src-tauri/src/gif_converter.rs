use ffmpeg::{codec, encoder, format, frame, media, packet, software, Rational};
use ffmpeg_next as ffmpeg;
use serde::Deserialize;
use std::time::Instant;
use crate::events::TaskEmitter;
use crate::media_common;

/// GIF 转换参数（全部可选）
#[derive(Deserialize, Clone)]
pub struct GifConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub width: Option<u32>,              // 目标宽度
    pub height: Option<u32>,             // 目标高度
    pub quality: Option<u32>,            // 画质 0-100
    pub preserve_transparency: Option<bool>, // 保留透明通道
    pub color_mode: Option<String>,      // "rgb" | "grayscale"
    pub dpi: Option<f64>,                // 元数据记录 DPI
    pub frame_rate: Option<f32>,         // 帧率 (fps)
    pub loop_count: Option<i32>,         // 0=无限, -1=不循环
    pub frame_delay: Option<u32>,        // 每帧延迟 ms，优先生效
    pub colors: Option<u32>,             // 色彩数 2-256
    pub preserve_extensions: Option<bool>, // 预留（当前未改写扩展块）
    pub sharpen: Option<bool>,           // 锐化
    pub denoise: Option<bool>,           // 降噪
}

fn pick_pixel_format(color_mode: Option<&str>) -> format::Pixel {
    let mode = color_mode.unwrap_or("rgb").to_lowercase();
    if mode == "grayscale" || mode == "gray" {
        format::Pixel::GRAY8
    } else {
        // GIF 编码器支持 rgb8/bgr8，使用 rgb8 直接编码，透明度依赖调色板索引
        format::Pixel::RGB8
    }
}

fn compute_fps(frame_delay: Option<u32>, frame_rate: Option<f32>) -> (f32, Rational, i64) {
    if let Some(delay_ms) = frame_delay {
        let delay = delay_ms.max(1);
        let fps = 1000.0 / delay as f32;
        let g = media_common::gcd(1000, delay);
        let num = 1000 / g;
        let den = delay / g;
        (fps, Rational(den as i32, num as i32), delay as i64)
    } else {
        let fps = frame_rate.unwrap_or(10.0).max(1.0);
        (fps, Rational(1, fps.round() as i32), 1)
    }
}

fn dither_from_quality(quality: u32) -> (&'static str, &'static str) {
    if quality >= 80 {
        ("bayer", "3")
    } else if quality >= 50 {
        ("floyd_steinberg", "0")
    } else {
        ("none", "0")
    }
}

/// 使用 FFmpeg 将视频转换为 GIF 动图（带可选参数）
pub fn convert_video_to_gif<E: TaskEmitter>(
    emitter: E,
    params: GifConversionParams,
) -> Result<(), String> {
    media_common::init_ffmpeg()?;

    let mut ictx = media_common::open_input(&params.input_path)?;

    let mut octx = format::output(&params.output_path)
        .map_err(|e| format!("无法打开输出文件: {}", e))?;

    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    let video_stream = ictx
        .streams()
        .best(media::Type::Video)
        .ok_or("未找到视频流")?;
    let stream_index = video_stream.index();
    let source_fps = {
        let avg = video_stream.avg_frame_rate();
        if avg.numerator() > 0 && avg.denominator() > 0 {
            avg.numerator() as f64 / avg.denominator() as f64
        } else {
            0.0
        }
    };

    let decoder_ctx = codec::context::Context::from_parameters(video_stream.parameters())
        .map_err(|e| format!("无法创建解码器上下文: {}", e))?;
    let mut decoder = decoder_ctx
        .decoder()
        .video()
        .map_err(|e| format!("无法创建视频解码器: {}", e))?;

    let (target_width, target_height) = media_common::calculate_scaled_dimensions(
        decoder.width(),
        decoder.height(),
        params.width,
        params.height,
    );

    let pixel_format = pick_pixel_format(params.color_mode.as_deref());

    let mut scaler = software::scaling::context::Context::get(
        decoder.format(),
        decoder.width(),
        decoder.height(),
        pixel_format,
        target_width,
        target_height,
        if params.sharpen.unwrap_or(false) {
            software::scaling::flag::Flags::LANCZOS
        } else {
            software::scaling::flag::Flags::BILINEAR
        },
    )
    .map_err(|e| format!("无法创建缩放器: {}", e))?;

    let codec = encoder::find_by_name("gif").ok_or("未找到 GIF 编码器")?;
    let mut ost = octx
        .add_stream(codec)
        .map_err(|e| format!("无法添加输出流: {}", e))?;

    let (target_fps, time_base, pts_step) = compute_fps(params.frame_delay, params.frame_rate);

    let mut encoder = codec::context::Context::new_with_codec(codec)
        .encoder()
        .video()
        .map_err(|e| format!("无法创建 GIF 编码器: {}", e))?;

    encoder.set_width(target_width);
    encoder.set_height(target_height);
    encoder.set_format(pixel_format);
    encoder.set_frame_rate(Some((time_base.1, time_base.0))); // fps = denom / numer
    encoder.set_time_base(time_base);

    let quality = params.quality.unwrap_or(75).min(100);
    let (_dither, _bayer_scale) = dither_from_quality(quality);

    // 设置 loop
    let mut opts = ffmpeg::Dictionary::new();
    if let Some(loop_count) = params.loop_count {
        if loop_count >= 0 {
            opts.set("loop", loop_count.to_string().as_str());
        }
    } else {
        opts.set("loop", "0"); // 默认无限循环
    }

    // 打开编码器
    let mut encoder = encoder
        .open_with(opts)
        .map_err(|e| format!("无法打开 GIF 编码器: {}", e))?;

    ost.set_parameters(&encoder);
    let ost_time_base = ost.time_base();
    let ost_index = ost.index();

    // 记录 DPI 元数据（GIF 原生不支持，作为标签存储）
    if let Some(dpi_val) = params.dpi.or(Some(72.0)) {
        let mut meta = ffmpeg::Dictionary::new();
        meta.set("dpi", format!("{:.2}", dpi_val).as_str());
        octx.set_metadata(meta);
    }

    octx.write_header()
        .map_err(|e| format!("无法写入文件头: {}", e))?;

    let start_time = Instant::now();
    let mut frame_count = 0;
    let mut decoded_index: i64 = 0;
    let mut last_progress_emitted = 0.0;
    let mut next_pts: i64 = 0;
    let frame_step = if source_fps > 0.0 && target_fps > 0.0 {
        (source_fps / target_fps as f64).max(1.0)
    } else {
        1.0
    };
    let mut next_emit_index: f64 = 0.0;

    for (stream, packet) in ictx.packets() {
        if stream.index() == stream_index {
            decoder
                .send_packet(&packet)
                .map_err(|e| format!("发送数据包失败: {}", e))?;

            let mut decoded = frame::Video::empty();
            while decoder.receive_frame(&mut decoded).is_ok() {
                let current_index = decoded_index as f64;
                let should_emit = current_index + 1e-9 >= next_emit_index;
                if !should_emit {
                    decoded_index += 1;
                    continue; // 按源帧率降帧
                }
                next_emit_index += frame_step;

                let mut converted = frame::Video::empty();
                scaler
                    .run(&decoded, &mut converted)
                    .map_err(|e| format!("缩放失败: {}", e))?;

                // 简单降噪：再次平滑缩放一步（近似处理）
                if params.denoise.unwrap_or(false) {
                    let mut smooth = frame::Video::empty();
                    software::scaling::context::Context::get(
                        converted.format(),
                        converted.width(),
                        converted.height(),
                        converted.format(),
                        converted.width(),
                        converted.height(),
                        software::scaling::flag::Flags::BILINEAR,
                    )
                    .map_err(|e| format!("创建降噪缩放器失败: {}", e))?
                    .run(&converted, &mut smooth)
                    .map_err(|e| format!("降噪缩放失败: {}", e))?;
                    converted = smooth;
                }

                converted.set_pts(Some(next_pts));
                next_pts = next_pts.saturating_add(pts_step);

                encoder
                    .send_frame(&converted)
                    .map_err(|e| format!("发送帧到编码器失败: {}", e))?;

                let mut encoded = packet::Packet::empty();
                while encoder.receive_packet(&mut encoded).is_ok() {
                    encoded.set_stream(ost_index);
                    encoded.rescale_ts(encoder.time_base(), ost_time_base);
                    encoded
                        .write_interleaved(&mut octx)
                        .map_err(|e| format!("写入数据包失败: {}", e))?;
                }

                frame_count += 1;
                decoded_index += 1;

                if frame_count % 10 == 0 || start_time.elapsed().as_secs_f64() >= 1.0 {
                    let progress = if duration > 0.0 {
                        let current_time = if let Some(pts) = decoded.pts() {
                            pts as f64 * decoder.time_base().0 as f64
                                / decoder.time_base().1 as f64
                        } else if source_fps > 0.0 {
                            decoded_index as f64 / source_fps
                        } else {
                            0.0
                        };
                        ((current_time / duration) * 100.0).min(100.0)
                    } else {
                        0.0
                    };

                    if (progress - last_progress_emitted).abs() >= 1.0 {
                        emitter.emit("progress", Some(progress), None, None);
                        last_progress_emitted = progress;
                    }
                }
            }
        }
    }

    encoder
        .send_eof()
        .map_err(|e| format!("发送 EOF 失败: {}", e))?;

    let mut encoded = packet::Packet::empty();
    while encoder.receive_packet(&mut encoded).is_ok() {
        encoded.set_stream(ost_index);
        encoded.rescale_ts(encoder.time_base(), ost_time_base);
        encoded
            .write_interleaved(&mut octx)
            .map_err(|e| format!("写入尾部数据包失败: {}", e))?;
    }

    octx.write_trailer()
        .map_err(|e| format!("写入文件尾失败: {}", e))?;

    emitter.emit("complete", Some(100.0), Some(params.output_path), None);

    Ok(())
}
