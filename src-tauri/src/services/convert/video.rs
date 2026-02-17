use std::collections::HashMap;

use ffmpeg::{
    codec, decoder, encoder, filter, format, frame, media, packet, picture, Dictionary, Rational,
};
use ffmpeg_next as ffmpeg;
use ffmpeg::filter::context::Source as _;
use ffmpeg::filter::context::Sink as _;
use serde::{Deserialize, Serialize};


use crate::media_common;
use crate::services::convert::audio::AudioEncodingParams;
use crate::services::convert::video_audio::AudioTrackProcessor;
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
    pub crf: Option<u32>,
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
    pub watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]

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
    pub crf: Option<u32>,
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
    pub watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
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
            let merged_encoding = AudioEncodingParams {
                codec: cfg.encoding.codec.clone().or(default_encoding.codec.clone()),
                bitrate: cfg.encoding.bitrate.or(default_encoding.bitrate),
                sample_rate: cfg.encoding.sample_rate.or(default_encoding.sample_rate),
                channels: cfg.encoding.channels.or(default_encoding.channels),
                bit_depth: cfg.encoding.bit_depth.or(default_encoding.bit_depth),
                quality: cfg.encoding.quality.or(default_encoding.quality),
            };
            resolved.push(ResolvedAudioTrack {
                source_stream_index: src_idx,
                encoding: merged_encoding,
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
        crf: params.crf,
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
        watermark: params.watermark.clone(),
    }
}

struct Transcoder<E: TaskEmitter> {
    ost_index: usize,
    decoder: decoder::Video,
    input_time_base: Rational,
    encoder: encoder::Video,
    encoder_time_base: Rational,
    scaler: ffmpeg::software::scaling::Context,
    frame_count: usize,
    duration: f64,
    emitter: E,
    last_pts: i64,
    start_time: i64,
    ist_index: usize,
    input_avg_frame_rate: Rational,
    logged_invalid_time_base: bool,
    filter: Option<filter::Graph>,
    filter_enabled: bool,
}

impl<E: TaskEmitter> Transcoder<E> {
    fn new(
        ist: &format::stream::Stream,
        octx: &mut format::context::Output,
        ost_index: usize,
        params: &ResolvedVideoParams,
        duration: f64,
        emitter: E,
        start_time: i64,
    ) -> Result<Self, String> {
        let global_header = octx.format().flags().contains(format::Flags::GLOBAL_HEADER);

        // 1. 设置解码器
        let ist_time_base = ist.time_base();
        let ist_avg_frame_rate = ist.avg_frame_rate();
        let decoder_ctx = ffmpeg::codec::context::Context::from_parameters(ist.parameters())
            .map_err(|e| format!("无法创建解码器上下文: {}", e))?;
        let decoder = decoder_ctx
            .decoder()
            .video()
            .map_err(|e| format!("无法创建视频解码器: {}", e))?;
        let decoder_time_base = decoder.time_base();
        let decoder_frame_rate = decoder.frame_rate();
        let codec_id = ist.parameters().id();
        log::debug!(
            "convert_video decoder init: ist_index={} codec_id={:?} codec_name={} ist_time_base={}/{} ist_avg_frame_rate={}/{} decoder_time_base={}/{} decoder_frame_rate={:?}",
            ist.index(),
            codec_id,
            codec_id.name(),
            ist_time_base.0,
            ist_time_base.1,
            ist_avg_frame_rate.0,
            ist_avg_frame_rate.1,
            decoder_time_base.0,
            decoder_time_base.1,
            decoder_frame_rate
        );

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
        
        let chosen_format = media_common::pick_pixel_format_for_codec(
            params.bit_depth,
            params.use_hardware_acceleration,
            codec,
        );
        encoder.set_format(chosen_format);

        // 帧率
        let decoder_frame_rate = decoder.frame_rate();
        let mut target_frame_rate = if let Some(fps_str) = &params.frame_rate {
            if fps_str != "original" {
                fps_str.parse::<i32>().ok().map(|fps| Rational(fps, 1))
            } else {
                decoder_frame_rate
            }
        } else {
            decoder_frame_rate
        }
        .unwrap_or(Rational(30, 1));

        // Guard against bogus fps (e.g. 90000/1 from stream timebase)
        let fps_num = target_frame_rate.numerator() as i64;
        let fps_den = target_frame_rate.denominator() as i64;
        let fps_value = if fps_den > 0 { fps_num as f64 / fps_den as f64 } else { 0.0 };
        if fps_value <= 0.0 || fps_value > 240.0 {
            target_frame_rate = Rational(30, 1);
        }
        encoder.set_frame_rate(Some((target_frame_rate.numerator(), target_frame_rate.denominator())));

        let encoder_time_base = if target_frame_rate.numerator() > 0 && target_frame_rate.denominator() > 0 {
            Rational(target_frame_rate.denominator(), target_frame_rate.numerator())
        } else {
            Rational(1, 30)
        };
        encoder.set_time_base(encoder_time_base);

        // 码率
        if let Some(bitrate) = params.video_bitrate {
            encoder.set_bit_rate((bitrate * 1000) as usize);
        } else if decoder.bit_rate() > 0 {
            encoder.set_bit_rate(decoder.bit_rate() as usize);
        } else if codec.name() == "libtheora" {
            // libtheora often requires an explicit bitrate/quality
            encoder.set_bit_rate(1_000_000);
        }

        if global_header && codec.name() != "h264_mf" {
            encoder.set_flags(codec::Flags::GLOBAL_HEADER);
        }

        // 极速模式设置
        let mut opts = Dictionary::new();
        if codec.name() != "h264_mf" {
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
        } else {
            // h264_mf often requires explicit rate control setting to accept the media type
            // opts.set("rate_control", "pc_vbr");
        }

        let is_mpeg2 = codec.name() == "mpeg2video";
        let is_mpeg_ps = matches!(
            params.format.as_str(),
            "vob" | "mpeg" | "mpg" | "svcd" | "dvd"
        );
        if is_mpeg2 && is_mpeg_ps {
            let gop_size = params
                .gop_size
                .unwrap_or(if fps_value <= 25.0 { 15 } else { 18 });
            let gop_size_str = gop_size.to_string();
            opts.set("g", gop_size_str.as_str());

            let maxrate_k = params.max_bitrate.unwrap_or(9000);
            let maxrate_str = format!("{}k", maxrate_k);
            opts.set("maxrate", maxrate_str.as_str());

            let minrate_k = params.min_bitrate.unwrap_or(0);
            let minrate_str = format!("{}k", minrate_k);
            opts.set("minrate", minrate_str.as_str());

            let bufsize_str = "1835k";
            opts.set("bufsize", bufsize_str);
        }

        eprintln!(
            "DEBUG: Encoder params: codec={}, width={}, height={}, pix_fmt={:?}, frame_rate={:?}, time_base={}/{} bitrate_kbps={:?}, hw_accel={}",
            codec.name(),
            width,
            height,
            chosen_format,
            target_frame_rate,
            encoder_time_base.numerator(),
            encoder_time_base.denominator(),
            params.video_bitrate,
            params.use_hardware_acceleration
        );

        let encoder = encoder
            .open_with(opts)
            .map_err(|e| format!("无法打开编码器: {}", e))?;

        ost.set_parameters(&encoder);
        let encoder_time_base = if encoder.time_base().numerator() > 0 {
            let tb = encoder.time_base();
            ost.set_time_base(tb);
            tb
        } else {
            ost.set_time_base(encoder_time_base);
            encoder_time_base
        };

        // 4. 设置 Scaler (用于分辨率转换和像素格式转换)
        // Fallback: Use scaler for now as Filter Graph API is unstable
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

        let mut filter_graph = None;
        let mut filter_enabled = false;
        if let Some(wm) = &params.watermark {
            if let Some(txt) = &wm.text {
                if txt.font_path.trim().is_empty() {
                    log::warn!("convert_video watermark text has empty font_path; drawtext will rely on system defaults.");
                }
            }
            if let Some(img) = &wm.image {
                if !std::path::Path::new(&img.path).exists() {
                    log::warn!(
                        "convert_video watermark image not found: {}",
                        img.path
                    );
                }
            }
            let filter_spec = wm
                .build_filter_string(width, height)
                .map_err(|e| format!("构建水印滤镜失败: {}", e))?;
            let frame_rate = target_frame_rate;
            let graph = build_video_filter_graph(
                width,
                height,
                encoder.format(),
                encoder_time_base,
                frame_rate,
                &filter_spec,
            )?;
            log::info!("convert_video watermark filter: {}", filter_spec);
            log::debug!("convert_video watermark graph: {}", graph.dump());
            filter_graph = Some(graph);
            filter_enabled = true;
        }

        Ok(Self {
            ost_index: ost.index(),
            decoder,
            input_time_base: ist.time_base(),
            input_avg_frame_rate: ist_avg_frame_rate,
            encoder,
            encoder_time_base,
            scaler,
            frame_count: 0,
            duration,
            emitter,
            start_time,
            last_pts: -1,
            ist_index: ist.index(),
            logged_invalid_time_base: false,
            filter: filter_graph,
            filter_enabled,
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
        loop {
            match self.decoder.receive_frame(&mut decoded) {
                Ok(()) => {}
                Err(e) => {
                    if is_ffmpeg_again(&e) || e == ffmpeg::Error::Eof {
                        break;
                    }
                    return Err(format!("Decode receive failed: {}", e));
                }
            }
            // 进度报告
            if let Some(pts) = decoded.pts() {
                if crate::task::cancel::is_cancelled() {
                    return Err("Task cancelled".to_string());
                }
                let decoder_tb = self.decoder.time_base();
                if (decoder_tb.0 == 0 || decoder_tb.1 == 0) && !self.logged_invalid_time_base {
                    log::warn!(
                        "convert_video invalid decoder time_base: {}/{}; fallback to input time_base {}/{} (ist_index={}, ist_avg_frame_rate={}/{}, decoder_frame_rate={:?})",
                        decoder_tb.0,
                        decoder_tb.1,
                        self.input_time_base.0,
                        self.input_time_base.1,
                        self.ist_index,
                        self.input_avg_frame_rate.0,
                        self.input_avg_frame_rate.1,
                        self.decoder.frame_rate()
                    );
                    self.logged_invalid_time_base = true;
                }
                let (tb_num, tb_den) = if decoder_tb.0 > 0 && decoder_tb.1 > 0 {
                    (decoder_tb.0 as f64, decoder_tb.1 as f64)
                } else if self.input_time_base.0 > 0 && self.input_time_base.1 > 0 {
                    (
                        self.input_time_base.0 as f64,
                        self.input_time_base.1 as f64,
                    )
                } else {
                    (0.0, 1.0)
                };
                let current_time = pts as f64 * tb_num / tb_den;
                if self.duration > 0.0 {
                    let progress = (current_time / self.duration * 100.0).min(100.0);
                    self.emitter.emit(
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
                .map_err(|e| {
                    format!(
                        "Scaling failed: {} (decoded fmt={:?} {}x{} pts={:?} -> target fmt={:?} {}x{})",
                        e,
                        decoded.format(),
                        decoded.width(),
                        decoded.height(),
                        decoded.pts(),
                        self.encoder.format(),
                        scaled_frame.width(),
                        scaled_frame.height()
                    )
                })?;

            let mut pts = decoded.pts().unwrap_or(0);
            if pts >= self.start_time {
                pts -= self.start_time;
            }
            
            // Rescale PTS from Decoder TB to Encoder TB
            let mut rescaled_pts = media_common::rescale_ts(
                pts,
                self.input_time_base,
                self.encoder_time_base,
            );
            if rescaled_pts <= self.last_pts {
                rescaled_pts = self.last_pts + 1;
            }

            self.frame_count += 1;
            self.last_pts = rescaled_pts;
            scaled_frame.set_pts(Some(rescaled_pts));
            scaled_frame.set_kind(picture::Type::None);

            if self.filter_enabled {
                self.add_frame_to_filter(&scaled_frame)?;
                self.get_and_process_filtered_frames(octx, ost_time_base)?;
            } else {
            self.send_frame_to_encoder(&scaled_frame).map_err(|e| {
                format!(
                    "Encode send failed: {} (scaled fmt={:?} {}x{} pts={:?} rescaled_pts={} input_tb={}/{} encoder_fmt={:?} encoder_tb={}/{})",
                    e,
                    scaled_frame.format(),
                    scaled_frame.width(),
                    scaled_frame.height(),
                    scaled_frame.pts(),
                    rescaled_pts,
                    self.input_time_base.0,
                    self.input_time_base.1,
                    self.encoder.format(),
                    self.encoder_time_base.0,
                    self.encoder_time_base.1
                )
            })?;
                self.receive_and_process_encoded_packets(octx, ost_time_base)
                    .map_err(|e| format!("Encode receive failed: {} (last pts={:?})", e, scaled_frame.pts()))?;
            }
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

    fn add_frame_to_filter(&mut self, frame: &frame::Video) -> Result<(), String> {
        let filter = self
            .filter
            .as_mut()
            .ok_or("Watermark filter not initialized")?;
        filter
            .get("in")
            .ok_or("Watermark filter source not found")?
            .source()
            .add(frame)
            .map_err(|e| e.to_string())
    }

    fn flush_filter(&mut self) -> Result<(), String> {
        let filter = self
            .filter
            .as_mut()
            .ok_or("Watermark filter not initialized")?;
        filter
            .get("in")
            .ok_or("Watermark filter source not found")?
            .source()
            .flush()
            .map_err(|e| e.to_string())
    }

    fn get_and_process_filtered_frames(
        &mut self,
        octx: &mut format::context::Output,
        ost_time_base: Rational,
    ) -> Result<(), String> {
        let mut filtered = frame::Video::empty();
        loop {
            let got_frame = {
                let filter = self
                    .filter
                    .as_mut()
                    .ok_or("Watermark filter not initialized")?;
                let res = filter
                    .get("out")
                    .ok_or("Watermark filter sink not found")?
                    .sink()
                    .frame(&mut filtered);
                res.is_ok()
            };
            if !got_frame {
                break;
            }
            self.send_frame_to_encoder(&filtered)?;
            self.receive_and_process_encoded_packets(octx, ost_time_base)?;
        }
        Ok(())
    }

    fn flush_filter_and_drain(
        &mut self,
        octx: &mut format::context::Output,
        ost_time_base: Rational,
    ) -> Result<(), String> {
        if !self.filter_enabled {
            return Ok(());
        }
        self.flush_filter()?;
        self.get_and_process_filtered_frames(octx, ost_time_base)?;
        Ok(())
    }

    fn receive_and_process_encoded_packets(
        &mut self,
        octx: &mut format::context::Output,
        ost_time_base: Rational,
    ) -> Result<(), String> {
        let mut encoded = packet::Packet::empty();
        loop {
            match self.encoder.receive_packet(&mut encoded) {
                Ok(()) => {
                    encoded.set_stream(self.ost_index);
                    encoded.rescale_ts(self.encoder_time_base, ost_time_base);
                    encoded.write_interleaved(octx).map_err(|e| e.to_string())?;
                }
                Err(e) => {
                    if is_ffmpeg_again(&e) || e == ffmpeg::Error::Eof {
                        break;
                    }
                    let codec_name = self
                        .encoder
                        .codec()
                        .map(|c| c.name().to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    log::error!(
                        "encode receive failed: err={} codec={} last_pts={} encoder_tb={}/{} ost_tb={}/{} frame_count={} input_tb={}/{}",
                        e,
                        codec_name,
                        self.last_pts,
                        self.encoder_time_base.0,
                        self.encoder_time_base.1,
                        ost_time_base.0,
                        ost_time_base.1,
                        self.frame_count,
                        self.input_time_base.0,
                        self.input_time_base.1
                    );
                    return Err(e.to_string());
                }
            }
        }
        Ok(())
    }
}

fn is_ffmpeg_again(err: &ffmpeg::Error) -> bool {
    matches!(
        err,
        ffmpeg::Error::Other { errno }
            if *errno == ffmpeg::util::error::EAGAIN || *errno == ffmpeg::util::error::EWOULDBLOCK
    )
}

fn build_video_filter_graph(
    width: u32,
    height: u32,
    pix_fmt: format::Pixel,
    time_base: Rational,
    frame_rate: Rational,
    filter_spec: &str,
) -> Result<filter::Graph, String> {
    let pix_fmt_name = pix_fmt
        .descriptor()
        .map(|desc| desc.name())
        .unwrap_or("yuv420p");
    let mut args = format!(
        "video_size={}x{}:pix_fmt={}:time_base={}/{}:pixel_aspect=1/1",
        width,
        height,
        pix_fmt_name,
        time_base.numerator(),
        time_base.denominator()
    );
    if frame_rate.numerator() > 0 && frame_rate.denominator() > 0 {
        args.push_str(&format!(
            ":frame_rate={}/{}",
            frame_rate.numerator(),
            frame_rate.denominator()
        ));
    }

    let mut graph = filter::Graph::new();
    graph
        .add(&filter::find("buffer").unwrap(), "in", &args)
        .map_err(|e| format!("创建视频 filter source 失败: {}", e))?;
    graph
        .add(&filter::find("buffersink").unwrap(), "out", "")
        .map_err(|e| format!("创建视频 filter sink 失败: {}", e))?;
    {
        let mut out = graph
            .get("out")
            .ok_or("无法获取视频 filter sink")?;
        out.set_pixel_format(pix_fmt);
    }
    graph
        .output("in", 0)
        .and_then(|p| p.input("out", 0))
        .and_then(|p| p.parse(filter_spec))
        .map_err(|e| format!("解析视频水印 filter 失败: {}", e))?;
    graph
        .validate()
        .map_err(|e| format!("视频水印 filter 校验失败: {}", e))?;

    Ok(graph)
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

    // 获取时长和起始时间
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;
    log::info!("convert_video duration: raw={} seconds={}", ictx.duration(), duration);
    // 由于 ictx.start_time() 可能不可用，遍历流获取最早的其实时间
    let start_time = ictx
        .streams()
        .map(|s| s.start_time())
        .filter(|&t| t != ffmpeg::ffi::AV_NOPTS_VALUE)
        .min()
        .unwrap_or(0);
    let global_start_time = start_time;

    // 为音轨创建处理器（多轨转码）
    eprintln!("Info: Input stream count: {}", ictx.nb_streams());
    let mut audio_processors: Vec<AudioTrackProcessor> = Vec::new();
    let mut audio_map: HashMap<usize, Vec<usize>> = HashMap::new();
    for track in &resolved.audio_tracks {
        if let Some(ist) = ictx.stream(track.source_stream_index) {
            let proc = AudioTrackProcessor::new(&ist, &mut octx, &track.encoding, global_start_time)?;
            let idx = audio_processors.len();
            audio_map
                .entry(track.source_stream_index)
                .or_default()
                .push(idx);
            audio_processors.push(proc);
        }
    }

    // 检测是否有视频流
    let has_video = ictx.streams().best(media::Type::Video).is_some();
    let best_video_stream = if has_video {
        Some(ictx.streams().best(media::Type::Video).unwrap().index())
    } else {
        None
    };

    let mut stream_mapping: Vec<isize> = vec![0; ictx.nb_streams() as usize];
    let mut ist_time_bases = vec![Rational(0, 1); ictx.nb_streams() as usize];
    let mut ost_time_bases: Vec<Rational> = Vec::new();
    let mut transcoders = HashMap::new();
    let mut ost_index = octx.nb_streams() as usize;

    // 如果没有视频流，需要创建黑屏视频流
    let mut black_video_encoder: Option<(encoder::Video, usize, Rational, u32, u32, Rational)> =
        None;

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
                        global_start_time,
                    )?;
                    transcoders.insert(ist_index, transcoder);
                    ost_index += 1;
                    eprintln!("Info: Mapped Video Input {} to Output {}", ist_index, ost_index - 1);
                } else {
                    stream_mapping[ist_index] = -1; // Ignore
                    eprintln!("Info: Ignored Video Input {} (Not best)", ist_index);
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
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }
        let ist_index = stream.index();
        if ist_index >= stream_mapping.len() {
            continue;
        }
        let mapping = stream_mapping[ist_index] as isize;
        // eprintln!("Debug: Packet from stream {} (mapping {})", ist_index, mapping);
        if mapping == -2 {
            if let Some(indices) = audio_map.get(&ist_index) {
                for (n, &proc_idx) in indices.iter().enumerate() {
                    let pkt_clone = if n == 0 { None } else { Some(packet.clone()) };
                    let pkt_ref = pkt_clone.as_ref().unwrap_or(&packet);
                    let proc = audio_processors
                        .get_mut(proc_idx)
                        .ok_or("音频处理器索引无效")?;
                     // Get the correct output stream time base for this processor
                     let ost_index = proc.ost_index;
                     if ost_index >= ost_time_bases.len() {
                         return Err(format!("Invalid audio output stream index: {}", ost_index));
                     }
                     let ost_time_base = ost_time_bases[ost_index];
                    proc.process_packet(pkt_ref, ist_time_bases[ist_index], ost_time_base, &mut octx)?;
                }
            }
            continue;
        }
        if mapping < 0 {
            continue;
        }

        let ost_idx = mapping as usize;
        let ost_time_base = ost_time_bases[ost_idx];

        if let Some(transcoder) = transcoders.get_mut(&ist_index) {
            if let Err(e) = transcoder.send_packet_to_decoder(&packet) {
                log::error!("Video decode send failed: {}", e);
                return Err(format!("Video decode send failed: {}", e));
            }
            if let Err(e) = transcoder.receive_and_process_decoded_frames(&mut octx, ost_time_bases[mapping as usize]) {
                log::error!("Video process failed: {}", e);
                return Err(format!("Video process failed: {}", e));
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

        if let Err(e) = transcoder.send_eof_to_decoder() {
            log::error!("Video decode eof failed: {}", e);
            return Err(e);
        }
        if let Err(e) = transcoder.receive_and_process_decoded_frames(&mut octx, ost_time_base) {
            log::error!("Video process failed (flush decode): {}", e);
            return Err(e);
        }
        if let Err(e) = transcoder.flush_filter_and_drain(&mut octx, ost_time_base) {
            log::error!("Video filter flush failed: {}", e);
            return Err(e);
        }
        if let Err(e) = transcoder.send_eof_to_encoder() {
            log::error!("Video encode eof failed: {}", e);
            return Err(e);
        }
        if let Err(e) = transcoder.receive_and_process_encoded_packets(&mut octx, ost_time_base) {
            log::error!("Video encode receive failed: {}", e);
            return Err(e);
        }
    }

    for proc in audio_processors.iter_mut() {
        let ost_index = proc.ost_index;
        if ost_index < ost_time_bases.len() {
             let ost_time_base = ost_time_bases[ost_index];
             proc.finish(ost_time_base, &mut octx)?;
        }
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
            emitter.clone(),
        )?;
    }

    octx.write_trailer()
        .map_err(|e| format!("Write trailer failed: {}", e))?;

    emitter.emit("complete", Some(100.0), Some(resolved.output_path), None);

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
    encoder.set_format(media_common::pick_pixel_format_for_codec(
        params.bit_depth,
        params.use_hardware_acceleration,
        codec,
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

    // 码率控制
    let is_crf = params.rc_mode.as_deref() == Some("crf");
    if !is_crf {
        if let Some(bitrate) = params.video_bitrate {
            encoder.set_bit_rate((bitrate * 1000) as usize);
        }
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
            if crate::task::cancel::is_cancelled() {
                return Err("Task cancelled".to_string());
            }
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
