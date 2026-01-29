use std::sync::Arc;
use std::time::Instant;
use ffmpeg::{
    codec, encoder, format, frame, media, packet, software, Rational,
};
use ffmpeg_next as ffmpeg;
use serde::Deserialize;
use ringbuf::{HeapRb, Producer, Consumer};
use crate::media_common;
use crate::events::TaskEmitter;

/// 视频压缩参数（全部可选，使用默认值兜底）
#[derive(Deserialize, Clone)]
pub struct VideoCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub compression_ratio: Option<u32>,  // 0-100 (兼容旧参数)
    pub width: Option<u32>,              // 目标宽度
    pub height: Option<u32>,             // 目标高度
    pub bitrate: Option<u32>,            // 视频码率 kbps
    pub frame_rate: Option<f32>,         // 目标帧率
    pub codec: Option<String>,           // h264/h265/vp9/av1
    pub keyframe_interval: Option<u32>,  // GOP 间隔
    pub color_depth: Option<u32>,        // 8/10/12 bit
    pub aspect_ratio: Option<String>,    // 16:9 等
    pub remove_audio: Option<bool>,      // 去除音轨
    pub audio_bitrate: Option<u32>,      // 音频码率 kbps
    pub preset: Option<String>,          // ultrafast/fast/medium/slow
    pub use_hardware_acceleration: Option<bool>, // 是否启用硬件编码（如可用）
}

fn calc_video_bitrate(decoder_bitrate: i64, params: &VideoCompressionParams) -> usize {
    let base = if let Some(br) = params.bitrate {
        (br as i64) * 1000
    } else if let Some(ratio) = params.compression_ratio {
        let ref_bitrate = if decoder_bitrate > 0 { decoder_bitrate } else { 2_000_000 };
        (ref_bitrate as f64 * ratio as f64 / 100.0) as i64
    } else {
        2_000_000
    };
    base.max(100_000) as usize
}

fn calc_audio_bitrate(decoder_bitrate: i64, params: &VideoCompressionParams) -> usize {
    let base = if let Some(br) = params.audio_bitrate {
        (br as i64) * 1000
    } else if let Some(ratio) = params.compression_ratio {
        let ref_bitrate = if decoder_bitrate > 0 { decoder_bitrate } else { 128_000 };
        (ref_bitrate as f64 * ratio as f64 / 100.0) as i64
    } else {
        128_000
    };
    base.max(32_000) as usize
}

struct VideoProcessor<E: TaskEmitter> {
    encoder: encoder::Video,
    decoder: codec::decoder::Video,
    scaler: software::scaling::Context,
    ost_index: usize,
    ost_time_base: Rational,
    final_encoder_time_base: Rational,
    frame_count: usize,
    last_progress_emitted: f64,
    duration: f64,
    start_time: Instant,
    emitter: E,
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
        let codec = media_common::select_video_encoder(params.codec.as_deref(), use_hw)
            .or_else(|| {
                let cid = video_stream.parameters().id();
                encoder::find(cid).or_else(|| encoder::find_by_name(cid.name()))
            })
            .ok_or_else(|| "未找到匹配的视频编码器".to_string())?;

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

        let mut opts = ffmpeg::Dictionary::new();
        opts.set("preset", params.preset.as_deref().unwrap_or("medium"));
        let g_value = params.keyframe_interval.unwrap_or(250).to_string();
        opts.set("g", g_value.as_str());

        let encoder = encoder
            .open_with(opts)
            .map_err(|e| format!("无法打开视频编码器: {}", e))?;

        video_ost.set_parameters(&encoder);
        let encoder_time_base_after = encoder.time_base();
        let final_encoder_time_base = if encoder_time_base_after.numerator() > 0 {
            video_ost.set_time_base(encoder_time_base_after);
            encoder_time_base_after
        } else {
            video_ost.set_time_base(encoder_time_base);
            encoder_time_base
        };

        let scaler = software::scaling::Context::get(
            decoder.format(),
            decoder.width(),
            decoder.height(),
            target_pixel_format,
            target_w,
            target_h,
            software::scaling::flag::Flags::BILINEAR,
        )
        .map_err(|e| format!("无法创建视频缩放器: {}", e))?;

        Ok(Self {
            encoder,
            decoder,
            scaler,
            ost_index: video_ost.index(),
            ost_time_base: video_ost.time_base(),
            final_encoder_time_base,
            frame_count: 0,
            last_progress_emitted: 0.0,
            duration,
            start_time: Instant::now(),
            emitter,
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
            let mut scaled = frame::Video::empty();
            self.scaler
                .run(&decoded, &mut scaled)
                .map_err(|e| format!("视频缩放失败: {}", e))?;

            scaled.set_pts(decoded.pts());

            self.encoder
                .send_frame(&scaled)
                .map_err(|e| format!("发送视频帧失败: {}", e))?;

            self.receive_and_write_packets(octx)?;

            self.frame_count += 1;
            self.emit_progress(decoded.pts());
        }
        Ok(())
    }

    fn emit_progress(&mut self, pts: Option<i64>) {
        if self.frame_count % 30 == 0 || self.start_time.elapsed().as_secs_f64() >= 1.0 {
            let progress = if self.duration > 0.0 {
                let current_time = pts.unwrap_or(0) as f64
                    * self.decoder.time_base().0 as f64
                    / self.decoder.time_base().1 as f64;
                ((current_time / self.duration) * 100.0).min(100.0)
            } else {
                0.0
            };

            if (progress - self.last_progress_emitted).abs() >= 1.0 {
                self.emitter.emit("progress", Some(progress), None, None);
                self.last_progress_emitted = progress;
            }
        }
    }

    fn receive_and_write_packets(&mut self, octx: &mut format::context::Output) -> Result<(), String> {
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.final_encoder_time_base, self.ost_time_base);
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("写入视频数据包失败: {}", e))?;
        }
        Ok(())
    }

    fn finish(&mut self, octx: &mut format::context::Output) -> Result<(), String> {
        self.encoder
            .send_eof()
            .map_err(|e| format!("发送视频 EOF 失败: {}", e))?;
        self.receive_and_write_packets(octx)?;
        Ok(())
    }
}

struct AudioProcessor {
    encoder: encoder::Audio,
    decoder: codec::decoder::Audio,
    resampler: software::resampling::Context,
    producer: Producer<f32, Arc<HeapRb<f32>>>,
    consumer: Consumer<f32, Arc<HeapRb<f32>>>,
    ost_index: usize,
    ost_time_base: Rational,
    encoder_time_base: Rational,
    next_pts: i64,
    frame_size: usize,
    target_layout: ffmpeg::ChannelLayout,
    target_format: format::Sample,
    target_rate: u32,
    stream_index: usize,
}

impl AudioProcessor {
    fn new(
        audio_stream: &format::stream::Stream,
        octx: &mut format::context::Output,
        params: &VideoCompressionParams,
    ) -> Result<Self, String> {
        let stream_index = audio_stream.index();
        let codec_id = audio_stream.parameters().id();
        let codec = encoder::find(codec_id)
            .or_else(|| encoder::find_by_name(codec_id.name()))
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
        let buffer_capacity = (target_rate as usize) * 5 * target_layout.channels() as usize;
        let buffer = HeapRb::<f32>::new(buffer_capacity);
        let (producer, consumer) = buffer.split();

        Ok(Self {
            encoder,
            decoder,
            resampler,
            producer,
            consumer,
            ost_index,
            ost_time_base,
            encoder_time_base: final_encoder_time_base,
            next_pts: 0,
            frame_size,
            target_layout,
            target_format,
            target_rate,
            stream_index,
        })
    }

    fn pick_best_format(supported: &[format::Sample], current: format::Sample) -> Result<format::Sample, String> {
        if supported.contains(&current) {
            return Ok(current);
        }
        supported
            .iter()
            .find(|&&fmt| fmt == format::Sample::F32(format::sample::Type::Planar))
            .or_else(|| supported.iter().find(|&&fmt| fmt == format::Sample::F32(format::sample::Type::Packed)))
            .or_else(|| supported.iter().find(|&&fmt| fmt == format::Sample::I16(format::sample::Type::Planar)))
            .or_else(|| supported.iter().find(|&&fmt| fmt == format::Sample::I16(format::sample::Type::Packed)))
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

            self.push_to_buffer(&resampled);
            self.encode_buffered(octx)?;
        }
        Ok(())
    }

    fn push_to_buffer(&mut self, frame: &frame::Audio) {
        if frame.is_packed() {
            let data: &[f32] = frame.plane(0);
            self.producer.push_slice(data);
        } else {
            let channels = self.target_layout.channels() as usize;
            for i in 0..frame.samples() {
                for ch in 0..channels {
                    let val: f32 = frame.plane::<f32>(ch)[i];
                    let _ = self.producer.push(val);
                }
            }
        }
    }

    fn encode_buffered(&mut self, octx: &mut format::context::Output) -> Result<(), String> {
        let samples_needed = self.frame_size * self.target_layout.channels() as usize;
        while self.consumer.len() >= samples_needed {
            self.encode_chunk(samples_needed, self.frame_size, octx)?;
        }
        Ok(())
    }

    fn encode_chunk(
        &mut self,
        total_samples: usize,
        frame_samples: usize,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        let mut frame_data = vec![0.0f32; total_samples];
        self.consumer.pop_slice(&mut frame_data);

        let mut frame = frame::Audio::new(self.target_format, frame_samples, self.target_layout);
        frame.set_rate(self.target_rate);
        frame.set_pts(Some(self.next_pts));
        self.next_pts += frame_samples as i64;

        self.fill_frame(&mut frame, &frame_data);

        self.encoder
            .send_frame(&frame)
            .map_err(|e| format!("发送音频帧失败: {}", e))?;
        self.receive_and_write_packets(octx)?;
        Ok(())
    }

    fn fill_frame(&self, frame: &mut frame::Audio, data: &[f32]) {
        if frame.is_packed() {
            frame.plane_mut(0).copy_from_slice(data);
        } else {
            let channels = self.target_layout.channels() as usize;
            for i in 0..frame.samples() {
                for ch in 0..channels {
                    frame.plane_mut::<f32>(ch)[i] = data[i * channels + ch];
                }
            }
        }
    }

    fn receive_and_write_packets(&mut self, octx: &mut format::context::Output) -> Result<(), String> {
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
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
        }
        Ok(())
    }

    fn finish(&mut self, octx: &mut format::context::Output) -> Result<(), String> {
        let channels = self.target_layout.channels() as usize;
        let remaining = self.consumer.len();
        if remaining > 0 {
            let samples = remaining / channels;
            self.encode_chunk(remaining, samples, octx)?;
        }

        self.encoder
            .send_eof()
            .map_err(|e| format!("音频 EOF 失败: {}", e))?;
        self.receive_and_write_packets(octx)?;
        Ok(())
    }
}

/// Main entry point
pub fn compress_video_file<E: TaskEmitter + Clone>(
    emitter: E,
    params: VideoCompressionParams,
) -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init: {}", e))?;

    let mut ictx = format::input(&params.input_path).map_err(|e| format!("IO Input Error: {}", e))?;
    let mut octx = format::output(&params.output_path).map_err(|e| format!("IO Output Error: {}", e))?;

    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    let video_stream = ictx
        .streams()
        .best(media::Type::Video)
        .ok_or("No Video Stream")?;
    let mut video_proc = VideoProcessor::new(&video_stream, &mut octx, &params, duration, emitter.clone())?;
    let video_idx = video_stream.index();

    let mut audio_proc = None;
    if !params.remove_audio.unwrap_or(false) {
        if let Some(audio_stream) = ictx.streams().best(media::Type::Audio) {
            audio_proc = Some(AudioProcessor::new(&audio_stream, &mut octx, &params)?);
        }
    }

    octx
        .write_header()
        .map_err(|e| format!("Head Write Error: {}", e))?;

    for (stream, packet) in ictx.packets() {
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

    octx
        .write_trailer()
        .map_err(|e| format!("Trailer Error: {}", e))?;
    emitter.emit("complete", Some(100.0), Some(params.output_path), None);
    Ok(())
}
