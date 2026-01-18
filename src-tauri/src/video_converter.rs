use std::collections::HashMap;
use std::time::Instant;
use tauri::WebviewWindow;

use ffmpeg::{
    codec, decoder, encoder, format, frame, media, packet, picture, Dictionary, Rational,
};
use ffmpeg_next as ffmpeg;

/// 视频转换参数
#[derive(Debug, Clone)]
pub struct VideoConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub format: String,             // mp4, mov, mkv, etc.
    pub video_encoder: String,      // h264, hevc, etc.
    pub video_bitrate: Option<u32>, // kbps, auto if None
    pub resolution: Option<String>, // "1920x1080", "original", etc.
    pub frame_rate: Option<String>, // "30", "60", "original"
    pub audio_encoder: Option<String>,
    pub use_hardware_acceleration: bool,
    pub use_ultra_fast_speed: bool,
}

struct Transcoder {
    ost_index: usize,
    decoder: decoder::Video,
    input_time_base: Rational,
    encoder: encoder::Video,
    scaler: ffmpeg::software::scaling::Context,
    frame_count: usize,
    start_time: Instant,
    duration: f64,
    window: WebviewWindow,
    taskId: String,
}

impl Transcoder {
    fn new(
        ist: &format::stream::Stream,
        octx: &mut format::context::Output,
        ost_index: usize,
        params: &VideoConversionParams,
        duration: f64,
        window: WebviewWindow,
        taskId: String,
    ) -> Result<Self, String> {
        let global_header = octx.format().flags().contains(format::Flags::GLOBAL_HEADER);

        // 1. 设置解码器
        let decoder_ctx = ffmpeg::codec::context::Context::from_parameters(ist.parameters())
            .map_err(|e| format!("无法创建解码器上下文: {}", e))?;
        let decoder = decoder_ctx
            .decoder()
            .video()
            .map_err(|e| format!("无法创建视频解码器: {}", e))?;

        // 2. 选择编码器
        let codec_name = if params.use_hardware_acceleration {
            match params.video_encoder.as_str() {
                "h264" => {
                    if cfg!(target_os = "macos") {
                        "h264_videotoolbox"
                    } else {
                        "libx264"
                    }
                }
                "hevc" | "h265" => {
                    if cfg!(target_os = "macos") {
                        "hevc_videotoolbox"
                    } else {
                        "libx265"
                    }
                }
                _ => "libx264",
            }
        } else {
            match params.video_encoder.as_str() {
                "h264" => "libx264",
                "hevc" | "h265" => "libx265",
                "vp9" => "libvpx-vp9",
                _ => "libx264",
            }
        };

        let codec = ffmpeg::encoder::find_by_name(codec_name)
            .or_else(|| ffmpeg::encoder::find(codec::Id::H264))
            .ok_or("未找到合适的视频编码器")?;

        let mut ost = octx
            .add_stream(codec)
            .map_err(|e| format!("无法添加输出流: {}", e))?;

        let mut encoder = codec::context::Context::new_with_codec(codec)
            .encoder()
            .video()
            .map_err(|e| format!("无法创建视频编码器: {}", e))?;

        // 3. 配置编码器参数
        // 分辨率处理
        let (width, height) = if let Some(res) = &params.resolution {
            if res == "original" {
                (decoder.width(), decoder.height())
            } else {
                parse_resolution(res).unwrap_or((decoder.width(), decoder.height()))
            }
        } else {
            (decoder.width(), decoder.height())
        };

        encoder.set_width(width);
        encoder.set_height(height);
        encoder.set_format(if params.use_hardware_acceleration {
            // VideoToolbox 通常需要 nv12 或 yuv420p
            ffmpeg::format::Pixel::NV12
        } else {
            ffmpeg::format::Pixel::YUV420P
        });

        encoder.set_time_base(ist.time_base());

        // 帧率
        if let Some(fps_str) = &params.frame_rate {
            if fps_str != "original" {
                if let Ok(fps) = fps_str.parse::<i32>() {
                    encoder.set_frame_rate(Some((fps, 1)));
                }
            } else {
                encoder.set_frame_rate(decoder.frame_rate());
            }
        }

        // 码率
        if let Some(bitrate) = params.video_bitrate {
            encoder.set_bit_rate((bitrate * 1000) as usize);
        }

        if global_header {
            encoder.set_flags(codec::Flags::GLOBAL_HEADER);
        }

        // 极速模式设置
        let mut opts = Dictionary::new();
        if !params.use_hardware_acceleration {
            if params.use_ultra_fast_speed {
                opts.set("preset", "ultrafast");
            } else {
                opts.set("preset", "medium");
            }
        } else if cfg!(target_os = "macos") {
            // Videotoolbox specific options if needed
            if params.use_ultra_fast_speed {
                opts.set("realtime", "true");
            }
        }

        let encoder = encoder
            .open_with(opts)
            .map_err(|e| format!("无法打开编码器: {}", e))?;

        ost.set_parameters(&encoder);

        // 4. 设置 Scaler (用于分辨率转换和像素格式转换)
        let scaler = ffmpeg::software::scaling::context::Context::get(
            decoder.format(),
            decoder.width(),
            decoder.height(),
            encoder.format(),
            width,
            height,
            ffmpeg::software::scaling::flag::Flags::BILINEAR,
        )
        .map_err(|e| format!("无法创建Scaler: {}", e))?;

        Ok(Self {
            ost_index,
            decoder,
            input_time_base: ist.time_base(),
            encoder,
            scaler,
            frame_count: 0,
            start_time: Instant::now(),
            duration,
            window,
            taskId,
        })
    }

    fn send_packet_to_decoder(&mut self, packet: &packet::Packet) -> Result<(), String> {
        self.decoder.send_packet(packet).map_err(|e| e.to_string())
    }

    fn send_eof_to_decoder(&mut self) -> Result<(), String> {
        self.decoder.send_eof().map_err(|e| e.to_string())
    }

    fn receive_and_process_decoded_frames(
        &mut self,
        octx: &mut format::context::Output,
        ost_time_base: Rational,
    ) -> Result<(), String> {
        let mut decoded = frame::Video::empty();
        while self.decoder.receive_frame(&mut decoded).is_ok() {
            let timestamp = decoded.timestamp();

            // 进度报告
            if let Some(pts) = timestamp {
                let current_time = pts as f64 * f64::from(self.input_time_base);
                if self.duration > 0.0 {
                    let progress = (current_time / self.duration * 100.0).min(100.0);
                    // 简单去抖动，每秒或每1%发送一次即可，这里由于是一帧帧处理，可以稍作限制
                    // 为简化，直接发送，前端可能有去抖或频繁更新
                    crate::events::emit_media_task_event(
                        &self.window,
                        &self.taskId,
                        "convert",
                        "video",
                        "progress",
                        Some(progress),
                        None,
                        None,
                    );
                }
            }

            // Scale frame
            let mut scaled_frame = frame::Video::empty();
            self.scaler
                .run(&decoded, &mut scaled_frame)
                .map_err(|e| format!("Scaling failed: {}", e))?;

            scaled_frame.set_pts(timestamp);
            scaled_frame.set_kind(picture::Type::None);

            self.send_frame_to_encoder(&scaled_frame)?;
            self.receive_and_process_encoded_packets(octx, ost_time_base)?;
            self.frame_count += 1;
        }
        Ok(())
    }

    fn send_frame_to_encoder(&mut self, frame: &frame::Video) -> Result<(), String> {
        self.encoder.send_frame(frame).map_err(|e| e.to_string())
    }

    fn send_eof_to_encoder(&mut self) -> Result<(), String> {
        self.encoder.send_eof().map_err(|e| e.to_string())
    }

    fn receive_and_process_encoded_packets(
        &mut self,
        octx: &mut format::context::Output,
        ost_time_base: Rational,
    ) -> Result<(), String> {
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.input_time_base, ost_time_base);
            encoded.write_interleaved(octx).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

pub fn convert_video(
    window: &WebviewWindow,
    params: VideoConversionParams,
    task_id: String,
) -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init failed: {}", e))?;

    let mut ictx =
        format::input(&params.input_path).map_err(|e| format!("无法打开输入文件: {}", e))?;
    let mut octx =
        format::output(&params.output_path).map_err(|e| format!("无法打开输出文件: {}", e))?;

    // 获取时长
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    // 检测是否有视频流
    let has_video = ictx.streams().best(media::Type::Video).is_some();
    let best_video_stream = if has_video {
        Some(ictx.streams().best(media::Type::Video).unwrap().index())
    } else {
        None
    };

    let mut stream_mapping: Vec<isize> = vec![0; ictx.nb_streams() as usize];
    let mut ist_time_bases = vec![Rational(0, 1); ictx.nb_streams() as usize];
    let mut ost_time_bases = vec![Rational(0, 1); ictx.nb_streams() as usize];
    let mut transcoders = HashMap::new();
    let mut ost_index = 0;

    // 如果没有视频流，需要创建黑屏视频流
    let mut black_video_encoder: Option<(encoder::Video, usize, Rational, u32, u32, Rational)> =
        None;
    let mut black_video_ost_index = 0;

    for (ist_index, ist) in ictx.streams().enumerate() {
        let ist_medium = ist.parameters().medium();
        ist_time_bases[ist_index] = ist.time_base();

        if ist_medium == media::Type::Video {
            // 仅转码主视频流，其他视频流忽略或复制？
            // 这里假设只转码最佳视频流，其他忽略
            if let Some(video_idx) = best_video_stream {
                if ist_index == video_idx {
                    stream_mapping[ist_index] = ost_index as isize;
                    let transcoder = Transcoder::new(
                        &ist,
                        &mut octx,
                        ost_index,
                        &params,
                        duration,
                        window.clone(),
                        task_id.clone(),
                    )?;
                    transcoders.insert(ist_index, transcoder);
                    ost_index += 1;
                } else {
                    stream_mapping[ist_index] = -1; // Ignore
                }
            }
        } else if ist_medium == media::Type::Audio {
            // 复制音频流
            stream_mapping[ist_index] = ost_index as isize;
            let mut ost = octx
                .add_stream(ffmpeg::encoder::find(codec::Id::None))
                .map_err(|e| format!("Audio add_stream failed: {}", e))?;
            ost.set_parameters(ist.parameters());
            // Fix codec tag
            unsafe {
                (*ost.parameters().as_mut_ptr()).codec_tag = 0;
            }
            ost_index += 1;
        } else {
            // 忽略其他流（字幕等，稍后可以支持复制）
            stream_mapping[ist_index] = -1;
        }
    }

    // 如果没有视频流，创建黑屏视频编码器（在循环之后，避免借用冲突）
    // 先完成所有流的处理

    // 如果没有视频流，创建黑屏视频编码器
    if !has_video {
        black_video_ost_index = ost_index;
        let (encoder, ost_idx, time_base, width, height, frame_rate) =
            create_black_video_encoder(&mut octx, &params, duration)?;
        black_video_encoder = Some((encoder, ost_idx, time_base, width, height, frame_rate));
        ost_index += 1;
    }

    octx.set_metadata(ictx.metadata().to_owned());
    octx.write_header()
        .map_err(|e| format!("Write header failed: {}", e))?;

    for (i, _) in octx.streams().enumerate() {
        ost_time_bases[i] = octx.stream(i).unwrap().time_base();
    }

    // Process packets
    for (stream, mut packet) in ictx.packets() {
        let ist_index = stream.index();
        if ist_index >= stream_mapping.len() {
            continue;
        }
        let ost_idx = stream_mapping[ist_index] as isize;
        if ost_idx < 0 {
            continue;
        }

        let ost_idx = ost_idx as usize;
        let ost_time_base = ost_time_bases[ost_idx];

        if let Some(transcoder) = transcoders.get_mut(&ist_index) {
            transcoder.send_packet_to_decoder(&packet)?;
            transcoder.receive_and_process_decoded_frames(&mut octx, ost_time_base)?;
        } else {
            // Stream copy
            packet.rescale_ts(ist_time_bases[ist_index], ost_time_base);
            packet.set_position(-1);
            packet.set_stream(ost_idx);
            packet
                .write_interleaved(&mut octx)
                .map_err(|e| format!("Write packet failed: {}", e))?;
        }
    }

    // Flush transcoders
    for (ist_index, transcoder) in transcoders.iter_mut() {
        let ost_idx = stream_mapping[*ist_index] as usize;
        let ost_time_base = ost_time_bases[ost_idx];

        transcoder.send_eof_to_decoder()?;
        transcoder.receive_and_process_decoded_frames(&mut octx, ost_time_base)?;
        transcoder.send_eof_to_encoder()?;
        transcoder.receive_and_process_encoded_packets(&mut octx, ost_time_base)?;
    }

    // 如果没有视频流，生成黑屏视频帧
    if let Some((mut encoder, ost_idx, encoder_time_base, width, height, frame_rate)) =
        black_video_encoder
    {
        let ost_time_base = ost_time_bases[ost_idx];
        generate_black_video_frames(
            &mut encoder,
            &mut octx,
            ost_idx,
            encoder_time_base,
            ost_time_base,
            width,
            height,
            frame_rate,
            duration,
            window,
            &task_id,
        )?;
    }

    octx.write_trailer()
        .map_err(|e| format!("Write trailer failed: {}", e))?;

    Ok(())
}

fn parse_resolution(res: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = res.split('x').collect();
    if parts.len() == 2 {
        if let (Ok(w), Ok(h)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
            return Some((w, h));
        }
    }
    None
}

/// 创建黑屏视频编码器（用于音频转视频）
fn create_black_video_encoder(
    octx: &mut format::context::Output,
    params: &VideoConversionParams,
    _duration: f64,
) -> Result<(encoder::Video, usize, Rational, u32, u32, Rational), String> {
    // 先检查 global_header（在创建 stream 之前）
    let global_header = octx.format().flags().contains(format::Flags::GLOBAL_HEADER);

    // 选择编码器
    let codec_name = if params.use_hardware_acceleration {
        match params.video_encoder.as_str() {
            "h264" => {
                if cfg!(target_os = "macos") {
                    "h264_videotoolbox"
                } else {
                    "libx264"
                }
            }
            "hevc" | "h265" => {
                if cfg!(target_os = "macos") {
                    "hevc_videotoolbox"
                } else {
                    "libx265"
                }
            }
            _ => "libx264",
        }
    } else {
        match params.video_encoder.as_str() {
            "h264" => "libx264",
            "hevc" | "h265" => "libx265",
            "vp9" => "libvpx-vp9",
            _ => "libx264",
        }
    };

    let codec = ffmpeg::encoder::find_by_name(codec_name)
        .or_else(|| ffmpeg::encoder::find(codec::Id::H264))
        .ok_or("未找到合适的视频编码器")?;

    let mut ost = octx
        .add_stream(codec)
        .map_err(|e| format!("无法添加输出流: {}", e))?;

    let mut encoder = codec::context::Context::new_with_codec(codec)
        .encoder()
        .video()
        .map_err(|e| format!("无法创建视频编码器: {}", e))?;

    // 分辨率处理（默认 1920x1080）
    let (width, height) = if let Some(res) = &params.resolution {
        if res == "original" {
            (1920, 1080) // 默认分辨率
        } else {
            parse_resolution(res).unwrap_or((1920, 1080))
        }
    } else {
        (1920, 1080)
    };

    encoder.set_width(width);
    encoder.set_height(height);
    encoder.set_format(if params.use_hardware_acceleration {
        ffmpeg::format::Pixel::NV12
    } else {
        ffmpeg::format::Pixel::YUV420P
    });

    // 帧率（默认 30fps）
    let fps = if let Some(fps_str) = &params.frame_rate {
        if fps_str != "original" {
            fps_str.parse::<i32>().unwrap_or(30)
        } else {
            30
        }
    } else {
        30
    };
    encoder.set_frame_rate(Some((fps, 1)));

    // Time base based on frame rate
    let encoder_time_base = Rational(1, fps);
    encoder.set_time_base(encoder_time_base);

    // 码率
    if let Some(bitrate) = params.video_bitrate {
        encoder.set_bit_rate((bitrate * 1000) as usize);
    } else {
        // 默认低码率（黑屏不需要高码率）
        encoder.set_bit_rate(500 * 1000); // 500 kbps
    }

    if global_header {
        encoder.set_flags(codec::Flags::GLOBAL_HEADER);
    }

    // 编码器选项
    let mut opts = Dictionary::new();
    if !params.use_hardware_acceleration {
        if params.use_ultra_fast_speed {
            opts.set("preset", "ultrafast");
        } else {
            opts.set("preset", "medium");
        }
    } else if cfg!(target_os = "macos") {
        if params.use_ultra_fast_speed {
            opts.set("realtime", "true");
        }
    }

    let encoder = encoder
        .open_with(opts)
        .map_err(|e| format!("无法打开编码器: {}", e))?;

    ost.set_parameters(&encoder);
    let ost_index = ost.index();
    let ost_time_base = ost.time_base();

    Ok((
        encoder,
        ost_index,
        encoder_time_base,
        width,
        height,
        Rational(fps, 1),
    ))
}

/// 生成黑屏视频帧
fn generate_black_video_frames(
    encoder: &mut encoder::Video,
    octx: &mut format::context::Output,
    ost_index: usize,
    encoder_time_base: Rational,
    ost_time_base: Rational,
    width: u32,
    height: u32,
    frame_rate: Rational,
    duration: f64,
    window: &WebviewWindow,
    task_id: &str,
) -> Result<(), String> {
    let fps = frame_rate.numerator() as f64 / frame_rate.denominator() as f64;
    let total_frames = (duration * fps).ceil() as i64;

    // 创建黑屏帧
    let mut black_frame = frame::Video::empty();
    black_frame.set_format(encoder.format());
    black_frame.set_width(width);
    black_frame.set_height(height);

    // 分配帧数据
    unsafe {
        let frame_ptr = black_frame.as_mut_ptr();
        let result = ffmpeg::ffi::av_frame_get_buffer(frame_ptr, 32); // 32 byte alignment
        if result < 0 {
            return Err(format!("无法分配黑屏帧缓冲区: {}", result));
        }
    }

    // 填充黑色像素
    // YUV420P: Y=0, U=128, V=128 (planar)
    // NV12: Y=0, UV交错 (interleaved)
    unsafe {
        let frame_ptr = black_frame.as_mut_ptr();
        let pixel_format = black_frame.format();

        if pixel_format == ffmpeg::format::Pixel::NV12 {
            // NV12: Y plane + interleaved UV plane
            let y_plane = (*frame_ptr).data[0] as *mut u8;
            let uv_plane = (*frame_ptr).data[1] as *mut u8;
            let y_stride = (*frame_ptr).linesize[0] as usize;
            let uv_stride = (*frame_ptr).linesize[1] as usize;

            // Y plane - 全部设为 0 (黑色)
            for y in 0..height {
                let offset = (y as usize) * y_stride;
                let slice = std::slice::from_raw_parts_mut(y_plane.add(offset), width as usize);
                slice.fill(0);
            }

            // UV plane (interleaved) - U=128, V=128
            let uv_width = (width / 2) as usize;
            let uv_height = (height / 2) as usize;
            for y in 0..uv_height {
                let offset = (y as usize) * uv_stride;
                let slice = std::slice::from_raw_parts_mut(uv_plane.add(offset), uv_width * 2);
                // 交错填充: U, V, U, V, ...
                for i in 0..uv_width {
                    slice[i * 2] = 128; // U
                    slice[i * 2 + 1] = 128; // V
                }
            }
        } else {
            // YUV420P (planar)
            let y_plane = (*frame_ptr).data[0] as *mut u8;
            let u_plane = (*frame_ptr).data[1] as *mut u8;
            let v_plane = (*frame_ptr).data[2] as *mut u8;
            let y_stride = (*frame_ptr).linesize[0] as usize;
            let u_stride = (*frame_ptr).linesize[1] as usize;
            let v_stride = (*frame_ptr).linesize[2] as usize;

            // Y plane (luminance) - 全部设为 0 (黑色)
            for y in 0..height {
                let offset = (y as usize) * y_stride;
                let slice = std::slice::from_raw_parts_mut(y_plane.add(offset), width as usize);
                slice.fill(0);
            }

            // U and V planes (chrominance) - 全部设为 128 (中性)
            let uv_width = (width / 2) as usize;
            let uv_height = (height / 2) as usize;
            for y in 0..uv_height {
                let u_offset = (y as usize) * u_stride;
                let v_offset = (y as usize) * v_stride;
                let u_slice = std::slice::from_raw_parts_mut(u_plane.add(u_offset), uv_width);
                let v_slice = std::slice::from_raw_parts_mut(v_plane.add(v_offset), uv_width);
                u_slice.fill(128);
                v_slice.fill(128);
            }
        }
    }

    let mut frame_count = 0i64;
    let mut last_progress_emitted = 0.0;

    // 生成并编码帧
    for frame_num in 0..total_frames {
        let pts = Some(frame_num);
        black_frame.set_pts(pts);
        black_frame.set_kind(picture::Type::None);

        encoder
            .send_frame(&black_frame)
            .map_err(|e| format!("发送黑屏帧失败: {}", e))?;

        // 接收编码后的数据包
        let mut encoded = packet::Packet::empty();
        while encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(ost_index);
            encoded.rescale_ts(encoder_time_base, ost_time_base);
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("写入黑屏数据包失败: {}", e))?;
        }

        frame_count += 1;

        // 进度报告（每30帧或每秒更新一次）
        if frame_count % 30 == 0 || frame_num % (fps as i64) == 0 {
            let progress = if duration > 0.0 {
                let current_time = frame_num as f64 / fps;
                ((current_time / duration) * 100.0).min(100.0)
            } else {
                0.0
            };

            if (progress - last_progress_emitted).abs() >= 1.0 {
                crate::events::emit_media_task_event(
                    window,
                    task_id,
                    "convert",
                    "video",
                    "progress",
                    Some(progress),
                    None,
                    None,
                );
                last_progress_emitted = progress;
            }
        }
    }

    // Flush encoder
    encoder
        .send_eof()
        .map_err(|e| format!("发送 EOF 到黑屏编码器失败: {}", e))?;

    let mut encoded = packet::Packet::empty();
    while encoder.receive_packet(&mut encoded).is_ok() {
        encoded.set_stream(ost_index);
        encoded.rescale_ts(encoder_time_base, ost_time_base);
        encoded
            .write_interleaved(octx)
            .map_err(|e| format!("写入最终黑屏数据包失败: {}", e))?;
    }

    Ok(())
}
