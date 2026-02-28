use crate::media_common::{self, AudioFifo};
use ffmpeg::{codec, decoder, encoder, format, frame, packet, software, Rational};
use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Shared audio encoding params used by both video/audio convert pipelines.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AudioEncodingParams {
    pub codec: Option<String>,    // libmp3lame, aac, flac, pcm etc.
    pub bitrate: Option<f32>,     // kbps
    pub sample_rate: Option<u32>, // Hz
    pub channels: Option<u32>,    // channel count
    pub bit_depth: Option<u32>,   // 16/24/32
    pub quality: Option<u32>,     // VBR quality 0-10
}

pub struct AudioTrackProcessor {
    pub source_stream_index: usize,
    decoder: decoder::Audio,
    encoder: encoder::Audio,
    resampler: software::resampling::Context,
    fifo: Option<AudioFifo>,
    frame_size: usize,
    target_layout: ffmpeg::ChannelLayout,
    target_format: format::Sample,
    target_rate: u32,
    pub ost_index: usize,
    encoder_time_base: Rational,
    next_pts: i64,
    start_time: i64,
    first_pts_set: bool,
    written_bytes: u64,
    configured_bit_rate: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioOutputSummary {
    pub ost_index: usize,
    pub codec_name: String,
    pub time_base: Option<String>,
    pub channels: Option<u16>,
    pub sample_rate: Option<u32>,
    pub bit_rate: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct AudioTranscodeTrack {
    pub source_stream_index: usize,
    pub encoding: AudioEncodingParams,
}

pub fn build_transcode_track(
    source_stream_index: usize,
    encoding: AudioEncodingParams,
) -> AudioTranscodeTrack {
    AudioTranscodeTrack {
        source_stream_index,
        encoding,
    }
}

#[derive(Debug, Clone)]
pub struct AudioTranscodeRunReport {
    pub packets_processed: u64,
    pub total_written_bytes: u64,
    pub summaries: Vec<AudioOutputSummary>,
}

fn can_stream_copy_track(track: &AudioTranscodeTrack, ist: &format::stream::Stream) -> bool {
    if track.encoding.bitrate.is_some()
        || track.encoding.sample_rate.is_some()
        || track.encoding.channels.is_some()
        || track.encoding.bit_depth.is_some()
        || track.encoding.quality.is_some()
    {
        return false;
    }

    let requested_codec = match track.encoding.codec.as_deref() {
        Some(c) => c,
        None => return false,
    };
    let input_codec = ist.parameters().id().name();
    requested_codec.eq_ignore_ascii_case(input_codec)
}

fn codec_family_candidates(name: &str) -> Option<&'static [&'static str]> {
    match name.to_ascii_lowercase().as_str() {
        "mp3" | "libmp3lame" | "libshine" | "mp3_mf" => {
            Some(&["libmp3lame", "libshine", "mp3_mf", "mp3"])
        }
        "aac" | "libfdk_aac" | "aac_at" => Some(&["aac", "libfdk_aac", "aac_at"]),
        "opus" | "libopus" => Some(&["libopus", "opus"]),
        "vorbis" | "libvorbis" => Some(&["libvorbis", "vorbis"]),
        _ => None,
    }
}

fn pick_audio_encoder(
    requested_codec_name: Option<&str>,
    fallback_id: codec::Id,
) -> Option<ffmpeg::Codec> {
    if let Some(name) = requested_codec_name {
        if let Some(codec) = encoder::find_by_name(name) {
            return Some(codec);
        }

        if let Some(candidates) = codec_family_candidates(name) {
            for candidate in candidates {
                if let Some(codec) = encoder::find_by_name(candidate) {
                    return Some(codec);
                }
            }
        }

        // Caller explicitly requested an encoder (or encoder family) but none exists.
        // Do not silently fall back to input codec family (e.g. AAC) and create container mismatch.
        return None;
    }

    let fallback_name = fallback_id.name();
    if let Some(candidates) = codec_family_candidates(fallback_name) {
        for candidate in candidates {
            if let Some(codec) = encoder::find_by_name(candidate) {
                return Some(codec);
            }
        }
    }

    if let Some(codec) = encoder::find_by_name(fallback_name) {
        return Some(codec);
    }

    encoder::find(fallback_id).or_else(|| encoder::find_by_name(fallback_name))
}

impl AudioTrackProcessor {
    fn is_input_changed_error(err: &ffmpeg::Error) -> bool {
        err.to_string().contains("Input changed")
    }

    fn rebuild_resampler_from_decoded(&mut self, decoded: &frame::Audio) -> Result<(), String> {
        let mut input_layout = decoded.channel_layout();
        if input_layout.is_empty() {
            input_layout = ffmpeg::ChannelLayout::default(decoded.channels() as i32);
        }
        let input_rate = if decoded.rate() > 0 {
            decoded.rate()
        } else {
            self.decoder.rate()
        };

        self.resampler = software::resampling::Context::get(
            decoded.format(),
            input_layout,
            input_rate,
            self.target_format,
            self.target_layout,
            self.target_rate,
        )
        .map_err(|e| format!("Operation failed: {}", e))?;

        Ok(())
    }

    fn normalize_decoded_frame(&self, decoded: &mut frame::Audio) {
        if decoded.channel_layout().is_empty() && decoded.channels() > 0 {
            decoded.set_channel_layout(ffmpeg::ChannelLayout::default(decoded.channels() as i32));
        }
        if decoded.rate() == 0 && self.decoder.rate() > 0 {
            decoded.set_rate(self.decoder.rate());
        }
    }

    pub fn new(
        ist: &format::stream::Stream,
        octx: &mut format::context::Output,
        params: &AudioEncodingParams,
        start_time: i64,
    ) -> Result<Self, String> {
        let source_stream_index = ist.index();
        let decoder_ctx = codec::context::Context::from_parameters(ist.parameters())
            .map_err(|e| format!("Operation failed: {}", e))?;
        let decoder = decoder_ctx
            .decoder()
            .audio()
            .map_err(|e| format!("Operation failed: {}", e))?;

        let input_sample_rate = decoder.rate() as u32;
        let mut input_layout = decoder.channel_layout();
        if input_layout.is_empty() {
            input_layout = ffmpeg::ChannelLayout::default(decoder.channels() as i32);
        }

        let requested_codec = params.codec.as_deref();
        let codec = pick_audio_encoder(requested_codec, ist.parameters().id())
            .ok_or_else(|| {
                if let Some(req) = requested_codec {
                    format!("Requested audio encoder is unavailable in current FFmpeg build: {}", req)
                } else {
                    "No suitable audio encoder found".to_string()
                }
            })?;
        if let Some(req) = requested_codec {
            if !codec.name().eq_ignore_ascii_case(req) {
                log::warn!(
                    "audio encoder fallback: requested={} selected={}",
                    req,
                    codec.name()
                );
            }
        }

        let global_header = octx
            .format()
            .flags()
            .contains(format::flag::Flags::GLOBAL_HEADER);
        let mut ost = octx
            .add_stream(codec)
            .map_err(|e| format!("Operation failed: {}", e))?;

        let desired_sample_rate = params.sample_rate.unwrap_or(input_sample_rate);
        let is_amr = params
            .codec
            .as_deref()
            .map(|c| c.contains("amr"))
            .unwrap_or(false);
        let desired_sample_rate = if is_amr { 8000 } else { desired_sample_rate };
        let mut target_rate =
            media_common::pick_sample_rate(&codec, desired_sample_rate, input_sample_rate);

        let desired_layout = if is_amr {
            ffmpeg::ChannelLayout::MONO
        } else {
            params
                .channels
                .and_then(media_common::channel_layout_from_count)
                .unwrap_or(input_layout)
        };
        let target_layout =
            media_common::pick_channel_layout(&codec, Some(desired_layout), input_layout);

        let preferred_sample =
            media_common::preferred_sample_from_bit_depth(params.bit_depth, None);
        let target_format = media_common::pick_sample_format(&codec, preferred_sample);

        let mut enc_ctx = codec::context::Context::new_with_codec(codec);
        if global_header {
            enc_ctx.set_flags(codec::flag::Flags::GLOBAL_HEADER);
        }

        let mut enc = enc_ctx
            .encoder()
            .audio()
            .map_err(|e| format!("Operation failed: {}", e))?;

        let encoder_name = codec.name();
        if encoder_name.contains("mp3") && target_rate < 16_000 {
            // AMR inputs are often 8kHz; many MP3 encoders (notably Windows MF) reject this.
            target_rate = media_common::pick_sample_rate(&codec, 44_100, target_rate);
        }
        let is_aac_encoder = matches!(encoder_name, "aac" | "aac_at");
        // AAC LC per-frame bit budget in FFmpeg is limited. Convert to bitrate cap by sample rate.
        let aac_max_bit_rate = ((12_288_i64 * target_rate as i64) / 1024).max(64_000);
        let mut chosen_bits = if let Some(br) = params.bitrate {
            (br.max(1.0) * 1000.0).round() as i64
        } else if decoder.bit_rate() > 0 {
            decoder.bit_rate() as i64
        } else {
            128_000
        };
        if is_aac_encoder && chosen_bits > aac_max_bit_rate {
            chosen_bits = aac_max_bit_rate;
        }
        if encoder_name.contains("mp3") && chosen_bits < 32_000 {
            chosen_bits = 64_000;
        }
        if encoder_name.contains("mp3") {
            log::debug!(
                "mp3 encoder params: encoder={} sample_rate={} bit_rate={}",
                encoder_name,
                target_rate,
                chosen_bits
            );
        }
        enc.set_bit_rate(chosen_bits as usize);
        let configured_bit_rate = Some(chosen_bits);

        enc.set_rate(target_rate as i32);
        enc.set_channel_layout(target_layout);
        enc.set_format(target_format);
        enc.set_time_base((1, target_rate as i32));

        let mut opts = ffmpeg::Dictionary::new();
        if let Some(q) = params.quality {
            opts.set("q:a", q.to_string().as_str());
        }

        let encoder = enc
            .open_with(opts)
            .map_err(|e| format!("Operation failed: {}", e))?;

        let encoder_format = encoder.format();
        let encoder_layout = encoder.channel_layout();
        let encoder_rate = encoder.rate() as u32;

        ost.set_parameters(&encoder);
        let encoder_time_base = encoder.time_base();
        ost.set_time_base(encoder_time_base);
        let ost_index = ost.index();

        let target_layout = if encoder_layout.is_empty() {
            target_layout
        } else {
            encoder_layout
        };
        let target_format = if encoder_format == target_format {
            target_format
        } else {
            encoder_format
        };
        let target_rate = if encoder_rate == 0 {
            target_rate
        } else {
            encoder_rate
        };

        let resampler = software::resampling::Context::get(
            decoder.format(),
            input_layout,
            decoder.rate(),
            target_format,
            target_layout,
            target_rate,
        )
        .map_err(|e| format!("Operation failed: {}", e))?;

        let frame_size = encoder.frame_size() as usize;
        let fifo = if frame_size > 0 {
            Some(AudioFifo::new(target_format, target_layout, target_rate))
        } else {
            None
        };

        let start_time = media_common::rescale_ts(
            start_time,
            ffmpeg::Rational(1, ffmpeg::ffi::AV_TIME_BASE),
            ist.time_base(),
        );

        Ok(Self {
            source_stream_index,
            decoder,
            encoder,
            resampler,
            fifo,
            frame_size: if frame_size == 0 { 1024 } else { frame_size },
            target_layout,
            target_format,
            target_rate,
            ost_index,
            encoder_time_base,
            next_pts: 0,
            start_time,
            first_pts_set: false,
            written_bytes: 0,
            configured_bit_rate,
        })
    }

    pub fn process_packet(
        &mut self,
        pkt: &packet::Packet,
        _input_time_base: Rational,
        ost_time_base: Rational,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        self.process_packet_with(pkt, _input_time_base, ost_time_base, octx, |_| Ok(true))
    }

    pub fn process_packet_with<F>(
        &mut self,
        pkt: &packet::Packet,
        _input_time_base: Rational,
        ost_time_base: Rational,
        octx: &mut format::context::Output,
        mut frame_hook: F,
    ) -> Result<(), String>
    where
        F: FnMut(&mut frame::Audio) -> Result<bool, String>,
    {
        let p = pkt.clone();
        self.decoder
            .send_packet(&p)
            .map_err(|e| {
                format!(
                    "send_packet failed: {} (ist={} pkt_pts={:?} pkt_dts={:?} pkt_size={} dec_tb={}/{})",
                    e,
                    self.source_stream_index,
                    p.pts(),
                    p.dts(),
                    p.size(),
                    self.decoder.time_base().numerator(),
                    self.decoder.time_base().denominator()
                )
            })?;

        let mut decoded = frame::Audio::empty();
        while self.decoder.receive_frame(&mut decoded).is_ok() {
            self.normalize_decoded_frame(&mut decoded);
            let mut resampled = frame::Audio::empty();
            resampled.set_channel_layout(self.target_layout);
            resampled.set_format(self.target_format);
            resampled.set_rate(self.target_rate);

            self.resampler
                .run(&decoded, &mut resampled)
                .or_else(|e| {
                    if Self::is_input_changed_error(&e) {
                        self.rebuild_resampler_from_decoded(&decoded)?;
                        self.resampler
                            .run(&decoded, &mut resampled)
                            .map_err(|err| {
                                format!(
                                    "resample(retry) failed: {} (decoded fmt={:?} rate={} channels={} layout_ch={} target fmt={:?} rate={} layout_ch={})",
                                    err,
                                    decoded.format(),
                                    decoded.rate(),
                                    decoded.channels(),
                                    decoded.channel_layout().channels(),
                                    self.target_format,
                                    self.target_rate,
                                    self.target_layout.channels()
                                )
                            })
                    } else {
                        Err(format!("resample failed: {}", e))
                    }
                })?;

            let keep_frame = frame_hook(&mut resampled)?;
            if !keep_frame {
                continue;
            }

            if !self.first_pts_set {
                if let Some(pts) = decoded.pts() {
                    let mut p = pts;
                    if p >= self.start_time {
                        p -= self.start_time;
                    }
                    self.next_pts = media_common::rescale_ts(
                        p,
                        self.decoder.time_base(),
                        self.encoder_time_base,
                    );
                    self.first_pts_set = true;
                }
            }

            if self.fifo.is_some() {
                {
                    // Push into FIFO first to avoid empty pops later.
                    let fifo = self.fifo.as_mut().unwrap();
                    fifo.push_frame(&resampled);
                }
                loop {
                    let mut output_frame =
                        frame::Audio::new(self.target_format, self.frame_size, self.target_layout);
                    output_frame.set_rate(self.target_rate);
                    let popped = {
                        let fifo = self.fifo.as_mut().unwrap();
                        if !fifo.has_samples(self.frame_size) {
                            false
                        } else {
                            fifo.pop_into_frame(&mut output_frame, self.frame_size)
                        }
                    };
                    if !popped {
                        break;
                    }
                    output_frame.set_pts(Some(self.next_pts));
                    self.next_pts += self.frame_size as i64;
                    self.encode_and_write(&output_frame, ost_time_base, octx)?;
                }
            } else {
                resampled.set_pts(Some(self.next_pts));
                self.next_pts += resampled.samples() as i64;
                self.encode_and_write(&resampled, ost_time_base, octx)?;
            }
        }
        Ok(())
    }

    pub fn finish(
        &mut self,
        ost_time_base: Rational,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        if let Some(fifo) = self.fifo.as_mut() {
            let remaining_samples = fifo.available_samples();
            if remaining_samples > 0 {
                let frame_samples = self.frame_size.max(remaining_samples);
                if frame_samples != remaining_samples {
                    log::debug!(
                        "audio tail padding: ist={} remaining_samples={} padded_to={}",
                        self.source_stream_index,
                        remaining_samples,
                        frame_samples
                    );
                }
                let mut output_frame =
                    frame::Audio::new(self.target_format, frame_samples, self.target_layout);
                output_frame.set_rate(self.target_rate);
                let data = fifo.drain_remaining();
                let channels = self.target_layout.channels() as usize;
                let mut padded = vec![0.0f32; frame_samples * channels];
                let copy_len = padded.len().min(data.len());
                padded[..copy_len].copy_from_slice(&data[..copy_len]);
                fifo.fill_frame(&mut output_frame, &padded, frame_samples);
                output_frame.set_pts(Some(self.next_pts));
                self.next_pts += frame_samples as i64;
                self.encode_and_write(&output_frame, ost_time_base, octx)?;
            }
        }

        self.encoder
            .send_eof()
            .map_err(|e| format!("encode send_eof failed: {}", e))?;
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.encoder_time_base, ost_time_base);
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("encode flush write_interleaved failed: {}", e))?;
            self.written_bytes = self.written_bytes.saturating_add(encoded.size() as u64);
        }
        Ok(())
    }

    fn encode_and_write(
        &mut self,
        frame: &frame::Audio,
        ost_time_base: Rational,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        self.encoder
            .send_frame(frame)
            .map_err(|e| format!("encode send_frame failed: {}", e))?;
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.encoder_time_base, ost_time_base);
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("encode write_interleaved failed: {}", e))?;
            self.written_bytes = self.written_bytes.saturating_add(encoded.size() as u64);
        }
        Ok(())
    }

    pub fn written_bytes(&self) -> u64 {
        self.written_bytes
    }

    pub fn output_summary(&self) -> AudioOutputSummary {
        let codec_name = self
            .encoder
            .codec()
            .map(|c| c.name().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let channels = if self.encoder.channels() > 0 {
            Some(self.encoder.channels() as u16)
        } else {
            None
        };
        let sample_rate = if self.encoder.rate() > 0 {
            Some(self.encoder.rate())
        } else {
            None
        };
        AudioOutputSummary {
            ost_index: self.ost_index,
            codec_name,
            time_base: Some(format!(
                "{}/{}",
                self.encoder_time_base.numerator(),
                self.encoder_time_base.denominator()
            )),
            channels,
            sample_rate,
            bit_rate: self.configured_bit_rate,
        }
    }
}

pub fn run_audio_transcode<E, F>(
    emitter: &E,
    ictx: &mut format::context::Input,
    octx: &mut format::context::Output,
    tracks: &[AudioTranscodeTrack],
    duration: f64,
    start_time: i64,
    mut frame_hook: F,
) -> Result<AudioTranscodeRunReport, String>
where
    E: crate::events::TaskEmitter,
    F: FnMut(usize, &mut frame::Audio) -> Result<bool, String>,
{
    let mut processors: Vec<AudioTrackProcessor> = Vec::new();
    let mut ost_time_bases: Vec<ffmpeg::Rational> = Vec::new();

    for track in tracks {
        let ist = ictx
            .stream(track.source_stream_index)
            .ok_or_else(|| format!("找不到输入音频流 index={}", track.source_stream_index))?;
        if ist.parameters().medium() != ffmpeg::media::Type::Audio {
            return Err(format!(
                "输入流不是音频流: index={} medium={:?}",
                track.source_stream_index,
                ist.parameters().medium()
            ));
        }

        let processor = AudioTrackProcessor::new(&ist, octx, &track.encoding, start_time)?;
        let ost_time_base = octx
            .stream(processor.ost_index)
            .ok_or_else(|| format!("无法获取输出音频流: ost_index={}", processor.ost_index))?
            .time_base();
        processors.push(processor);
        ost_time_bases.push(ost_time_base);
    }

    octx.write_header()
        .map_err(|e| format!("写入头失败: {}", e))?;

    let mut packets_processed = 0u64;
    for (stream, pkt) in ictx.packets() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }

        let mut matched = false;
        for (idx, processor) in processors.iter_mut().enumerate() {
            if processor.source_stream_index != stream.index() {
                continue;
            }
            processor
                .process_packet_with(&pkt, stream.time_base(), ost_time_bases[idx], octx, |frame| {
                    frame_hook(idx, frame)
                })
                .map_err(|e| format!("处理音频包失败(ist={}): {}", stream.index(), e))?;
            matched = true;
        }
        if !matched {
            continue;
        }

        packets_processed += 1;
        if packets_processed % 50 == 0 && duration > 0.0 {
            if let Some(pts) = pkt.pts() {
                let current_us = media_common::rescale_ts(
                    pts,
                    stream.time_base(),
                    ffmpeg::Rational(1, ffmpeg::ffi::AV_TIME_BASE),
                );
                let mut progress =
                    (current_us as f64 / (duration * ffmpeg::ffi::AV_TIME_BASE as f64)) * 100.0;
                if progress.is_nan() || progress.is_infinite() {
                    progress = 0.0;
                }
                progress = progress.clamp(0.0, 99.0);
                emitter.emit("progress", Some(progress), None, None);
            }
        }
    }

    for (idx, processor) in processors.iter_mut().enumerate() {
        processor
            .finish(ost_time_bases[idx], octx)
            .map_err(|e| {
                format!(
                    "结束音频流失败(ist={}): {}",
                    processor.source_stream_index, e
                )
            })?;
    }
    octx.write_trailer()
        .map_err(|e| format!("写入文件尾失败: {}", e))?;

    let mut total_written_bytes: u64 = 0;
    let mut summaries: Vec<AudioOutputSummary> = Vec::new();
    for processor in &processors {
        total_written_bytes = total_written_bytes.saturating_add(processor.written_bytes());
        summaries.push(processor.output_summary());
    }
    summaries.sort_by_key(|s| s.ost_index);

    Ok(AudioTranscodeRunReport {
        packets_processed,
        total_written_bytes,
        summaries,
    })
}

pub fn try_stream_copy_audio<E>(
    emitter: &E,
    ictx: &mut format::context::Input,
    octx: &mut format::context::Output,
    tracks: &[AudioTranscodeTrack],
    duration: f64,
    output_path: &str,
) -> Result<bool, String>
where
    E: crate::events::TaskEmitter,
{
    if tracks.is_empty() {
        return Ok(false);
    }

    let mut stream_mapping: HashMap<usize, usize> = HashMap::new();
    for track in tracks {
        if stream_mapping.contains_key(&track.source_stream_index) {
            return Ok(false);
        }
        let ist = match ictx.stream(track.source_stream_index) {
            Some(s) => s,
            None => return Ok(false),
        };
        if ist.parameters().medium() != ffmpeg::media::Type::Audio {
            return Ok(false);
        }
        if !can_stream_copy_track(track, &ist) {
            return Ok(false);
        }

        let mut ost = octx
            .add_stream(ffmpeg::encoder::find(ffmpeg::codec::Id::None))
            .map_err(|e| format!("添加输出音频流失败: {}", e));
        let Ok(ref mut ost) = ost else {
            return Ok(false);
        };
        ost.set_parameters(ist.parameters());
        unsafe {
            (*ost.parameters().as_mut_ptr()).codec_tag = 0;
        }
        stream_mapping.insert(track.source_stream_index, ost.index());
    }

    if stream_mapping.is_empty() {
        return Ok(false);
    }
    if octx.write_header().is_err() {
        return Ok(false);
    }

    let mut ost_time_bases: HashMap<usize, ffmpeg::Rational> = HashMap::new();
    for (ist_index, ost_index) in &stream_mapping {
        let ost_tb = octx
            .stream(*ost_index)
            .ok_or_else(|| format!("获取输出流失败: ost={}", ost_index))?
            .time_base();
        ost_time_bases.insert(*ist_index, ost_tb);
    }

    let mut packets_processed = 0u64;
    for (stream, mut pkt) in ictx.packets() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }

        let ist_index = stream.index();
        let Some(&ost_index) = stream_mapping.get(&ist_index) else {
            continue;
        };
        let Some(&ost_tb) = ost_time_bases.get(&ist_index) else {
            return Err(format!("缺少输出流 time_base: ist={}", ist_index));
        };
        let input_pts = pkt.pts();
        pkt.set_stream(ost_index);
        pkt.rescale_ts(stream.time_base(), ost_tb);
        pkt.write_interleaved(octx)
            .map_err(|e| format!("写入音频包失败(直拷贝): {}", e))?;

        packets_processed += 1;
        if packets_processed % 50 == 0 && duration > 0.0 {
            if let Some(pts) = input_pts {
                let current_us = media_common::rescale_ts(
                    pts,
                    stream.time_base(),
                    ffmpeg::Rational(1, ffmpeg::ffi::AV_TIME_BASE),
                );
                let progress =
                    (current_us as f64 / (duration * ffmpeg::ffi::AV_TIME_BASE as f64) * 100.0)
                        .clamp(0.0, 99.0);
                emitter.emit("progress", Some(progress), None, None);
            }
        }
    }

    octx.write_trailer()
        .map_err(|e| format!("写入文件尾失败(直拷贝): {}", e))?;
    emitter.emit("complete", Some(100.0), Some(output_path.to_string()), None);
    Ok(true)
}
