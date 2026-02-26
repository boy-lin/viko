use crate::events::TaskEmitter;
use crate::media_common;
use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};
use ffmpeg::{codec, encoder, format, frame, media, packet, software, Rational};
use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;

/// 视频压缩参数（全部可选，使用默认值兜底）
#[derive(Deserialize, Clone)]
pub struct VideoCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub width: Option<u32>,             // 目标宽度
    pub height: Option<u32>,            // 目标高度
    pub bitrate: Option<u32>,           // 视频码率 kbps
    pub frame_rate: Option<f32>,        // 目标帧率
    pub codec: Option<String>,          // h264/h265/vp9/av1
    pub keyframe_interval: Option<u32>, // GOP 间隔
    pub color_depth: Option<u32>,       // 8/10/12 bit
    pub aspect_ratio: Option<String>,   // 16:9 等
    pub remove_audio: Option<bool>,     // 去除音轨
    pub audio_bitrate: Option<u32>,     // 音频码率 kbps
    pub preset: Option<String>,         // ultrafast/fast/medium/slow
    pub use_hardware_acceleration: Option<bool>, // 是否启用硬件编码（如可用）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoCompressionReport {
    pub output_media: MediaDetails,
}

fn calc_video_bitrate(decoder_bitrate: i64, params: &VideoCompressionParams) -> usize {
    let base = if let Some(br) = params.bitrate {
        (br as i64) * 1000
    } else if decoder_bitrate > 0 {
        decoder_bitrate
    } else {
        2_000_000
    };
    base.max(100_000) as usize
}

fn calc_audio_bitrate(decoder_bitrate: i64, params: &VideoCompressionParams) -> usize {
    let base = if let Some(br) = params.audio_bitrate {
        (br as i64) * 1000
    } else if decoder_bitrate > 0 {
        decoder_bitrate
    } else {
        128_000
    };
    base.max(32_000) as usize
}

fn is_hardware_video_encoder(codec_name: &str) -> bool {
    codec_name.contains("videotoolbox")
        || codec_name.contains("_nvenc")
        || codec_name.contains("_qsv")
        || codec_name.contains("_vaapi")
        || codec_name.contains("_amf")
}

fn pick_video_encoder_for_compress(
    requested: Option<&str>,
    use_hw: bool,
    fallback_id: codec::Id,
) -> Option<ffmpeg::Codec> {
    let req = requested.unwrap_or("h264").to_ascii_lowercase();

    if req == "h264" || req == "avc" {
        if let Some(codec) = encoder::find_by_name("libx264") {
            return Some(codec);
        }
    }
    if req == "h265" || req == "hevc" {
        if let Some(codec) = encoder::find_by_name("libx265") {
            return Some(codec);
        }
    }

    let codec = media_common::select_video_encoder(requested, use_hw)
        .or_else(|| encoder::find(fallback_id))
        .or_else(|| encoder::find_by_name(fallback_id.name()));

    if let Some(selected) = codec {
        let name = selected.name();
        if name.ends_with("_mf") {
            if (req == "h264" || req == "avc") && encoder::find_by_name("libx264").is_some() {
                return encoder::find_by_name("libx264");
            }
            if (req == "h265" || req == "hevc") && encoder::find_by_name("libx265").is_some() {
                return encoder::find_by_name("libx265");
            }
        }
        return Some(selected);
    }

    None
}

fn pick_audio_encoder_for_compress(fallback_id: codec::Id) -> Option<ffmpeg::Codec> {
    let mut candidates: Vec<&str> = Vec::new();
    match fallback_id.name() {
        "mp3" => candidates.extend(["libmp3lame", "libshine", "mp3"]),
        "aac" => candidates.extend(["aac", "libfdk_aac", "aac_at"]),
        _ => {}
    }
    candidates.push(fallback_id.name());

    for name in candidates {
        if let Some(codec) = encoder::find_by_name(name) {
            if !codec.name().ends_with("_mf") {
                return Some(codec);
            }
        }
    }

    encoder::find(fallback_id).or_else(|| encoder::find_by_name(fallback_id.name()))
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
}

impl<E: TaskEmitter> VideoProcessor<E> {
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
        let codec = pick_video_encoder_for_compress(
            params.codec.as_deref(),
            use_hw,
            video_stream.parameters().id(),
        )
            .ok_or_else(|| "未找到匹配的视频编码器".to_string())?;
        let selected_codec_name = codec.name().to_string();
        let effective_hw = use_hw && is_hardware_video_encoder(&selected_codec_name);
        if use_hw && !effective_hw {
            log::warn!(
                "compress_video requested hardware acceleration but selected software encoder: {}",
                selected_codec_name
            );
        }

        let mut video_ost = octx
            .add_stream(codec)
            .map_err(|e| format!("无法添加视频输出流: {}", e))?;

        let mut encoder = codec::context::Context::new_with_codec(codec)
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

        let target_bitrate = calc_video_bitrate(decoder.bit_rate() as i64, params);
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
        if codec_name_for_opts == "libx264" {
            opts.set("preset", params.preset.as_deref().unwrap_or("medium"));
            opts.set("bitrate", target_kbps.to_string().as_str());
            let x264_params = format!(
                "vbv-maxrate={}:vbv-bufsize={}:keyint={}",
                maxrate_kbps,
                bufsize_kbps,
                params.keyframe_interval.unwrap_or(250)
            );
            opts.set("x264-params", x264_params.as_str());
            rc_detail = x264_params;
        } else if codec_name_for_opts == "libx265" {
            opts.set("preset", params.preset.as_deref().unwrap_or("medium"));
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
            "compress_video video init: codec={} hw={} src={}x{} src_pix_fmt={:?} src_bitrate={} dst={}x{} dst_pix_fmt={:?} target_bitrate={} frame_rate={:?} gop={} bitrate={} maxrate={} bufsize={} rc_detail={}",
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
            rc_detail
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
        })
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
            let mut scaled = frame::Video::empty();
            let frame_to_encode: &mut frame::Video = if let Some(scaler) = self.scaler.as_mut() {
                scaler
                    .run(&decoded, &mut scaled)
                    .map_err(|e| format!("视频缩放失败: {}", e))?;
                scaled.set_pts(decoded.pts());
                &mut scaled
            } else {
                &mut decoded
            };

            self.encoder
                .send_frame(frame_to_encode)
                .map_err(|e| format!("发送视频帧失败: {}", e))?;

            self.receive_and_write_packets(octx)?;

            self.frame_count += 1;

            self.emit_progress(decoded.pts());
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
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.final_encoder_time_base, self.ost_time_base);
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("写入视频数据包失败: {}", e))?;
            self.written_bytes = self.written_bytes.saturating_add(encoded.size() as u64);
            if self.encoded_packets <= 3 || self.encoded_packets % 120 == 0 {
                log::info!(
                    "compress_video video packet: idx={} size={} pts={:?} dts={:?} duration={} key={} total_video_bytes={}",
                    self.encoded_packets,
                    encoded.size(),
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
    stream_index: usize,
    written_bytes: u64,
    target_bitrate: usize,
    encoded_packets: u64,
}

impl AudioProcessor {
    fn new(
        audio_stream: &format::stream::Stream,
        octx: &mut format::context::Output,
        params: &VideoCompressionParams,
    ) -> Result<Self, String> {
        let stream_index = audio_stream.index();
        let codec_id = audio_stream.parameters().id();
        let codec = pick_audio_encoder_for_compress(codec_id)
            .ok_or_else(|| format!("未找到音频编码器: {:?}", codec_id))?;

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
        let target_format = Self::pick_best_format(&supported_formats, decoder.format())?;

        let supported_rates = audio_caps
            .rates()
            .map(|i| i.collect::<Vec<_>>())
            .unwrap_or_default();
        let target_rate = Self::pick_best_rate(&supported_rates, decoder.rate() as i32) as u32;

        let supported_layouts = audio_caps
            .channel_layouts()
            .map(|i| i.collect::<Vec<_>>())
            .unwrap_or_default();
        let target_layout = Self::pick_best_layout(&supported_layouts, decoder.channel_layout())?;

        let mut encoder = codec::context::Context::new_with_codec(codec)
            .encoder()
            .audio()
            .map_err(|e| format!("无法创建音频编码器: {}", e))?;

        encoder.set_rate(target_rate as i32);
        encoder.set_channel_layout(target_layout);
        encoder.set_format(target_format);

        let target_bitrate = calc_audio_bitrate(decoder.bit_rate() as i64, params);
        encoder.set_bit_rate(target_bitrate);

        let initial_time_base = Rational(1, target_rate as i32);
        encoder.set_time_base(initial_time_base);

        let encoder = encoder
            .open_as(codec)
            .map_err(|e| format!("无法打开音频编码器: {}", e))?;

        let selected_codec_name = codec.name().to_string();
        log::info!(
            "compress_video audio init: codec={} src_rate={} src_channels={} src_format={:?} src_bitrate={} dst_rate={} dst_channels={} dst_format={:?} target_bitrate={}",
            selected_codec_name,
            decoder.rate(),
            decoder.channel_layout().channels(),
            decoder.format(),
            decoder.bit_rate(),
            target_rate,
            target_layout.channels(),
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

        let ost_time_base = audio_ost_stream.time_base();
        let ost_index = audio_ost_stream.index();

        let resampler = software::resampling::Context::get(
            decoder.format(),
            decoder.channel_layout(),
            decoder.rate(),
            target_format,
            target_layout,
            target_rate,
        )
        .map_err(|e| format!("无法创建重采样器: {}", e))?;

        let frame_size = if encoder.frame_size() == 0 {
            1024
        } else {
            encoder.frame_size() as usize
        };
        log::info!(
            "compress_video audio encoder runtime: frame_size={} encoder_time_base={}/{}",
            frame_size,
            encoder.time_base().numerator(),
            encoder.time_base().denominator()
        );
        let fifo = media_common::AudioFifo::new(target_format, target_layout, target_rate);

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
            stream_index,
            written_bytes: 0,
            target_bitrate,
            encoded_packets: 0,
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
            let mut resampled = frame::Audio::empty();
            resampled.set_channel_layout(self.target_layout);
            self.resampler
                .run(&decoded, &mut resampled)
                .map_err(|e| format!("重采样失败: {}", e))?;

            self.fifo.push_frame(&resampled);
            self.encode_buffered(octx)?;
        }
        Ok(())
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
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.encoder_time_base, self.ost_time_base);

            if encoded.duration() <= 0 {
                let duration = unsafe {
                    ffmpeg::ffi::av_rescale_q(
                        self.frame_size as i64,
                        self.encoder_time_base.into(),
                        self.ost_time_base.into(),
                    )
                };
                encoded.set_duration(duration);
            }

            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("写入音频数据包失败: {}", e))?;
            self.written_bytes = self.written_bytes.saturating_add(encoded.size() as u64);
            if self.encoded_packets <= 3 || self.encoded_packets % 200 == 0 {
                log::info!(
                    "compress_video audio packet: idx={} size={} pts={:?} dts={:?} duration={} total_audio_bytes={}",
                    self.encoded_packets,
                    encoded.size(),
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
        }
    }
}

/// Main entry point
pub fn compress_video_file<E: TaskEmitter + Clone>(
    emitter: E,
    params: VideoCompressionParams,
) -> Result<VideoCompressionReport, String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init: {}", e))?;
    let mut params = params;
    params.output_path = media_common::ensure_unique_output_path(&params.output_path);
    log::info!(
        "compress_video start: input={} output={} codec={:?} bitrate={:?} frame_rate={:?} preset={:?} gop={:?} use_hw={:?}",
        params.input_path,
        params.output_path,
        params.codec,
        params.bitrate,
        params.frame_rate,
        params.preset,
        params.keyframe_interval,
        params.use_hardware_acceleration
    );

    let mut ictx =
        format::input(&params.input_path).map_err(|e| format!("IO Input Error: {}", e))?;
    let mut octx =
        format::output(&params.output_path).map_err(|e| format!("IO Output Error: {}", e))?;

    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;
    let input_size = std::fs::metadata(&params.input_path)
        .map(|m| m.len())
        .unwrap_or(0);
    log::info!(
        "compress_video input media: input_size_bytes={} duration={:.3}s",
        input_size,
        duration
    );

    let video_stream = ictx
        .streams()
        .best(media::Type::Video)
        .ok_or("No Video Stream")?;
    let mut video_proc =
        VideoProcessor::new(&video_stream, &mut octx, &params, duration, emitter.clone())?;
    let video_idx = video_stream.index();

    let mut audio_proc = None;
    if !params.remove_audio.unwrap_or(false) {
        if let Some(audio_stream) = ictx.streams().best(media::Type::Audio) {
            audio_proc = Some(AudioProcessor::new(&audio_stream, &mut octx, &params)?);
        }
    }

    octx.write_header()
        .map_err(|e| format!("Head Write Error: {}", e))?;

    for (stream, packet) in ictx.packets() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }
        if stream.index() == video_idx {
            video_proc.process_packet(&packet, &mut octx)?;
        } else if let Some(audio) = audio_proc.as_mut() {
            if stream.index() == audio.stream_index {
                audio.process_packet(&packet, &mut octx)?;
            }
        }
    }

    video_proc.finish(&mut octx)?;
    if let Some(audio) = audio_proc.as_mut() {
        audio.finish(&mut octx)?;
    }

    octx.write_trailer()
        .map_err(|e| format!("Trailer Error: {}", e))?;
    let output_path = params.output_path.clone();
    emitter.emit("complete", Some(100.0), Some(output_path.clone()), None);
    let mut total_written_bytes = video_proc.written_bytes;
    let mut streams = vec![video_proc.output_stream_details()];
    if let Some(audio) = audio_proc.as_ref() {
        total_written_bytes = total_written_bytes.saturating_add(audio.written_bytes);
        streams.push(audio.output_stream_details());
    }
    streams.sort_by_key(|s| s.index);
    let estimated_avg_bitrate = if duration > 0.0 {
        Some(((total_written_bytes as f64 * 8.0) / duration) as i64)
    } else {
        None
    };
    let actual_output_size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
    let actual_avg_bitrate = if duration > 0.0 {
        Some(((actual_output_size as f64 * 8.0) / duration) as i64)
    } else {
        None
    };
    let target_total_bitrate = video_proc.target_bitrate
        + audio_proc
            .as_ref()
            .map(|audio| audio.target_bitrate)
            .unwrap_or(0);
    let estimated_target_size = if duration > 0.0 {
        Some(((target_total_bitrate as f64 * duration) / 8.0) as u64)
    } else {
        None
    };
    log::info!(
        "compress_video done: output={} duration={:.3}s input_size_bytes={} written_bytes={} actual_output_size_bytes={} estimated_avg_bitrate_bps={:?} actual_avg_bitrate_bps={:?} target_total_bitrate_bps={} estimated_target_size_bytes={:?}",
        output_path,
        duration,
        input_size,
        total_written_bytes,
        actual_output_size,
        estimated_avg_bitrate,
        actual_avg_bitrate,
        target_total_bitrate,
        estimated_target_size
    );
    let output_media = MediaDetails {
        path: output_path.clone(),
        extension: std::path::Path::new(&output_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default(),
        format_names: "video".to_string(),
        format_long_name: None,
        duration,
        size: actual_output_size,
        streams,
        tags: HashMap::new(),
        stream_tags: Vec::new(),
    };
    Ok(VideoCompressionReport { output_media })
}
