use ffmpeg_next as ffmpeg;
use ffmpeg::{
    codec, decoder, encoder, format, frame, packet, software, Rational,
};
use crate::services::convert::audio::AudioEncodingParams;
use crate::media_common::{self, AudioFifo};

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
}

impl AudioTrackProcessor {
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

        let codec = if let Some(name) = params.codec.as_deref() {
            ffmpeg::encoder::find_by_name(name)
        } else {
            ffmpeg::encoder::find(ist.parameters().id())
        }
        .ok_or_else(|| "No suitable audio encoder found".to_string())?;

        let global_header = octx.format().flags().contains(format::flag::Flags::GLOBAL_HEADER);
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
        let target_rate =
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

        if let Some(br) = params.bitrate {
            let kbps = br.max(1.0);
            enc.set_bit_rate((kbps * 1000.0).round() as usize);
        } else if decoder.bit_rate() > 0 {
            enc.set_bit_rate(decoder.bit_rate() as usize);
        } else {
            enc.set_bit_rate(128_000);
        }

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
        })
    }

    pub fn process_packet(
        &mut self,
        pkt: &packet::Packet,
        input_time_base: Rational,
        ost_time_base: Rational,
        octx: &mut format::context::Output,
    ) -> Result<(), String> {
        let mut p = pkt.clone();
        p.rescale_ts(input_time_base, self.decoder.time_base());
        self.decoder
            .send_packet(&p)
            .map_err(|e| format!("Operation failed: {}", e))?;

        let mut decoded = frame::Audio::empty();
        while self.decoder.receive_frame(&mut decoded).is_ok() {
            let mut resampled = frame::Audio::empty();
            resampled.set_channel_layout(self.target_layout);
            resampled.set_format(self.target_format);
            resampled.set_rate(self.target_rate);

            self.resampler
                .run(&decoded, &mut resampled)
                .map_err(|e| format!("Operation failed: {}", e))?;

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
                    let mut output_frame = frame::Audio::new(
                        self.target_format,
                        self.frame_size,
                        self.target_layout,
                    );
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
                let mut output_frame =
                    frame::Audio::new(self.target_format, remaining_samples, self.target_layout);
                output_frame.set_rate(self.target_rate);
                let data = fifo.drain_remaining();
                fifo.fill_frame(&mut output_frame, &data, remaining_samples);
                output_frame.set_pts(Some(self.next_pts));
                self.next_pts += remaining_samples as i64;
                self.encode_and_write(&output_frame, ost_time_base, octx)?;
            }
        }

        self.encoder
            .send_eof()
            .map_err(|e| format!("Operation failed: {}", e))?;
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.encoder_time_base, ost_time_base);
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("Operation failed: {}", e))?;
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
            .map_err(|e| format!("Operation failed: {}", e))?;
        let mut encoded = packet::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(self.ost_index);
            encoded.rescale_ts(self.encoder_time_base, ost_time_base);
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("Operation failed: {}", e))?;
        }
        Ok(())
    }
}

