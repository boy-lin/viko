use std::collections::HashMap;
use std::time::Instant;

use ffmpeg::{
    codec, decoder, encoder, format, frame, media, packet, picture, Dictionary, Rational,
};
use ffmpeg_next as ffmpeg;
use serde::Deserialize;

use crate::media_common;
use crate::audio_converter::AudioEncodingParams;
use crate::video_converter_audio::AudioTrackProcessor;
use crate::events::TaskEmitter;

/// 视频转换参数（全部可选，使用默认值兜底）
#[derive(Debug, Clone)]
pub struct VideoConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub format: Option<String>,             // mp4, mov, mkv, etc.
    pub video_encoder: Option<String>,      // h264, hevc, etc.
    pub video_bitrate: Option<u32>,         // kbps, auto if None
    pub min_bitrate: Option<u32>,
    pub max_bitrate: Option<u32>,
    pub rc_mode: Option<String>,            // cbr/vbr/crf
    pub resolution: Option<String>,         // "1920x1080", "original", etc.
    pub frame_rate: Option<String>,         // "30", "60", "original"
    pub aspect_ratio: Option<String>,
    pub scaling_mode: Option<String>,
    pub gop_size: Option<u32>,
    pub preset: Option<String>,
    pub profile: Option<String>,
    pub tune: Option<String>,
    pub color_space: Option<String>,
    pub bit_depth: Option<u32>,
    pub crop: Option<String>,
    // 多轨音频
    pub audio_tracks: Option<Vec<AudioTrackConfig>>,
    pub default_audio_params: Option<AudioEncodingParams>,
    // 兼容旧字段
    pub audio_encoder: Option<String>,
    pub use_hardware_acceleration: bool,
    pub use_ultra_fast_speed: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AudioTrackConfig {
    pub source_stream_index: Option<usize>,
    #[serde(flatten)]
    pub encoding: AudioEncodingParams,
}

#[derive(Debug, Clone)]
struct ResolvedAudioTrack {
    pub source_stream_index: usize,
    pub encoding: AudioEncodingParams,
}

#[derive(Debug, Clone)]
struct ResolvedVideoParams {
    pub input_path: String,
    pub output_path: String,
    pub format: String,
    pub video_encoder: String,
    pub video_bitrate: Option<u32>,
    pub min_bitrate: Option<u32>,
    pub max_bitrate: Option<u32>,
    pub rc_mode: Option<String>,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<String>,
    pub scaling_mode: Option<String>,
    pub frame_rate: Option<String>,
    pub gop_size: Option<u32>,
    pub preset: Option<String>,
    pub profile: Option<String>,
    pub tune: Option<String>,
    pub color_space: Option<String>,
    pub bit_depth: Option<u32>,
    pub crop: Option<String>,
    pub audio_tracks: Vec<ResolvedAudioTrack>,
    pub use_hardware_acceleration: bool,
    pub use_ultra_fast_speed: bool,
}

fn resolve_audio_tracks(
    params: &VideoConversionParams,
    input_audio_indices: &[usize],
    output_format: &str,
) -> Vec<ResolvedAudioTrack> {
    let mut default_encoding = params
        .default_audio_params
        .clone()
        .unwrap_or(AudioEncodingParams {
            codec: None,
            bitrate: None,
            sample_rate: None,
            channels: None,
            bit_depth: None,
            quality: None,
        });

    // 兼容旧字段 audio_encoder 优先级最高
    if let Some(enc) = &params.audio_encoder {
        default_encoding.codec = Some(enc.clone());
    }

    // 如果未指定音频编码器，针对容器给出默认值（mp4/mov 默认 aac，webm 默认 libopus）
    if default_encoding.codec.is_none() {
        match output_format {
            "mp4" | "m4v" | "m4a" | "mov" | "3gp" | "3g2" => {
                default_encoding.codec = Some("aac".to_string())
            }
            "webm" => default_encoding.codec = Some("libopus".to_string()),
            _ => {}
        }
    }

    if let Some(configs) = &params.audio_tracks {
        let mut resolved = Vec::new();
        for (i, cfg) in configs.iter().enumerate() {
            let src_idx = cfg
                .source_stream_index
                .or_else(|| input_audio_indices.get(i).copied())
                .unwrap_or(0);
            resolved.push(ResolvedAudioTrack {
                source_stream_index: src_idx,
                encoding: cfg.encoding.clone(),
            });
        }
        resolved
    } else {
        input_audio_indices
            .iter()
            .map(|&idx| ResolvedAudioTrack {
                source_stream_index: idx,
                encoding: default_encoding.clone(),
            })
            .collect()
    }
}

fn resolve_video_params(params: VideoConversionParams, input_audio_indices: &[usize]) -> ResolvedVideoParams {
    let fmt = params
        .format
        .clone()
        .or_else(|| {
            std::path::Path::new(&params.output_path)
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
        })
        .unwrap_or_else(|| "mp4".to_string());

    let video_encoder = params
        .video_encoder
        .clone()
        .unwrap_or_else(|| "h264".to_string());

    let audio_tracks = resolve_audio_tracks(&params, input_audio_indices, fmt.as_str());

    ResolvedVideoParams {
        input_path: params.input_path,
        output_path: params.output_path,
        format: fmt,
        video_encoder,
        video_bitrate: params.video_bitrate,
        min_bitrate: params.min_bitrate,
        max_bitrate: params.max_bitrate,
        rc_mode: params.rc_mode,
        resolution: params.resolution,
        aspect_ratio: params.aspect_ratio,
        scaling_mode: params.scaling_mode,
        frame_rate: params.frame_rate,
        gop_size: params.gop_size,
        preset: params.preset,
        profile: params.profile,
        tune: params.tune,
        color_space: params.color_space,
        bit_depth: params.bit_depth,
        crop: params.crop,
        audio_tracks,
        use_hardware_acceleration: params.use_hardware_acceleration,
        use_ultra_fast_speed: params.use_ultra_fast_speed,
    }
}

struct Transcoder<E: TaskEmitter> {
    ost_index: usize,
    decoder: decoder::Video,
    input_time_base: Rational,
    encoder: encoder::Video,
    scaler: ffmpeg::software::scaling::Context,
    frame_count: usize,
    start_time: Instant,
    duration: f64,
    emitter: E,
}

impl<E: TaskEmitter> Transcoder<E> {
    fn new(
        ist: &format::stream::Stream,
        octx: &mut format::context::Output,
        ost_index: usize,
        params: &ResolvedVideoParams,
        duration: f64,
        emitter: E,
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
        let codec = media_common::select_video_encoder(
            Some(params.video_encoder.as_str()),
            params.use_hardware_acceleration,
        )
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
        let (width, height) =
            media_common::resolve_resolution(decoder.width(), decoder.height(), params.resolution.as_deref());

        encoder.set_width(width);
        encoder.set_height(height);
        encoder.set_format(media_common::pick_pixel_format(
            params.bit_depth,
            params.use_hardware_acceleration,
        ));

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
            emitter,
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
                    self.emitter.emit("progress", Some(progress), None, None);
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

pub fn convert_video<E: TaskEmitter + Clone>(
    emitter: E,
    params: VideoConversionParams,
) -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init failed: {}", e))?;

    let mut ictx =
        format::input(&params.input_path).map_err(|e| format!("无法打开输入文件: {}", e))?;

    // 收集输入音频流索引供解析使用
    let input_audio_indices: Vec<usize> = ictx
        .streams()
        .enumerate()
        .filter_map(|(i, s)| if s.parameters().medium() == media::Type::Audio { Some(i) } else { None })
        .collect();

    let resolved = resolve_video_params(params, &input_audio_indices);

    let mut octx =
        format::output(&resolved.output_path).map_err(|e| format!("无法打开输出文件: {}", e))?;

    // 为音轨创建处理器（多轨转码）
    let mut audio_processors: Vec<AudioTrackProcessor> = Vec::new();
    let mut audio_map: HashMap<usize, Vec<usize>> = HashMap::new();
    for track in &resolved.audio_tracks {
        if let Some(ist) = ictx.stream(track.source_stream_index) {
            let proc = AudioTrackProcessor::new(&ist, &mut octx, &track.encoding)?;
            let idx = audio_processors.len();
            audio_map
                .entry(track.source_stream_index)
                .or_default()
                .push(idx);
            audio_processors.push(proc);
        }
    }

    // 获取时长
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    // 检测是否有视频流
    let has_video = ictx.streams().best(media::Type::Video).is_some();
    let best_video_stream = if has_video {
        Some(ictx.streams().best(media::Type::Video).unwrap().index())
    } else {
        None
    };

    let selected_audio: Vec<usize> = if resolved.audio_tracks.is_empty() {
        input_audio_indices.clone()
    } else {
        resolved.audio_tracks.iter().map(|t| t.source_stream_index).collect()
    };

    let mut stream_mapping: Vec<isize> = vec![0; ictx.nb_streams() as usize];
    let mut ist_time_bases = vec![Rational(0, 1); ictx.nb_streams() as usize];
    let mut ost_time_bases: Vec<Rational> = Vec::new();
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
                        &resolved,
                        duration,
                        emitter.clone(),
                    )?;
                    transcoders.insert(ist_index, transcoder);
                    ost_index += 1;
                } else {
                    stream_mapping[ist_index] = -1; // Ignore
                }
            }
        } else if ist_medium == media::Type::Audio {
            if audio_map.contains_key(&ist_index) {
                stream_mapping[ist_index] = -2; // handled by processors
            } else {
                stream_mapping[ist_index] = -1;
            }
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
            create_black_video_encoder(&mut octx, &resolved, duration)?;
        black_video_encoder = Some((encoder, ost_idx, time_base, width, height, frame_rate));
        ost_index += 1;
    }

    octx.set_metadata(ictx.metadata().to_owned());
    octx.write_header()
        .map_err(|e| format!("Write header failed: {}", e))?;

    ost_time_bases = (0..octx.nb_streams())
        .map(|i| octx.stream(i as usize).unwrap().time_base())
        .collect();

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
        } else if let Some(indices) = audio_map.get(&ist_index) {
            for (n, &proc_idx) in indices.iter().enumerate() {
                let pkt_clone = if n == 0 { None } else { Some(packet.clone()) };
                let pkt_ref = pkt_clone.as_ref().unwrap_or(&packet);
                let proc = audio_processors
                    .get_mut(proc_idx)
                    .ok_or("音频处理器索引无效")?;
                proc.process_packet(pkt_ref, ist_time_bases[ist_index], &mut octx)?;
            }
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

    for proc in audio_processors.iter_mut() {
        proc.finish(&mut octx)?;
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
            emitter,
        )?;
    }

    octx.write_trailer()
        .map_err(|e| format!("Write trailer failed: {}", e))?;

    Ok(())
}

/// 创建黑屏视频编码器（用于音频转视频）
fn create_black_video_encoder(
    octx: &mut format::context::Output,
    params: &ResolvedVideoParams,
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

    let codec = media_common::select_video_encoder(
        Some(params.video_encoder.as_str()),
        params.use_hardware_acceleration,
    )
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
    let (width, height) =
        media_common::resolve_resolution(1920, 1080, params.resolution.as_deref());

    encoder.set_width(width);
    encoder.set_height(height);
    encoder.set_format(media_common::pick_pixel_format(
        params.bit_depth,
        params.use_hardware_acceleration,
    ));

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
    emitter: impl TaskEmitter,
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
                emitter.emit("progress", Some(progress), None, None);
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

