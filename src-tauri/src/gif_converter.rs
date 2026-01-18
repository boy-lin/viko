use ffmpeg::{codec, encoder, format, frame, media, packet, Rational};
use ffmpeg_next as ffmpeg;
use serde::Deserialize;
use std::time::Instant;
use tauri::WebviewWindow;

/// GIF 转换参数
#[derive(Deserialize)]
pub struct GifConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f32>, // FPS for GIF, e.g., 10.0, 15.0, 30.0
}

/// 使用 FFmpeg 将视频转换为 GIF 动图
pub fn convert_video_to_gif(
    window: &WebviewWindow,
    params: GifConversionParams,
    task_id: String,
) -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init failed: {}", e))?;

    let mut ictx =
        format::input(&params.input_path).map_err(|e| format!("无法打开输入文件: {}", e))?;

    let mut octx =
        format::output(&params.output_path).map_err(|e| format!("无法打开输出文件: {}", e))?;

    // 获取视频时长
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    // 找到最佳视频流
    let video_stream = ictx
        .streams()
        .best(media::Type::Video)
        .ok_or("未找到视频流")?;
    let stream_index = video_stream.index();

    // 设置解码器
    let decoder_ctx = codec::context::Context::from_parameters(video_stream.parameters())
        .map_err(|e| format!("无法创建解码器上下文: {}", e))?;
    let mut decoder = decoder_ctx
        .decoder()
        .video()
        .map_err(|e| format!("无法创建视频解码器: {}", e))?;

    // 确定目标分辨率
    let (target_width, target_height) = match (params.width, params.height) {
        (Some(w), Some(h)) => (w, h),
        (Some(w), None) => {
            let aspect = decoder.height() as f64 / decoder.width() as f64;
            (w, (w as f64 * aspect) as u32)
        }
        (None, Some(h)) => {
            let aspect = decoder.width() as f64 / decoder.height() as f64;
            ((h as f64 * aspect) as u32, h)
        }
        (None, None) => {
            // 限制最大尺寸，GIF 文件通常较小
            let max_dimension = 800;
            if decoder.width() > decoder.height() {
                if decoder.width() > max_dimension {
                    let scale = max_dimension as f64 / decoder.width() as f64;
                    (max_dimension, (decoder.height() as f64 * scale) as u32)
                } else {
                    (decoder.width(), decoder.height())
                }
            } else {
                if decoder.height() > max_dimension {
                    let scale = max_dimension as f64 / decoder.height() as f64;
                    ((decoder.width() as f64 * scale) as u32, max_dimension)
                } else {
                    (decoder.width(), decoder.height())
                }
            }
        }
    };

    // 设置缩放器：将输入格式直接转换为 RGB8（GIF 编码器支持的格式）
    let mut scaler = ffmpeg::software::scaling::context::Context::get(
        decoder.format(),
        decoder.width(),
        decoder.height(),
        ffmpeg::format::Pixel::RGB8,
        target_width,
        target_height,
        ffmpeg::software::scaling::flag::Flags::BILINEAR,
    )
    .map_err(|e| format!("无法创建 RGB8 缩放器: {}", e))?;

    // 设置 GIF 编码器
    // FFmpeg 使用 gif muxer，编码器使用 gif
    let codec = encoder::find_by_name("gif").ok_or("未找到 GIF 编码器")?;

    let mut ost = octx
        .add_stream(codec)
        .map_err(|e| format!("无法添加输出流: {}", e))?;

    let mut encoder = codec::context::Context::new_with_codec(codec)
        .encoder()
        .video()
        .map_err(|e| format!("无法创建 GIF 编码器: {}", e))?;

    encoder.set_width(target_width);
    encoder.set_height(target_height);
    // GIF 编码器支持 RGB8 格式
    encoder.set_format(ffmpeg::format::Pixel::RGB8);

    // 设置帧率（GIF 帧率通常较低，默认 10fps）
    let fps = params.frame_rate.unwrap_or(10.0);
    encoder.set_frame_rate(Some((fps as i32, 1)));
    encoder.set_time_base(Rational(1, fps as i32));

    // 设置编码器选项
    let mut opts = ffmpeg::Dictionary::new();
    // GIF 编码器选项
    opts.set("loop", "0"); // 0 = 无限循环，1 = 不循环，其他值 = 循环次数

    let mut encoder = encoder
        .open_with(opts)
        .map_err(|e| format!("无法打开 GIF 编码器: {}", e))?;

    ost.set_parameters(&encoder);
    let ost_time_base = ost.time_base();
    let ost_index = ost.index();

    // 写入文件头
    octx.write_header()
        .map_err(|e| format!("无法写入文件头: {}", e))?;

    let start_time = Instant::now();
    let mut frame_count = 0;
    let mut last_progress_emitted = 0.0;

    // 处理所有视频帧
    for (stream, packet) in ictx.packets() {
        if stream.index() == stream_index {
            decoder
                .send_packet(&packet)
                .map_err(|e| format!("发送数据包失败: {}", e))?;

            let mut decoded = frame::Video::empty();
            while decoder.receive_frame(&mut decoded).is_ok() {
                // 缩放帧到目标尺寸并转换为 RGB8 格式（GIF 编码器支持）
                let mut rgb8_frame = frame::Video::empty();
                scaler
                    .run(&decoded, &mut rgb8_frame)
                    .map_err(|e| format!("缩放失败: {}", e))?;

                // 编码帧（RGB8 格式）
                encoder
                    .send_frame(&rgb8_frame)
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

                // 发送进度更新（每 10 帧或每秒更新一次）
                if frame_count % 10 == 0 || start_time.elapsed().as_secs_f64() >= 1.0 {
                    let progress = if duration > 0.0 {
                        let current_time = decoded.pts().unwrap_or(0) as f64
                            * decoder.time_base().0 as f64
                            / decoder.time_base().1 as f64;
                        ((current_time / duration) * 100.0).min(100.0)
                    } else {
                        0.0
                    };

                    if (progress - last_progress_emitted).abs() >= 1.0 {
                        crate::events::emit_media_task_event(
                            window,
                            &task_id,
                            "convert",
                            "image",
                            "progress",
                            Some(progress),
                            None,
                            None,
                        );
                        last_progress_emitted = progress;
                    }
                }
            }
        }
    }

    // 发送 EOF 到编码器
    encoder
        .send_eof()
        .map_err(|e| format!("发送 EOF 失败: {}", e))?;

    // 接收剩余的编码数据包
    let mut encoded = packet::Packet::empty();
    while encoder.receive_packet(&mut encoded).is_ok() {
        encoded.set_stream(ost_index);
        encoded.rescale_ts(encoder.time_base(), ost_time_base);
        encoded
            .write_interleaved(&mut octx)
            .map_err(|e| format!("写入最终数据包失败: {}", e))?;
    }

    // 写入文件尾
    octx.write_trailer()
        .map_err(|e| format!("写入文件尾失败: {}", e))?;

    crate::events::emit_media_task_event(
        window,
        &task_id,
        "convert",
        "image",
        "complete",
        Some(100.0),
        Some(params.output_path),
        None,
    );

    Ok(())
}
