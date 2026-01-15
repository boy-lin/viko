use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{Emitter, WebviewWindow};

use ffmpeg::{
    codec, decoder, encoder, format, frame, media, picture, packet, Dictionary, Rational,
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
        let decoder = decoder_ctx.decoder().video()
            .map_err(|e| format!("无法创建视频解码器: {}", e))?;
            
        // 2. 选择编码器
        let codec_name = if params.use_hardware_acceleration {
            match params.video_encoder.as_str() {
                "h264" => {
                    if cfg!(target_os = "macos") { "h264_videotoolbox" } else { "libx264" }
                },
                "hevc" | "h265" => {
                    if cfg!(target_os = "macos") { "hevc_videotoolbox" } else { "libx265" }
                },
                _ => "libx264"
            }
        } else {
            match params.video_encoder.as_str() {
                "h264" => "libx264",
                "hevc" | "h265" => "libx265",
                "vp9" => "libvpx-vp9",
                _ => "libx264"
            }
        };

        let codec = ffmpeg::encoder::find_by_name(codec_name)
            .or_else(|| ffmpeg::encoder::find(codec::Id::H264))
            .ok_or("未找到合适的视频编码器")?;

        let mut ost = octx.add_stream(codec)
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

        let encoder = encoder.open_with(opts)
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
        ).map_err(|e| format!("无法创建Scaler: {}", e))?;

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
                     let _ = self.window.emit("video-conversion-progress", progress);
                 }
            }

            // Scale frame
            let mut scaled_frame = frame::Video::empty();
            self.scaler.run(&decoded, &mut scaled_frame).map_err(|e| format!("Scaling failed: {}", e))?;
            
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
    task_id: String
) -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init failed: {}", e))?;
    
    let mut ictx = format::input(&params.input_path).map_err(|e| format!("无法打开输入文件: {}", e))?;
    let mut octx = format::output(&params.output_path).map_err(|e| format!("无法打开输出文件: {}", e))?;
    
    // 获取视频时长
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    let best_video_stream = ictx.streams().best(media::Type::Video).ok_or("No video stream")?.index();
    
    let mut stream_mapping: Vec<isize> = vec![0; ictx.nb_streams() as usize];
    let mut ist_time_bases = vec![Rational(0, 1); ictx.nb_streams() as usize];
    let mut ost_time_bases = vec![Rational(0, 1); ictx.nb_streams() as usize];
    let mut transcoders = HashMap::new();
    let mut ost_index = 0;

    for (ist_index, ist) in ictx.streams().enumerate() {
        let ist_medium = ist.parameters().medium();
        ist_time_bases[ist_index] = ist.time_base();
        
        if ist_medium == media::Type::Video {
             // 仅转码主视频流，其他视频流忽略或复制？
             // 这里假设只转码最佳视频流，其他忽略
             if ist_index == best_video_stream {
                 stream_mapping[ist_index] = ost_index as isize;
                 let transcoder = Transcoder::new(
                     &ist, 
                     &mut octx, 
                     ost_index, 
                     &params, 
                     duration,
                     window.clone(),
                     task_id.clone()
                 )?;
                 transcoders.insert(ist_index, transcoder);
                 ost_index += 1;
             } else {
                 stream_mapping[ist_index] = -1; // Ignore
             }
        } else if ist_medium == media::Type::Audio {
             // 复制音频流
             stream_mapping[ist_index] = ost_index as isize;
             let mut ost = octx.add_stream(ffmpeg::encoder::find(codec::Id::None))
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
    
    octx.set_metadata(ictx.metadata().to_owned());
    octx.write_header().map_err(|e| format!("Write header failed: {}", e))?;
    
    for (i, _) in octx.streams().enumerate() {
        ost_time_bases[i] = octx.stream(i).unwrap().time_base();
    }
    
    // Process packets
    for (stream, mut packet) in ictx.packets() {
        let ist_index = stream.index();
        if ist_index >= stream_mapping.len() { continue; }
        let ost_idx = stream_mapping[ist_index] as isize;
        if ost_idx < 0 { continue; }
        
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
             packet.write_interleaved(&mut octx).map_err(|e| format!("Write packet failed: {}", e))?;
        }
    }
    
    // Flush
    for (ist_index, transcoder) in transcoders.iter_mut() {
        let ost_idx = stream_mapping[*ist_index] as usize;
        let ost_time_base = ost_time_bases[ost_idx];
        
        transcoder.send_eof_to_decoder()?;
        transcoder.receive_and_process_decoded_frames(&mut octx, ost_time_base)?;
        transcoder.send_eof_to_encoder()?;
        transcoder.receive_and_process_encoded_packets(&mut octx, ost_time_base)?;
    }
    
    octx.write_trailer().map_err(|e| format!("Write trailer failed: {}", e))?;
    
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
