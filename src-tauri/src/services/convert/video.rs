use std::collections::HashMap;

use ffmpeg::{
    codec, decoder, encoder, filter, format, frame, media, packet, picture, Dictionary, Rational,
};
use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};

use crate::events::TaskEmitter;
use crate::media_common;
use crate::media_common::audio_transcode::{
    AudioEncodingParams, AudioOutputSummary, AudioTrackConfig as SharedAudioTrackConfig,
    AudioTrackProcessor,
};
use crate::media_common::video_pipeline::{ResolvedVideoPipelineParams, VideoPipelineResolveOptions};
use crate::media_common::video_transcode::{
    force_hevc_hvc1_tag, is_hardware_video_encoder,
};
use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};
use video_stages::{
    drain_processors_stage, process_packets_stage, ConvertDrainStageContext,
    ConvertProcessStageContext,
};

#[path = "video_stages.rs"]
mod video_stages;

pub type AudioTrackConfig = SharedAudioTrackConfig;

/// 视频转换参数（全部可选，使用默认值兜底）
#[derive(Debug, Clone)]
pub struct VideoConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub format: Option<String>,        // mp4, mov, mkv, etc.
    pub video_encoder: Option<String>, // h264, hevc, etc.
    pub video_bitrate: Option<u32>,    // kbps, auto if None
    pub min_bitrate: Option<u32>,
    pub max_bitrate: Option<u32>,
    pub rc_mode: Option<String>, // cbr/vbr/crf
    pub crf: Option<u32>,
    pub resolution: Option<String>, // "1920x1080", "original", etc.
    pub frame_rate: Option<String>, // "30", "60", "original"
    pub aspect_ratio: Option<String>,
    pub scaling_mode: Option<String>,
    pub gop_size: Option<u32>,
    pub preset: Option<String>,
    pub profile: Option<String>,
    pub tune: Option<String>,
    pub color_space: Option<String>,
    pub color_range: Option<String>,
    pub bit_depth: Option<u32>,
    pub crop: Option<String>,
    // 多轨音频
    pub audio_tracks: Option<Vec<AudioTrackConfig>>,
    pub default_audio_params: Option<AudioEncodingParams>,
    pub audio_filter_spec: Option<String>,
    // 兼容旧字段
    pub audio_encoder: Option<String>,
    pub use_hardware_acceleration: bool,
    pub use_ultra_fast_speed: bool,
    pub watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

type ResolvedVideoParams = ResolvedVideoPipelineParams;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoConversionReport {
    pub output_media: MediaDetails,
}

fn audio_summary_to_stream_details(summary: AudioOutputSummary) -> StreamDetails {
    StreamDetails {
        index: summary.ost_index,
        codec_type: "audio".to_string(),
        codec_name: summary.codec_name,
        codec_long_name: None,
        time_base: summary.time_base,
        pix_fmt: None,
        width: None,
        height: None,
        frame_rate: None,
        channels: summary.channels,
        sample_rate: summary.sample_rate,
        bit_rate: summary.bit_rate,
        bit_depth: None,
        bits_per_sample: None,
    }
}

impl From<VideoConversionParams> for VideoPipelineResolveOptions {
    fn from(params: VideoConversionParams) -> Self {
        Self {
            input_path: params.input_path,
            output_path: params.output_path,
            format: params.format,
            video_encoder: params.video_encoder,
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
            color_range: params.color_range,
            bit_depth: params.bit_depth,
            crop: params.crop,
            audio_tracks: params.audio_tracks,
            default_audio_params: params.default_audio_params,
            audio_filter_spec: params.audio_filter_spec,
            audio_encoder: params.audio_encoder,
            use_hardware_acceleration: params.use_hardware_acceleration,
            use_ultra_fast_speed: params.use_ultra_fast_speed,
            watermark: params.watermark,
        }
    }
}

struct Transcoder<E: TaskEmitter> {
    ost_index: usize,
    decoder: decoder::Video,
    input_time_base: Rational,
    encoder: encoder::Video,
    encoder_time_base: Rational,
    scaler: Option<ffmpeg::software::scaling::Context>,
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
    written_bytes: u64,
    configured_bit_rate: Option<i64>,
}

impl<E: TaskEmitter> Transcoder<E> {
    fn new(
        ist: &format::stream::Stream,
        octx: &mut format::context::Output,
        _ost_index: usize,
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
        let codec_id = codec.id();
        let codec_name = codec.name().to_string();
        let effective_hw_accel =
            params.use_hardware_acceleration && is_hardware_video_encoder(&codec_name);
        if params.use_hardware_acceleration && !effective_hw_accel {
            log::warn!(
                "convert_video requested hardware acceleration but selected software encoder: {}",
                codec_name
            );
        }

        let mut ost = octx
            .add_stream(codec)
            .map_err(|e| format!("无法添加输出流: {}", e))?;

        let mut encoder = codec::context::Context::new_with_codec(codec)
            .encoder()
            .video()
            .map_err(|e| format!("无法创建视频编码器: {}", e))?;

        // 3. 配置编码器参数
        // 分辨率处理
        let (width, height) = media_common::resolve_resolution(
            decoder.width(),
            decoder.height(),
            params.resolution.as_deref(),
        );

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
        let fps_value = if fps_den > 0 {
            fps_num as f64 / fps_den as f64
        } else {
            0.0
        };
        if fps_value <= 0.0 || fps_value > 240.0 {
            target_frame_rate = Rational(30, 1);
        }
        encoder.set_frame_rate(Some((
            target_frame_rate.numerator(),
            target_frame_rate.denominator(),
        )));

        let encoder_time_base =
            if target_frame_rate.numerator() > 0 && target_frame_rate.denominator() > 0 {
                Rational(
                    target_frame_rate.denominator(),
                    target_frame_rate.numerator(),
                )
            } else {
                Rational(1, 30)
            };
        encoder.set_time_base(encoder_time_base);

        // 码率/质量控制策略
        let supports_crf = matches!(codec_name.as_str(), "libx264" | "libx265");
        let requested_rc_mode = params.rc_mode.as_deref().map(|s| s.to_lowercase());
        let auto_crf_mode = requested_rc_mode.is_none()
            && params.video_bitrate.is_none()
            && !params.use_hardware_acceleration
            && supports_crf;
        let effective_rc_mode = if auto_crf_mode {
            "crf".to_string()
        } else {
            requested_rc_mode.unwrap_or_else(|| "bitrate".to_string())
        };
        let effective_crf = if effective_rc_mode == "crf" && supports_crf {
            Some(params.crf.unwrap_or(if codec_name == "libx265" { 28 } else { 23 }))
        } else {
            None
        };

        let configured_bit_rate = if effective_rc_mode == "crf" {
            // CRF mode: let encoder target perceptual quality; no fixed bitrate.
            None
        } else if let Some(bitrate) = params.video_bitrate {
            let bits = (bitrate as i64) * 1000;
            encoder.set_bit_rate(bits as usize);
            Some(bits)
        } else if decoder.bit_rate() > 0 {
            encoder.set_bit_rate(decoder.bit_rate() as usize);
            Some(decoder.bit_rate() as i64)
        } else if codec_name == "libtheora" {
            // libtheora often requires an explicit bitrate/quality
            encoder.set_bit_rate(1_000_000);
            Some(1_000_000)
        } else {
            None
        };

        if global_header && codec.name() != "h264_mf" {
            encoder.set_flags(codec::Flags::GLOBAL_HEADER);
        }

        // 极速模式设置
        let mut opts = Dictionary::new();
        if codec_name != "h264_mf" {
            if !params.use_hardware_acceleration {
                let preset = if params.use_ultra_fast_speed {
                    "ultrafast".to_string()
                } else if let Some(p) = params.preset.clone() {
                    p
                } else {
                    // Keep visual quality while reducing output size.
                    "slow".to_string()
                };
                opts.set("preset", preset.as_str());
            } else if cfg!(target_os = "macos") {
                // Keep ultra-fast mode behavior without forcing realtime rate-control path.
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

        if let Some(g) = params.gop_size {
            opts.set("g", g.to_string().as_str());
        }
        if let Some(profile) = &params.profile {
            if !profile.trim().is_empty() {
                opts.set("profile", profile);
            }
        }
        if let Some(tune) = &params.tune {
            if !tune.trim().is_empty() {
                opts.set("tune", tune);
            }
        }
        if let Some(crf) = effective_crf {
            opts.set("crf", crf.to_string().as_str());
        }
        if effective_rc_mode != "crf" && matches!(codec_name.as_str(), "libx264" | "libx265") {
            let fallback_kbps = configured_bit_rate
                .map(|b| ((b.max(1) + 999) / 1000) as u32)
                .unwrap_or(0);
            let maxrate_kbps = params.max_bitrate.unwrap_or(fallback_kbps);
            if maxrate_kbps > 0 {
                let maxrate_s = format!("{}k", maxrate_kbps);
                let bufsize_s = format!("{}k", maxrate_kbps.saturating_mul(2));
                opts.set("maxrate", maxrate_s.as_str());
                opts.set("bufsize", bufsize_s.as_str());
            }
        }

        eprintln!(
            "DEBUG: Encoder params: codec={}, width={}, height={}, pix_fmt={:?}, frame_rate={:?}, time_base={}/{} bitrate_kbps={:?}, hw_accel={}, rc_mode={}, crf={:?}, preset={:?}, profile={:?}, tune={:?}",
            codec_name,
            width,
            height,
            chosen_format,
            target_frame_rate,
            encoder_time_base.numerator(),
            encoder_time_base.denominator(),
            params.video_bitrate,
            effective_hw_accel,
            effective_rc_mode,
            effective_crf,
            params.preset,
            params.profile,
            params.tune
        );

        let encoder = encoder
            .open_with(opts)
            .map_err(|e| format!("无法打开编码器: {}", e))?;

        ost.set_parameters(&encoder);
        force_hevc_hvc1_tag(&mut ost, codec_id, params.format.as_str());
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
        let needs_scaler = decoder.format() != encoder.format()
            || decoder.width() != width
            || decoder.height() != height;
        let scaler = if needs_scaler {
            Some(
                ffmpeg::software::scaling::context::Context::get(
                    decoder.format(),
                    decoder.width(),
                    decoder.height(),
                    encoder.format(),
                    width,
                    height,
                    ffmpeg::software::scaling::flag::Flags::BILINEAR,
                )
                .map_err(|e| format!("无法创建Scaler: {}", e))?,
            )
        } else {
            log::debug!(
                "convert_video scaler bypassed: src fmt={:?} {}x{} matches dst fmt={:?} {}x{}",
                decoder.format(),
                decoder.width(),
                decoder.height(),
                encoder.format(),
                width,
                height
            );
            None
        };

        let mut filter_graph = None;
        let mut filter_enabled = false;
        if let Some(wm) = &params.watermark {
            if let Some(txt) = &wm.text {
                if txt
                    .font_path
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .is_empty()
                {
                    log::warn!("convert_video watermark text has empty font_path; drawtext will rely on system defaults.");
                }
            }
            if let Some(img) = &wm.image {
                if !std::path::Path::new(&img.path).exists() {
                    log::warn!("convert_video watermark image not found: {}", img.path);
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
            written_bytes: 0,
            configured_bit_rate,
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
                    (self.input_time_base.0 as f64, self.input_time_base.1 as f64)
                } else {
                    (0.0, 1.0)
                };
                let current_time = pts as f64 * tb_num / tb_den;
                if self.duration > 0.0 {
                    let progress = (current_time / self.duration * 100.0).min(100.0);
                    self.emitter.emit("progress", Some(progress), None, None);
                }
            }

            let mut pts = decoded.pts().unwrap_or(0);
            if pts >= self.start_time {
                pts -= self.start_time;
            }

            let mut scaled_frame = frame::Video::empty();
            let frame_to_encode: &mut frame::Video = if let Some(scaler) = self.scaler.as_mut() {
                scaler.run(&decoded, &mut scaled_frame).map_err(|e| {
                    format!(
                        "Scaling failed: {} (decoded fmt={:?} {}x{} pts={:?} -> target fmt={:?})",
                        e,
                        decoded.format(),
                        decoded.width(),
                        decoded.height(),
                        decoded.pts(),
                        self.encoder.format()
                    )
                })?;
                &mut scaled_frame
            } else {
                &mut decoded
            };

            // Rescale PTS from Decoder TB to Encoder TB
            let mut rescaled_pts =
                media_common::rescale_ts(pts, self.input_time_base, self.encoder_time_base);
            if rescaled_pts <= self.last_pts {
                rescaled_pts = self.last_pts + 1;
            }

            self.frame_count += 1;
            self.last_pts = rescaled_pts;
            frame_to_encode.set_pts(Some(rescaled_pts));
            frame_to_encode.set_kind(picture::Type::None);

            if self.filter_enabled {
                self.add_frame_to_filter(frame_to_encode)?;
                self.get_and_process_filtered_frames(octx, ost_time_base)?;
            } else {
                self.send_frame_to_encoder(frame_to_encode).map_err(|e| {
                format!(
                    "Encode send failed: {} (scaled fmt={:?} {}x{} pts={:?} rescaled_pts={} input_tb={}/{} encoder_fmt={:?} encoder_tb={}/{})",
                    e,
                    frame_to_encode.format(),
                    frame_to_encode.width(),
                    frame_to_encode.height(),
                    frame_to_encode.pts(),
                    rescaled_pts,
                    self.input_time_base.0,
                    self.input_time_base.1,
                    self.encoder.format(),
                    self.encoder_time_base.0,
                    self.encoder_time_base.1
                )
            })?;
                self.receive_and_process_encoded_packets(octx, ost_time_base)
                    .map_err(|e| {
                        format!(
                            "Encode receive failed: {} (last pts={:?})",
                            e,
                            frame_to_encode.pts()
                        )
                    })?;
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
                    let packet_size = encoded.size() as u64;
                    encoded.set_stream(self.ost_index);
                    encoded.rescale_ts(self.encoder_time_base, ost_time_base);
                    encoded.write_interleaved(octx).map_err(|e| e.to_string())?;
                    self.written_bytes = self.written_bytes.saturating_add(packet_size);
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

    fn written_bytes(&self) -> u64 {
        self.written_bytes
    }

    fn output_stream_details(&self) -> StreamDetails {
        let codec_name = self
            .encoder
            .codec()
            .map(|c| c.name().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        StreamDetails {
            index: self.ost_index,
            codec_type: "video".to_string(),
            codec_name: codec_name.clone(),
            codec_long_name: None,
            time_base: Some(format!(
                "{}/{}",
                self.encoder_time_base.numerator(),
                self.encoder_time_base.denominator()
            )),
            pix_fmt: self
                .encoder
                .format()
                .descriptor()
                .map(|desc| desc.name().to_string())
                .or_else(|| Some(format!("{:?}", self.encoder.format()))),
            width: Some(self.encoder.width()),
            height: Some(self.encoder.height()),
            frame_rate: crate::media_common::video_transcode::rational_to_rate_string(Rational(
                self.encoder_time_base.denominator(),
                self.encoder_time_base.numerator(),
            )),
            channels: None,
            sample_rate: None,
            bit_rate: self.configured_bit_rate,
            bit_depth: None,
            bits_per_sample: None,
        }
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
        let mut out = graph.get("out").ok_or("无法获取视频 filter sink")?;
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
) -> Result<VideoConversionReport, String> {
    let (mut ictx, input_analysis, resolved, mut octx) =
        media_common::video_pipeline_core::run_pipeline(
            "convert_video",
            || {
                ffmpeg::init().map_err(|e| format!("FFmpeg init failed: {}", e))?;
                let ictx = format::input(&params.input_path)
                    .map_err(|e| format!("无法打开输入文件: {}", e))?;
                let input_analysis = media_common::video_pipeline::analyze_video_input(&ictx);
                Ok((ictx, input_analysis))
            },
            |(_ictx, input_analysis)| {
                Ok(media_common::video_pipeline::resolve_video_params_for_convert(
                    VideoPipelineResolveOptions::from(params.clone()),
                    &input_analysis.input_audio_indices,
                ))
            },
            |_analyze, resolved| {
                let mut resolved = resolved.clone();
                resolved.output_path = media_common::ensure_unique_output_path(&resolved.output_path);
                let octx = format::output(&resolved.output_path)
                    .map_err(|e| format!("无法打开输出文件: {}", e))?;
                Ok((resolved, octx))
            },
            |_| Ok(()),
            |analyze, _resolve, init| {
                let (ictx, input_analysis) = analyze;
                let (resolved, octx) = init;
                Ok((ictx, input_analysis, resolved, octx))
            },
        )?;

    // 获取时长和起始时间
    let duration = input_analysis.duration_seconds;
    let start_time = input_analysis.global_start_time;
    let global_start_time = start_time;

    // 为音轨创建处理器（多轨转码）
    eprintln!("Info: Input stream count: {}", ictx.nb_streams());
    let mut audio_processors: Vec<AudioTrackProcessor> = Vec::new();
    let mut audio_map: HashMap<usize, Vec<usize>> = HashMap::new();
    for track in &resolved.audio_tracks {
        if let Some(ist) = ictx.stream(track.source_stream_index) {
            if ist.parameters().medium() != media::Type::Audio {
                log::warn!(
                    "convert_video skip non-audio source stream for audio track: source_stream_index={} medium={:?}",
                    track.source_stream_index,
                    ist.parameters().medium()
                );
                continue;
            }
            let proc = AudioTrackProcessor::new_with_filter(
                &ist,
                &mut octx,
                &track.encoding,
                global_start_time,
                track.filter_spec.as_deref(),
            )?;
            let idx = audio_processors.len();
            audio_map
                .entry(track.source_stream_index)
                .or_default()
                .push(idx);
            audio_processors.push(proc);
        }
    }

    // 检测是否有视频流
    let best_video_stream = input_analysis.best_video_stream_index;
    let has_video = best_video_stream.is_some();

    let ost_time_bases: Vec<Rational>;
    let mut stream_copy_bytes: u64 = 0;

    // 如果没有视频流，需要创建黑屏视频流
    let mut black_video_encoder: Option<media_common::video_pipeline::BlackVideoEncoderBundle> =
        None;
    let mut black_video_stream_details: Option<StreamDetails> = None;
    let mut black_video_written_bytes: u64 = 0;

    let stream_init = media_common::video_pipeline::init_convert_streams(
        &ictx,
        octx.nb_streams() as usize,
        best_video_stream,
        &audio_map,
        |_, ist, ost_index| {
            Transcoder::new(
                ist,
                &mut octx,
                ost_index,
                &resolved,
                duration,
                emitter.clone(),
                global_start_time,
            )
        },
    )?;
    let stream_mapping = stream_init.stream_mapping;
    let ist_time_bases = stream_init.ist_time_bases;
    let mut transcoders = stream_init.transcoders;

    // 如果没有视频流，创建黑屏视频编码器（在循环之后，避免借用冲突）
    if !has_video {
        let bundle = media_common::video_pipeline::create_black_video_encoder(&mut octx, &resolved)?;
        black_video_stream_details =
            Some(media_common::video_pipeline::build_black_video_stream_details(&bundle, &resolved));
        black_video_encoder = Some(bundle);
    }

    octx.set_metadata(ictx.metadata().to_owned());
    media_common::video_pipeline::write_header_with_stream_dump(
        &mut octx,
        "convert_video write_header",
        "Write header failed",
    )?;

    ost_time_bases = (0..octx.nb_streams())
        .map(|i| octx.stream(i as usize).unwrap().time_base())
        .collect();

    let mut process_ctx = ConvertProcessStageContext {
        ictx: &mut ictx,
        octx: &mut octx,
        stream_mapping: &stream_mapping,
        ist_time_bases: &ist_time_bases,
        ost_time_bases: &ost_time_bases,
        audio_map: &audio_map,
        audio_processors: &mut audio_processors,
        transcoders: &mut transcoders,
        stream_copy_bytes: &mut stream_copy_bytes,
    };
    process_packets_stage(&mut process_ctx)?;

    let mut drain_ctx = ConvertDrainStageContext {
        octx: &mut octx,
        stream_mapping: &stream_mapping,
        ost_time_bases: &ost_time_bases,
        transcoders: &mut transcoders,
        audio_processors: &mut audio_processors,
    };
    drain_processors_stage(&mut drain_ctx)?;

    // 如果没有视频流，生成黑屏视频帧
    if let Some(mut bundle) = black_video_encoder {
        let ost_time_base = ost_time_bases[bundle.ost_idx];
        black_video_written_bytes = media_common::video_pipeline::generate_black_video_frames(
            &mut bundle,
            &mut octx,
            ost_time_base,
            duration,
            &emitter,
        )?;
    }

    octx.write_trailer()
        .map_err(|e| format!("Write trailer failed: {}", e))?;

    let mut total_written_bytes = stream_copy_bytes.saturating_add(black_video_written_bytes);
    let mut output_streams: Vec<StreamDetails> = Vec::new();

    for transcoder in transcoders.values() {
        total_written_bytes = total_written_bytes.saturating_add(transcoder.written_bytes());
        output_streams.push(transcoder.output_stream_details());
    }

    for proc in &audio_processors {
        total_written_bytes = total_written_bytes.saturating_add(proc.written_bytes());
        output_streams.push(audio_summary_to_stream_details(proc.output_summary()));
    }

    if let Some(black_stream) = black_video_stream_details.clone() {
        output_streams.push(black_stream);
    }

    output_streams.sort_by_key(|s| s.index);

    let output_path = resolved.output_path.clone();
    let output_media = media_common::video_pipeline::build_output_media(
        output_path.clone(),
        resolved.format.clone(),
        duration,
        total_written_bytes,
        output_streams,
    );

    let estimated_avg_bitrate = if duration > 0.0 {
        Some(((total_written_bytes as f64 * 8.0) / duration) as i64)
    } else {
        None
    };
    media_common::video_pipeline::log_video_pipeline_summary(
        "convert_video",
        &output_path,
        duration,
        total_written_bytes,
        estimated_avg_bitrate,
        None,
        None,
    );
    media_common::video_pipeline::emit_complete_with_path(&emitter, &output_path);

    Ok(VideoConversionReport { output_media })
}

