use crate::events::TaskEmitter;
use crate::media_common;
use crate::media_common::audio_transcode::AudioTrackConfig as SharedAudioTrackConfig;
use crate::media_common::video_transcode;
use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};
use ffmpeg::{codec, encoder, format, frame, packet, software, Rational};
use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Instant;
use video_stages::{
    drain_processors_stage, process_packets_stage, CompressDrainStageContext,
    CompressProcessStageContext,
};

#[path = "video_stages.rs"]
mod video_stages;

pub type AudioTrackConfig = SharedAudioTrackConfig;

#[derive(Deserialize, Clone)]
pub struct VideoCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub width: Option<u32>,                      // 目标宽度
    pub height: Option<u32>,                     // 目标高度
    pub bitrate: Option<u32>,                    // 视频码率 kbps
    pub frame_rate: Option<f32>,                 // 目标帧率
    pub codec: Option<String>,                   // h264/h265/vp9/av1
    pub keyframe_interval: Option<u32>,          // GOP 间隔
    pub color_depth: Option<u32>,                // 8/10/12 bit
    pub aspect_ratio: Option<String>,            // 16:9 等
    pub remove_audio: Option<bool>,              // 去除音轨
    pub audio_tracks: Option<Vec<AudioTrackConfig>>, // 音轨配置（当前使用首轨参数）
    pub preset: Option<String>,                  // ultrafast/fast/medium/slow
    pub use_hardware_acceleration: Option<bool>, // 是否启用硬件编码（如可用）
    pub use_ultra_fast_speed: Option<bool>,      // 极速模式：优先使用 ultrafast preset
    pub forced_watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoCompressionReport {
    pub output_media: MediaDetails,
}

struct VideoProcessor<E: TaskEmitter> {
    encoder: encoder::Video,
    decoder: codec::decoder::Video,
    scaler: Option<software::scaling::Context>,
    ost_index: usize,
    ost_time_base: Rational,
    final_encoder_time_base: Rational,
    stream_time_base: Rational,
    fps: f64,
    frame_count: usize,
    last_progress_emitted: f64,
    duration: f64,
    last_emit_at: Instant,
    emitter: E,
    written_bytes: u64,
    target_bitrate: usize,
    encoded_packets: u64,
    next_pts: i64,
    last_pts: i64,
    last_mux_dts_ost: i64,
    next_mux_ts_ost: i64,
    frame_step_ost: i64,
}

impl<E: TaskEmitter> VideoProcessor<E> {
    fn rescale_pts(pts: Option<i64>, src_tb: Rational, dst_tb: Rational) -> Option<i64> {
        if src_tb.denominator() <= 0 || dst_tb.denominator() <= 0 {
            return pts;
        }
        pts.map(|v| unsafe { ffmpeg::ffi::av_rescale_q(v, src_tb.into(), dst_tb.into()) })
    }

    fn new(
        video_stream: &format::stream::Stream,
        octx: &mut format::context::Output,
        params: &VideoCompressionParams,
        duration: f64,
        emitter: E,
    ) -> Result<Self, String> {
        let decoder_ctx = codec::context::Context::from_parameters(video_stream.parameters())
            .map_err(|e| format!("无法创建视频解码器上下文: {}", e))?;
        let decoder = decoder_ctx
            .decoder()
            .video()
            .map_err(|e| format!("无法创建视频解码器: {}", e))?;

        let use_hw = params.use_hardware_acceleration.unwrap_or(false);
        let codec = video_transcode::pick_video_encoder_for_compress(
            params.codec.as_deref(),
            use_hw,
            video_stream.parameters().id(),
        )
        .ok_or_else(|| "未找到匹配的视频编码器".to_string())?;
        let selected_codec_name = codec.name().to_string();
        let effective_hw = use_hw && video_transcode::is_hardware_video_encoder(&selected_codec_name);
        if use_hw && !effective_hw {
            log::warn!(
                "compress_video requested hardware acceleration but selected software encoder: {}",
                selected_codec_name
            );
        }

        let global_header = octx
            .format()
            .flags()
            .contains(format::flag::Flags::GLOBAL_HEADER);

        let mut video_ost = octx
            .add_stream(codec)
            .map_err(|e| format!("无法添加视频输出流: {}", e))?;

        let mut encoder_ctx = codec::context::Context::new_with_codec(codec);
        if global_header {
            encoder_ctx.set_flags(codec::flag::Flags::GLOBAL_HEADER);
        }
        let mut encoder = encoder_ctx
            .encoder()
            .video()
            .map_err(|e| format!("无法创建视频编码器: {}", e))?;

        let (target_w, target_h) = media_common::scale_dimensions(
            decoder.width(),
            decoder.height(),
            params.width,
            params.height,
        );

        let target_pixel_format =
            media_common::pick_pixel_format_for_codec(params.color_depth, use_hw, codec);
        let aspect_ratio = media_common::parse_aspect_ratio(params.aspect_ratio.as_deref())
            .unwrap_or_else(|| decoder.aspect_ratio());

        encoder.set_width(target_w);
        encoder.set_height(target_h);
        encoder.set_aspect_ratio(aspect_ratio);
        encoder.set_format(target_pixel_format);

        let target_frame_rate = params
            .frame_rate
            .map(|f| Rational(f.round().max(1.0) as i32, 1))
            .or_else(|| decoder.frame_rate());
        let fallback_fps = video_stream.avg_frame_rate();
        let fps = target_frame_rate
            .map(|r| {
                let num = r.numerator() as f64;
                let den = r.denominator() as f64;
                if num > 0.0 && den > 0.0 {
                    num / den
                } else {
                    30.0
                }
            })
            .or_else(|| {
                let num = fallback_fps.numerator() as f64;
                let den = fallback_fps.denominator() as f64;
                if num > 0.0 && den > 0.0 {
                    Some(num / den)
                } else {
                    None
                }
            })
            .unwrap_or(30.0);
        encoder.set_frame_rate(target_frame_rate);

        let encoder_time_base = target_frame_rate
            .map(|fps| {
                if fps.numerator() > 0 && fps.denominator() > 0 {
                    Rational(fps.denominator(), fps.numerator())
                } else {
                    Rational(1, 30)
                }
            })
            .unwrap_or(Rational(1, 30));
        encoder.set_time_base(encoder_time_base);

        let target_bitrate = video_transcode::calc_video_bitrate_from_kbps(
            decoder.bit_rate() as i64,
            params.bitrate,
            2_000_000,
            100_000,
        );
        encoder.set_bit_rate(target_bitrate);
        encoder.set_max_bit_rate(target_bitrate);
        encoder.set_tolerance((target_bitrate / 2).max(1));

        let mut opts = ffmpeg::Dictionary::new();
        let g_value = params.keyframe_interval.unwrap_or(250).to_string();
        opts.set("g", g_value.as_str());
        // Enforce explicit bitrate control to avoid encoder drifting to visually lossless output.
        // Use ceil division to ensure maxrate is never lower than encoder bit_rate.
        let target_kbps = ((target_bitrate + 999) / 1000).max(1);
        let maxrate_kbps = target_kbps;
        let bufsize_kbps = (target_kbps * 2).max(1);
        let target_kbps_s = format!("{}k", target_kbps);
        let maxrate_kbps_s = format!("{}k", maxrate_kbps);
        let bufsize_kbps_s = format!("{}k", bufsize_kbps);
        let mut rc_detail = "none".to_string();
        let codec_name_for_opts = codec.name();
        let mut container_ts_safe_mode = false;
        let output_ext = Path::new(&params.output_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        let resolved_preset = if params.use_ultra_fast_speed.unwrap_or(false) {
            "ultrafast"
        } else {
            params.preset.as_deref().unwrap_or("medium")
        };
        if codec_name_for_opts == "libx264" {
            opts.set("preset", resolved_preset);
            opts.set("bitrate", target_kbps.to_string().as_str());
            let mut x264_params_parts = vec![
                format!("vbv-maxrate={}", maxrate_kbps),
                format!("vbv-bufsize={}", bufsize_kbps),
                format!("keyint={}", params.keyframe_interval.unwrap_or(250)),
            ];
            if matches!(output_ext.as_str(), "avi" | "wmv" | "asf" | "3gp" | "3g2") {
                x264_params_parts.push("bframes=0".to_string());
                x264_params_parts.push("force-cfr=1".to_string());
                opts.set("bf", "0");
                container_ts_safe_mode = true;
            }
            let x264_params = x264_params_parts.join(":");
            opts.set("x264-params", x264_params.as_str());
            rc_detail = x264_params;
        } else if codec_name_for_opts == "libx265" {
            opts.set("preset", resolved_preset);
            opts.set("bitrate", target_kbps.to_string().as_str());
            let x265_params = format!(
                "vbv-maxrate={}:vbv-bufsize={}:keyint={}",
                maxrate_kbps,
                bufsize_kbps,
                params.keyframe_interval.unwrap_or(250)
            );
            opts.set("x265-params", x265_params.as_str());
            rc_detail = x265_params;
        } else {
            log::info!(
                "compress_video video rc opts skipped for codec={}: x264/x265 private rc params not applied",
                codec_name_for_opts
            );
        }

        let encoder = encoder
            .open_with(opts)
            .map_err(|e| format!("无法打开视频编码器: {}", e))?;

        log::info!(
            "compress_video video init: codec={} hw={} src={}x{} src_pix_fmt={:?} src_bitrate={} dst={}x{} dst_pix_fmt={:?} target_bitrate={} frame_rate={:?} gop={} bitrate={} maxrate={} bufsize={} rc_detail={} ts_safe_mode={} output_ext={}",
            selected_codec_name,
            effective_hw,
            decoder.width(),
            decoder.height(),
            decoder.format(),
            decoder.bit_rate(),
            target_w,
            target_h,
            target_pixel_format,
            target_bitrate,
            target_frame_rate,
            params.keyframe_interval.unwrap_or(250),
            target_kbps_s,
            maxrate_kbps_s,
            bufsize_kbps_s,
            rc_detail,
            container_ts_safe_mode,
            output_ext
        );

        video_ost.set_parameters(&encoder);
        let encoder_time_base_after = encoder.time_base();
        let final_encoder_time_base = if encoder_time_base_after.numerator() > 0 {
            video_ost.set_time_base(encoder_time_base_after);
            encoder_time_base_after
        } else {
            video_ost.set_time_base(encoder_time_base);
            encoder_time_base
        };
        let frame_step_ost = unsafe {
            ffmpeg::ffi::av_rescale_q(
                1,
                final_encoder_time_base.into(),
                video_ost.time_base().into(),
            )
        }
        .max(1);
        log::info!(
            "compress_video video ts basis: enc_tb={}/{} ost_tb={}/{} frame_step_ost={}",
            final_encoder_time_base.numerator(),
            final_encoder_time_base.denominator(),
            video_ost.time_base().numerator(),
            video_ost.time_base().denominator(),
            frame_step_ost
        );

        let needs_scaler = decoder.format() != target_pixel_format
            || decoder.width() != target_w
            || decoder.height() != target_h;
        let scaler = if needs_scaler {
            Some(
                software::scaling::Context::get(
                    decoder.format(),
                    decoder.width(),
                    decoder.height(),
                    target_pixel_format,
                    target_w,
                    target_h,
                    software::scaling::flag::Flags::BILINEAR,
                )
                .map_err(|e| format!("无法创建视频缩放器: {}", e))?,
            )
        } else {
            log::debug!(
                "compress_video scaler bypassed: src fmt={:?} {}x{} matches dst fmt={:?} {}x{}",
                decoder.format(),
                decoder.width(),
                decoder.height(),
                target_pixel_format,
                target_w,
                target_h
            );
            None
        };

        Ok(Self {
            encoder,
            decoder,
            scaler,
            ost_index: video_ost.index(),
            ost_time_base: video_ost.time_base(),
            final_encoder_time_base,
            stream_time_base: video_stream.time_base(),
            fps,
            frame_count: 0,
            last_progress_emitted: -1.0,
            duration,
            last_emit_at: Instant::now(),
            emitter,
            written_bytes: 0,
            target_bitrate,
            encoded_packets: 0,
            next_pts: 0,
            last_pts: -1,
            last_mux_dts_ost: -1,
            next_mux_ts_ost: 0,
            frame_step_ost,
        })
    }

    fn force_monotonic_ts_in_ost_tb(&mut self, encoded: &mut packet::Packet) {
        video_transcode::force_monotonic_ts_in_ost_tb(
            encoded,
            &mut self.last_mux_dts_ost,
            &mut self.next_mux_ts_ost,
            self.frame_step_ost,
            4,
        );
    }

    fn sync_ost_time_base_from_muxer(&mut self, octx: &format::context::Output) {
        let Some(stream) = octx.stream(self.ost_index) else {
            return;
        };
        let new_tb = stream.time_base();
        if new_tb.denominator() <= 0 || new_tb == self.ost_time_base {
            return;
        }

        let old_tb = self.ost_time_base;
        self.ost_time_base = new_tb;
        self.frame_step_ost = unsafe {
            ffmpeg::ffi::av_rescale_q(1, self.final_encoder_time_base.into(), new_tb.into())
        }
        .max(1);
        self.last_mux_dts_ost = -1;
        self.next_mux_ts_ost = 0;

        log::info!(
            "compress_video video ost_time_base synced after header: old={}/{} new={}/{} frame_step_ost={}",
            old_tb.numerator(),
            old_tb.denominator(),
            new_tb.numerator(),
            new_tb.denominator(),
            self.frame_step_ost
        );
    }

    fn process_packet(
        &mut self,
        packet: &packet::Packet,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        self.decoder
            .send_packet(packet)
            .map_err(|e| format!("发送视频数据包失败: {}", e))?;

        let mut decoded = frame::Video::empty();
        while self.decoder.receive_frame(&mut decoded).is_ok() {
            if crate::task::cancel::is_cancelled() {
                return Err("Task cancelled".to_string());
            }
            let progress_pts = decoded.pts();
            let encoded_pts = Self::rescale_pts(
                decoded.pts(),
                self.stream_time_base,
                self.final_encoder_time_base,
            );
            let mut final_pts = encoded_pts.unwrap_or(self.next_pts);
            if final_pts <= self.last_pts {
                final_pts = self.last_pts + 1;
            }
            self.last_pts = final_pts;
            self.next_pts = final_pts + 1;
            let mut scaled = frame::Video::empty();
            let frame_to_encode: &mut frame::Video = if let Some(scaler) = self.scaler.as_mut() {
                scaler
                    .run(&decoded, &mut scaled)
                    .map_err(|e| format!("视频缩放失败: {}", e))?;
                scaled.set_pts(Some(final_pts));
                &mut scaled
            } else {
                decoded.set_pts(Some(final_pts));
                &mut decoded
            };

            self.encoder
                .send_frame(frame_to_encode)
                .map_err(|e| format!("发送视频帧失败: {}", e))?;

            self.receive_and_write_packets(octx)?;

            self.frame_count += 1;

            self.emit_progress(progress_pts);
        }
        Ok(())
    }

    fn emit_progress(&mut self, pts: Option<i64>) {
        if self.frame_count % 30 == 0 || self.last_emit_at.elapsed().as_secs_f64() >= 1.0 {
            if crate::task::cancel::is_cancelled() {
                return;
            }
            let progress = if self.duration > 0.0 {
                let current_time = if let Some(pts_value) = pts {
                    let (num, den) = if self.stream_time_base.denominator() > 0 {
                        (
                            self.stream_time_base.numerator(),
                            self.stream_time_base.denominator(),
                        )
                    } else {
                        (self.decoder.time_base().0, self.decoder.time_base().1)
                    };
                    if den > 0 {
                        pts_value as f64 * num as f64 / den as f64
                    } else {
                        (self.frame_count as f64) / self.fps.max(1.0)
                    }
                } else {
                    (self.frame_count as f64) / self.fps.max(1.0)
                };
                ((current_time / self.duration) * 100.0).min(100.0)
            } else {
                0.0
            };
            if (progress - self.last_progress_emitted).abs() >= 1.0 {
                self.emitter.emit("progress", Some(progress), None, None);
                self.last_progress_emitted = progress;
                self.last_emit_at = Instant::now();
            }
        }
    }

    fn receive_and_write_packets(
        &mut self,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            self.encoded_packets = self.encoded_packets.saturating_add(1);
            let packet_size = encoded.size() as u64;
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.final_encoder_time_base, self.ost_time_base);
            self.force_monotonic_ts_in_ost_tb(&mut encoded);
            if encoded.duration() <= 0 {
                encoded.set_duration(self.frame_step_ost.max(1));
            }
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("写入视频数据包失败: {}", e))?;
            self.written_bytes = self.written_bytes.saturating_add(packet_size);
            if self.encoded_packets <= 3 || self.encoded_packets % 120 == 0 {
                log::info!(
                    "compress_video video packet: idx={} size={} pts={:?} dts={:?} duration={} key={} total_video_bytes={}",
                    self.encoded_packets,
                    packet_size,
                    encoded.pts(),
                    encoded.dts(),
                    encoded.duration(),
                    encoded.is_key(),
                    self.written_bytes
                );
            }
        }
        Ok(())
    }

    fn finish(&mut self, octx: &mut format::context::Output) -> Result<(), String> {
        self.encoder
            .send_eof()
            .map_err(|e| format!("发送视频 EOF 失败: {}", e))?;
        self.receive_and_write_packets(octx)?;
        log::info!(
            "compress_video video summary: frames={} packets={} bytes={} avg_packet_bytes={}",
            self.frame_count,
            self.encoded_packets,
            self.written_bytes,
            if self.encoded_packets > 0 {
                self.written_bytes / self.encoded_packets
            } else {
                0
            }
        );
        Ok(())
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
            codec_name,
            codec_long_name: None,
            time_base: Some(format!(
                "{}/{}",
                self.final_encoder_time_base.numerator(),
                self.final_encoder_time_base.denominator()
            )),
            pix_fmt: self
                .encoder
                .format()
                .descriptor()
                .map(|desc| desc.name().to_string())
                .or_else(|| Some(format!("{:?}", self.encoder.format()))),
            width: Some(self.encoder.width()),
            height: Some(self.encoder.height()),
            frame_rate: Some(format!("{:.2}", self.fps.max(1.0))),
            channels: None,
            sample_rate: None,
            bit_rate: Some(self.target_bitrate as i64),
            bit_depth: None,
            bits_per_sample: None,
        }
    }
}

struct AudioProcessor {
    encoder: encoder::Audio,
    decoder: codec::decoder::Audio,
    resampler: software::resampling::Context,
    fifo: media_common::AudioFifo,
    ost_index: usize,
    ost_time_base: Rational,
    encoder_time_base: Rational,
    next_pts: i64,
    frame_size: usize,
    target_layout: ffmpeg::ChannelLayout,
    target_format: format::Sample,
    target_rate: u32,
    src_layout: ffmpeg::ChannelLayout,
    src_format: format::Sample,
    src_rate: u32,
    stream_index: usize,
    written_bytes: u64,
    target_bitrate: usize,
    encoded_packets: u64,
    decoded_frames: u64,
    last_mux_dts_ost: i64,
    next_mux_ts_ost: i64,
    frame_step_ost: i64,
}

impl AudioProcessor {
    fn normalize_layout(layout: ffmpeg::ChannelLayout, channels_hint: i32) -> ffmpeg::ChannelLayout {
        if !layout.is_empty() {
            return layout;
        }
        ffmpeg::ChannelLayout::default(channels_hint.max(1))
    }

    fn new(
        audio_stream: &format::stream::Stream,
        octx: &mut format::context::Output,
        selected_track: Option<&AudioTrackConfig>,
        output_ext: &str,
    ) -> Result<Self, String> {
        let stream_index = audio_stream.index();
        let codec_id = audio_stream.parameters().id();
        let audio_encoding = selected_track.map(|track| &track.encoding);
        let codec = video_transcode::pick_audio_encoder_for_compress(
            audio_encoding.and_then(|enc| enc.codec.as_deref()),
            codec_id,
            output_ext,
        )
            .ok_or_else(|| format!("未找到音频编码器: {:?}", codec_id))?;

        let global_header = octx
            .format()
            .flags()
            .contains(format::flag::Flags::GLOBAL_HEADER);

        let mut audio_ost_stream = octx
            .add_stream(codec)
            .map_err(|e| format!("无法添加音频输出流: {}", e))?;

        let decoder_ctx = codec::context::Context::from_parameters(audio_stream.parameters())
            .map_err(|e| format!("无法创建音频解码器上下文: {}", e))?;
        let decoder = decoder_ctx
            .decoder()
            .audio()
            .map_err(|e| format!("无法创建音频解码器: {}", e))?;

        let audio_caps = codec
            .audio()
            .map_err(|_| "音频编码器不支持音频".to_string())?;
        let supported_formats = audio_caps
            .formats()
            .map(|i| i.collect::<Vec<_>>())
            .unwrap_or_default();
        let preferred_sample = media_common::preferred_sample_from_bit_depth(
            audio_encoding.and_then(|enc| enc.bit_depth),
            None,
        );
        let target_format = Self::pick_best_format(&supported_formats, preferred_sample)?;

        let supported_rates = audio_caps
            .rates()
            .map(|i| i.collect::<Vec<_>>())
            .unwrap_or_default();
        let target_rate = Self::pick_best_rate(
            &supported_rates,
            audio_encoding
                .and_then(|enc| enc.sample_rate)
                .map(|rate| rate as i32)
                .unwrap_or(decoder.rate() as i32),
        ) as u32;

        let supported_layouts = audio_caps
            .channel_layouts()
            .map(|i| i.collect::<Vec<_>>())
            .unwrap_or_default();
        let decoded_layout =
            Self::normalize_layout(decoder.channel_layout(), decoder.channels() as i32);
        let desired_layout = audio_encoding
            .and_then(|enc| enc.channels)
            .and_then(media_common::channel_layout_from_count)
            .unwrap_or(decoded_layout);
        let mut target_layout = Self::pick_best_layout(&supported_layouts, desired_layout)?;
        target_layout = Self::normalize_layout(target_layout, decoded_layout.channels() as i32);
        let selected_codec_name = codec.name().to_string();
        if matches!(
            selected_codec_name.as_str(),
            "aac" | "libfdk_aac" | "aac_at"
        ) && target_layout.channels() > 2
        {
            let stereo = ffmpeg::ChannelLayout::STEREO;
            log::warn!(
                "compress_video audio layout force-downgraded for aac header compatibility: {:?}({}ch) -> {:?}({}ch)",
                target_layout,
                target_layout.channels(),
                stereo,
                stereo.channels()
            );
            target_layout = stereo;
        }

        let mut encoder_ctx = codec::context::Context::new_with_codec(codec);
        if global_header {
            encoder_ctx.set_flags(codec::flag::Flags::GLOBAL_HEADER);
        }
        let mut encoder = encoder_ctx
            .encoder()
            .audio()
            .map_err(|e| format!("无法创建音频编码器: {}", e))?;

        encoder.set_rate(target_rate as i32);
        encoder.set_channel_layout(target_layout);
        encoder.set_format(target_format);

        let mut target_bitrate = media_common::audio_transcode::calc_audio_bitrate_from_kbps(
            decoder.bit_rate() as i64,
            audio_encoding.and_then(|enc| enc.bitrate),
            128_000,
            32_000,
        );
        let target_channels = target_layout.channels();
        if matches!(
            selected_codec_name.as_str(),
            "aac" | "libfdk_aac" | "aac_at"
        ) && target_channels > 2
        {
            let min_multichannel_aac_bitrate = 192_000usize;
            if target_bitrate < min_multichannel_aac_bitrate {
                log::warn!(
                    "compress_video audio bitrate raised for multichannel aac: {} -> {} (channels={})",
                    target_bitrate,
                    min_multichannel_aac_bitrate,
                    target_channels
                );
                target_bitrate = min_multichannel_aac_bitrate;
            }
        }
        if selected_codec_name == "ac3" {
            let min_ac3_bitrate = if target_channels > 2 {
                384_000usize
            } else {
                128_000usize
            };
            if target_bitrate < min_ac3_bitrate {
                log::warn!(
                    "compress_video audio bitrate raised for ac3 compatibility: {} -> {} (channels={})",
                    target_bitrate,
                    min_ac3_bitrate,
                    target_channels
                );
                target_bitrate = min_ac3_bitrate;
            }
        }
        encoder.set_bit_rate(target_bitrate);

        let initial_time_base = Rational(1, target_rate as i32);
        encoder.set_time_base(initial_time_base);

        let mut opts = ffmpeg::Dictionary::new();
        if let Some(q) = audio_encoding.and_then(|enc| enc.quality) {
            opts.set("q:a", q.to_string().as_str());
        }
        let encoder = encoder
            .open_with(opts)
            .map_err(|e| format!("无法打开音频编码器: {}", e))?;
        let final_layout = if encoder.channel_layout().is_empty() {
            target_layout
        } else {
            encoder.channel_layout()
        };
        let final_channels = final_layout.channels();

        log::info!(
            "compress_video audio init: codec={} src_rate={} src_channels={} src_format={:?} src_bitrate={} dst_rate={} dst_channels={} dst_layout={:?} dst_format={:?} target_bitrate={}",
            selected_codec_name,
            decoder.rate(),
            decoder.channel_layout().channels(),
            decoder.format(),
            decoder.bit_rate(),
            target_rate,
            final_channels,
            final_layout,
            target_format,
            target_bitrate
        );

        audio_ost_stream.set_parameters(&encoder);

        let encoder_time_base_after = encoder.time_base();
        let final_encoder_time_base = if encoder_time_base_after.numerator() > 0 {
            audio_ost_stream.set_time_base(encoder_time_base_after);
            encoder_time_base_after
        } else {
            audio_ost_stream.set_time_base(initial_time_base);
            initial_time_base
        };

        let frame_size = if encoder.frame_size() == 0 {
            1024
        } else {
            encoder.frame_size() as usize
        };
        let ost_time_base = audio_ost_stream.time_base();
        let ost_index = audio_ost_stream.index();
        let frame_step_ost = unsafe {
            ffmpeg::ffi::av_rescale_q(
                frame_size as i64,
                final_encoder_time_base.into(),
                ost_time_base.into(),
            )
        }
        .max(1);

        let resampler = software::resampling::Context::get(
            decoder.format(),
            decoded_layout,
            decoder.rate(),
            target_format,
            target_layout,
            target_rate,
        )
        .map_err(|e| format!("无法创建重采样器: {}", e))?;

        log::info!(
            "compress_video audio encoder runtime: frame_size={} encoder_time_base={}/{}",
            frame_size,
            encoder.time_base().numerator(),
            encoder.time_base().denominator()
        );
        let fifo = media_common::AudioFifo::new(target_format, target_layout, target_rate);
        let initial_src_layout = decoded_layout;
        let initial_src_format = decoder.format();
        let initial_src_rate = decoder.rate();

        Ok(Self {
            encoder,
            decoder,
            resampler,
            fifo,
            ost_index,
            ost_time_base,
            encoder_time_base: final_encoder_time_base,
            next_pts: 0,
            frame_size,
            target_layout,
            target_format,
            target_rate,
            src_layout: initial_src_layout,
            src_format: initial_src_format,
            src_rate: initial_src_rate,
            stream_index,
            written_bytes: 0,
            target_bitrate,
            encoded_packets: 0,
            decoded_frames: 0,
            last_mux_dts_ost: -1,
            next_mux_ts_ost: 0,
            frame_step_ost,
        })
    }

    fn pick_best_format(
        supported: &[format::Sample],
        current: format::Sample,
    ) -> Result<format::Sample, String> {
        if supported.contains(&current) {
            return Ok(current);
        }
        supported
            .iter()
            .find(|&&fmt| fmt == format::Sample::F32(format::sample::Type::Planar))
            .or_else(|| {
                supported
                    .iter()
                    .find(|&&fmt| fmt == format::Sample::F32(format::sample::Type::Packed))
            })
            .or_else(|| {
                supported
                    .iter()
                    .find(|&&fmt| fmt == format::Sample::I16(format::sample::Type::Planar))
            })
            .or_else(|| {
                supported
                    .iter()
                    .find(|&&fmt| fmt == format::Sample::I16(format::sample::Type::Packed))
            })
            .or_else(|| supported.first())
            .cloned()
            .ok_or_else(|| "编码器没有支持的采样格式".to_string())
    }

    fn pick_best_rate(supported: &[i32], current: i32) -> i32 {
        if supported.is_empty() || supported.contains(&current) {
            return current;
        }
        *supported
            .iter()
            .min_by_key(|&&rate| (rate - current).abs())
            .unwrap_or(&current)
    }

    fn pick_best_layout(
        supported: &[ffmpeg::ChannelLayout],
        current: ffmpeg::ChannelLayout,
    ) -> Result<ffmpeg::ChannelLayout, String> {
        if supported.is_empty() || supported.contains(&current) {
            return Ok(current);
        }
        supported
            .iter()
            .find(|&&l| l.channels() == 2)
            .or_else(|| supported.first())
            .cloned()
            .ok_or_else(|| "编码器没有支持的声道布局".to_string())
    }

    fn process_packet(
        &mut self,
        packet: &packet::Packet,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        let mut p = packet.clone();
        p.rescale_ts(packet.time_base(), self.decoder.time_base());
        self.decoder
            .send_packet(&p)
            .map_err(|e| format!("发送音频包失败: {}", e))?;

        let mut decoded = frame::Audio::empty();
        while self.decoder.receive_frame(&mut decoded).is_ok() {
            self.decoded_frames = self.decoded_frames.saturating_add(1);
            let mut input_layout = if decoded.channel_layout().channels() > 0 {
                decoded.channel_layout()
            } else {
                self.src_layout
            };
            input_layout = Self::normalize_layout(input_layout, decoded.channels() as i32);
            decoded.set_channel_layout(input_layout);
            let input_rate = if decoded.rate() > 0 {
                decoded.rate()
            } else {
                self.src_rate
            };
            self.ensure_resampler_for_input(decoded.format(), input_layout, input_rate)?;
            if self.decoded_frames <= 6 {
                log::info!(
                    "compress_video audio decoded frame: idx={} pts={:?} samples={} fmt={:?} rate={} channels={} layout={:?} layout_ch={} layout_empty={} packet_tb={:?}",
                    self.decoded_frames,
                    decoded.pts(),
                    decoded.samples(),
                    decoded.format(),
                    decoded.rate(),
                    decoded.channels(),
                    decoded.channel_layout(),
                    decoded.channel_layout().channels(),
                    decoded.channel_layout().is_empty(),
                    packet.time_base()
                );
            }

            let mut resampled = frame::Audio::empty();
            resampled.set_channel_layout(self.target_layout);
            self.resample_with_retry(&decoded, &mut resampled)?;

            self.fifo.push_frame(&resampled);
            self.encode_buffered(octx)?;
        }
        Ok(())
    }

    fn ensure_resampler_for_input(
        &mut self,
        input_format: format::Sample,
        input_layout: ffmpeg::ChannelLayout,
        input_rate: u32,
    ) -> Result<(), String> {
        if input_format == self.src_format
            && input_layout == self.src_layout
            && input_rate == self.src_rate
        {
            return Ok(());
        }

        let rebuilt = software::resampling::Context::get(
            input_format,
            input_layout,
            input_rate,
            self.target_format,
            self.target_layout,
            self.target_rate,
        )
        .map_err(|e| {
            format!(
                "重建重采样器失败: {} (in={:?}/{}/{} out={:?}/{}/{})",
                e,
                input_format,
                input_layout.channels(),
                input_rate,
                self.target_format,
                self.target_layout.channels(),
                self.target_rate
            )
        })?;

        log::warn!(
            "compress_video audio input changed, rebuild resampler: old(format={:?},layout={:?},layout_ch={},layout_empty={},rate={}) -> new(format={:?},layout={:?},layout_ch={},layout_empty={},rate={}) target(format={:?},layout={:?},layout_ch={},rate={})",
            self.src_format,
            self.src_layout,
            self.src_layout.channels(),
            self.src_layout.is_empty(),
            self.src_rate,
            input_format,
            input_layout,
            input_layout.channels(),
            input_layout.is_empty(),
            input_rate
            ,
            self.target_format,
            self.target_layout,
            self.target_layout.channels(),
            self.target_rate
        );

        self.resampler = rebuilt;
        self.src_format = input_format;
        self.src_layout = input_layout;
        self.src_rate = input_rate;
        Ok(())
    }

    fn resample_with_retry(
        &mut self,
        decoded: &frame::Audio,
        out: &mut frame::Audio,
    ) -> Result<(), String> {
        match self.resampler.run(decoded, out) {
            Ok(_) => Ok(()),
            Err(first_err) => {
                let msg = first_err.to_string();
                log::error!(
                    "compress_video audio resample first-fail: err={} frame_idx={} decoded(format={:?},rate={},samples={},pts={:?},channels={},layout={:?},layout_ch={},layout_empty={}) cached_src(format={:?},rate={},layout={:?},layout_ch={},layout_empty={}) decoder(format={:?},rate={},channels={},layout={:?},layout_ch={},layout_empty={}) target(format={:?},rate={},layout={:?},layout_ch={})",
                    msg,
                    self.decoded_frames,
                    decoded.format(),
                    decoded.rate(),
                    decoded.samples(),
                    decoded.pts(),
                    decoded.channels(),
                    decoded.channel_layout(),
                    decoded.channel_layout().channels(),
                    decoded.channel_layout().is_empty(),
                    self.src_format,
                    self.src_rate,
                    self.src_layout,
                    self.src_layout.channels(),
                    self.src_layout.is_empty(),
                    self.decoder.format(),
                    self.decoder.rate(),
                    self.decoder.channels(),
                    self.decoder.channel_layout(),
                    self.decoder.channel_layout().channels(),
                    self.decoder.channel_layout().is_empty(),
                    self.target_format,
                    self.target_rate,
                    self.target_layout,
                    self.target_layout.channels(),
                );
                if !msg.contains("Input changed") {
                    return Err(format!("重采样失败(first): {}", msg));
                }

                let retry_layout = if decoded.channel_layout().channels() > 0 {
                    decoded.channel_layout()
                } else if self.decoder.channel_layout().channels() > 0 {
                    self.decoder.channel_layout()
                } else {
                    self.src_layout
                };
                let retry_layout =
                    Self::normalize_layout(retry_layout, decoded.channels() as i32);
                let retry_rate = if decoded.rate() > 0 {
                    decoded.rate()
                } else if self.decoder.rate() > 0 {
                    self.decoder.rate()
                } else {
                    self.src_rate
                };

                log::warn!(
                    "compress_video audio resample retry-rebuild: frame_idx={} retry(format={:?},layout={:?},layout_ch={},layout_empty={},rate={})",
                    self.decoded_frames,
                    decoded.format(),
                    retry_layout,
                    retry_layout.channels(),
                    retry_layout.is_empty(),
                    retry_rate
                );
                self.ensure_resampler_for_input(decoded.format(), retry_layout, retry_rate)?;
                self.resampler
                    .run(decoded, out)
                    .map(|_| ())
                    .map_err(|e| {
                        log::error!(
                            "compress_video audio resample retry-fail: err={} frame_idx={} decoded(format={:?},rate={},samples={},pts={:?},channels={},layout={:?},layout_ch={},layout_empty={}) retry(format={:?},rate={},layout={:?},layout_ch={},layout_empty={}) cached_src(format={:?},rate={},layout={:?},layout_ch={},layout_empty={}) target(format={:?},rate={},layout={:?},layout_ch={})",
                            e,
                            self.decoded_frames,
                            decoded.format(),
                            decoded.rate(),
                            decoded.samples(),
                            decoded.pts(),
                            decoded.channels(),
                            decoded.channel_layout(),
                            decoded.channel_layout().channels(),
                            decoded.channel_layout().is_empty(),
                            decoded.format(),
                            retry_rate,
                            retry_layout,
                            retry_layout.channels(),
                            retry_layout.is_empty(),
                            self.src_format,
                            self.src_rate,
                            self.src_layout,
                            self.src_layout.channels(),
                            self.src_layout.is_empty(),
                            self.target_format,
                            self.target_rate,
                            self.target_layout,
                            self.target_layout.channels(),
                        );
                        format!("重采样失败(retry): {}", e)
                    })
            }
        }
    }

    fn sync_ost_time_base_from_muxer(&mut self, octx: &format::context::Output) {
        let Some(stream) = octx.stream(self.ost_index) else {
            return;
        };
        let new_tb = stream.time_base();
        if new_tb.denominator() <= 0 || new_tb == self.ost_time_base {
            return;
        }
        let old_tb = self.ost_time_base;
        self.ost_time_base = new_tb;
        self.frame_step_ost = unsafe {
            ffmpeg::ffi::av_rescale_q(
                self.frame_size as i64,
                self.encoder_time_base.into(),
                new_tb.into(),
            )
        }
        .max(1);
        self.last_mux_dts_ost = -1;
        self.next_mux_ts_ost = 0;
        log::info!(
            "compress_video audio ost_time_base synced after header: old={}/{} new={}/{} frame_step_ost={}",
            old_tb.numerator(),
            old_tb.denominator(),
            new_tb.numerator(),
            new_tb.denominator(),
            self.frame_step_ost
        );
    }

    fn force_monotonic_ts_in_ost_tb(&mut self, encoded: &mut packet::Packet) {
        video_transcode::force_monotonic_ts_in_ost_tb(
            encoded,
            &mut self.last_mux_dts_ost,
            &mut self.next_mux_ts_ost,
            self.frame_step_ost,
            8,
        );
    }

    fn encode_buffered(&mut self, octx: &mut format::context::Output) -> Result<(), String> {
        while self.fifo.has_samples(self.frame_size) {
            self.encode_chunk(self.frame_size, octx)?;
        }
        Ok(())
    }

    fn encode_chunk(
        &mut self,
        frame_samples: usize,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        let mut frame = frame::Audio::new(self.target_format, frame_samples, self.target_layout);
        frame.set_rate(self.target_rate);
        frame.set_pts(Some(self.next_pts));
        self.next_pts += frame_samples as i64;

        if !self.fifo.pop_into_frame(&mut frame, frame_samples) {
            return Ok(());
        }

        self.encoder
            .send_frame(&frame)
            .map_err(|e| format!("发送音频帧失败: {}", e))?;
        self.receive_and_write_packets(octx)?;
        Ok(())
    }

    fn receive_and_write_packets(
        &mut self,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            self.encoded_packets = self.encoded_packets.saturating_add(1);
            let packet_size = encoded.size() as u64;
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.encoder_time_base, self.ost_time_base);

            if encoded.duration() <= 0 {
                encoded.set_duration(self.frame_step_ost.max(1));
            }
            self.force_monotonic_ts_in_ost_tb(&mut encoded);

            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("写入音频数据包失败: {}", e))?;
            self.written_bytes = self.written_bytes.saturating_add(packet_size);
            if self.encoded_packets <= 3 || self.encoded_packets % 200 == 0 {
                log::info!(
                    "compress_video audio packet: idx={} size={} pts={:?} dts={:?} duration={} total_audio_bytes={}",
                    self.encoded_packets,
                    packet_size,
                    encoded.pts(),
                    encoded.dts(),
                    encoded.duration(),
                    self.written_bytes
                );
            }
        }
        Ok(())
    }

    fn finish(&mut self, octx: &mut format::context::Output) -> Result<(), String> {
        let remaining_samples = self.fifo.available_samples();
        if remaining_samples > 0 {
            self.encode_chunk(remaining_samples, octx)?;
        }

        self.encoder
            .send_eof()
            .map_err(|e| format!("音频 EOF 失败: {}", e))?;
        self.receive_and_write_packets(octx)?;
        log::info!(
            "compress_video audio summary: packets={} bytes={} avg_packet_bytes={} target_bitrate={}",
            self.encoded_packets,
            self.written_bytes,
            if self.encoded_packets > 0 {
                self.written_bytes / self.encoded_packets
            } else {
                0
            },
            self.target_bitrate
        );
        Ok(())
    }

    fn output_stream_details(&self) -> StreamDetails {
        let codec_name = self
            .encoder
            .codec()
            .map(|c| c.name().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        StreamDetails {
            index: self.ost_index,
            codec_type: "audio".to_string(),
            codec_name,
            codec_long_name: None,
            time_base: Some(format!(
                "{}/{}",
                self.encoder_time_base.numerator(),
                self.encoder_time_base.denominator()
            )),
            pix_fmt: None,
            width: None,
            height: None,
            frame_rate: None,
            channels: Some(self.target_layout.channels() as u16),
            sample_rate: Some(self.target_rate),
            bit_rate: Some(self.target_bitrate as i64),
            bit_depth: None,
            bits_per_sample: None,
        }
    }
}

/// Main entry point
pub fn compress_video_file<E: TaskEmitter + Clone>(
    emitter: E,
    params: VideoCompressionParams,
) -> Result<VideoCompressionReport, String> {
    let mut params = params;
    let (resolved, mut ictx, mut octx, input_analysis) =
        media_common::video_pipeline_core::run_pipeline(
            "compress_video",
            || {
                ffmpeg::init().map_err(|e| format!("FFmpeg init: {}", e))?;
                Ok(())
            },
            |_| {
                Ok(media_common::video_pipeline::resolve_video_params_for_compress(
                    media_common::video_pipeline::VideoCompressionResolveOptions {
                        input_path: params.input_path.clone(),
                        output_path: params.output_path.clone(),
                        remove_audio: params.remove_audio,
                        audio_tracks: params.audio_tracks.clone(),
                    },
                ))
            },
            |_, resolved| {
                let ictx = format::input(&resolved.input_path)
                    .map_err(|e| format!("IO Input Error: {}", e))?;
                let octx = format::output(&resolved.output_path)
                    .map_err(|e| format!("IO Output Error: {}", e))?;
                let input_analysis = media_common::video_pipeline::analyze_video_input(&ictx);
                Ok((ictx, octx, input_analysis))
            },
            |_| Ok(()),
            |_, resolved, init| {
                let (ictx, octx, input_analysis) = init;
                Ok((resolved, ictx, octx, input_analysis))
            },
        )?;
    params.output_path = resolved.output_path.clone();
    log::info!(
        "compress_video start: input={} output={} codec={:?} bitrate={:?} frame_rate={:?} preset={:?} gop={:?} use_hw={:?} use_ultra_fast={:?}",
        resolved.input_path,
        params.output_path,
        params.codec,
        params.bitrate,
        params.frame_rate,
        params.preset,
        params.keyframe_interval,
        params.use_hardware_acceleration,
        params.use_ultra_fast_speed
    );

    let output_ext = resolved.output_ext.clone();

    let duration = input_analysis.duration_seconds;
    log::info!("compress_video input media: duration={:.3}s", duration);

    let stream_selection =
        media_common::video_pipeline::resolve_compress_stream_selection(&ictx, &resolved)?;
    let video_stream_index = stream_selection.video_stream_index;
    let video_stream = ictx.stream(video_stream_index).ok_or("No Video Stream")?;
    let mut video_proc =
        VideoProcessor::new(&video_stream, &mut octx, &params, duration, emitter.clone())?;
    let video_idx = video_stream.index();

    let mut audio_proc = None;
    let selected_audio_track = resolved.selected_audio_track.as_ref();
    if resolved.keep_audio {
        if stream_selection.audio_selection_failed {
            log::warn!(
                "compress_video requested audio stream index {:?} not found or not audio, fallback to best stream failed",
                resolved.selected_audio_stream_index
            );
        }
        if let Some(audio_stream) = stream_selection
            .audio_stream_index
            .and_then(|index| ictx.stream(index))
        {
            audio_proc = Some(AudioProcessor::new(
                &audio_stream,
                &mut octx,
                selected_audio_track,
                output_ext.as_str(),
            )?);
        }
    }

    media_common::video_pipeline::write_header_and_sync_processors(
        &mut octx,
        "compress_video write_header",
        "Head Write Error",
        &mut video_proc,
        &mut audio_proc,
        |video, output| video.sync_ost_time_base_from_muxer(output),
        |audio, output| audio.sync_ost_time_base_from_muxer(output),
    )?;

    let mut process_ctx = CompressProcessStageContext {
        ictx: &mut ictx,
        octx: &mut octx,
        video_idx,
        video_proc: &mut video_proc,
        audio_proc: &mut audio_proc,
    };
    process_packets_stage(&mut process_ctx)?;

    let mut drain_ctx = CompressDrainStageContext {
        octx: &mut octx,
        video_proc: &mut video_proc,
        audio_proc: &mut audio_proc,
    };
    drain_processors_stage(&mut drain_ctx)?;

    octx.write_trailer()
        .map_err(|e| format!("Trailer Error: {}", e))?;
    let output_path = params.output_path.clone();
    media_common::video_pipeline::emit_complete_with_path(&emitter, &output_path);
    let summary = media_common::video_pipeline::build_compress_finalize_summary(
        duration,
        video_proc.written_bytes,
        video_proc.output_stream_details(),
        video_proc.target_bitrate,
        audio_proc.as_ref().map(|audio| audio.written_bytes),
        audio_proc.as_ref().map(|audio| audio.output_stream_details()),
        audio_proc.as_ref().map(|audio| audio.target_bitrate),
    );
    media_common::video_pipeline::log_video_pipeline_summary(
        "compress_video",
        &output_path,
        duration,
        summary.total_written_bytes,
        summary.estimated_avg_bitrate,
        Some(summary.target_total_bitrate),
        summary.estimated_target_size,
    );
    let output_media = media_common::video_pipeline::build_output_media(
        output_path,
        "video".to_string(),
        duration,
        summary.total_written_bytes,
        summary.streams,
    );
    Ok(VideoCompressionReport { output_media })
}
