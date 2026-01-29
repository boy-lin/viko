
use ffmpeg_next as ffmpeg;
use ffmpeg::{codec, encoder, format, frame, media};
use serde::Deserialize;
use std::f32;
use std::time::Instant;
use ffmpeg::util::channel_layout::ChannelLayout;

use crate::media_common::{self, AudioFifo};
use crate::events::TaskEmitter;

/// 音频压缩参数（全部可选）
#[derive(Deserialize)]
pub struct AudioCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub compression_ratio: Option<u32>,  // 0-100 (兼容旧参数)
    pub sample_rate: Option<u32>,        // 目标采样率
    pub bitrate: Option<u32>,            // 目标码率（kbps）
    pub codec: Option<String>,           // "aac", "mp3", "opus", "flac"
    pub channels: Option<u32>,           // 1=mono, 2=stereo
    pub bit_depth: Option<u32>,          // 16, 24, 32（优先匹配编码器支持的格式）
    pub remove_silence: Option<bool>,    // 是否移除静音片段
    pub silence_threshold: Option<f32>,  // 静音阈值 dB（默认 -50.0）
    pub volume_gain: Option<f32>,        // 音量增益 dB（正增益，负衰减）
}

fn apply_volume_and_silence(
    frame: &mut frame::Audio,
    volume_gain_db: f32,
    remove_silence: bool,
    silence_db: f32,
) -> bool {
    // 仅处理 f32 类型，其它格式直接跳过处理
    if frame.format() != ffmpeg::format::Sample::F32(ffmpeg::format::sample::Type::Planar)
        && frame.format() != ffmpeg::format::Sample::F32(ffmpeg::format::sample::Type::Packed)
    {
        return true;
    }

    let gain = 10f32.powf(volume_gain_db / 20.0);
    let silence_amp = 10f32.powf(silence_db / 20.0).abs();

    let mut max_amp = 0f32;
    if frame.is_planar() {
        for p in 0..frame.planes() {
            let data = frame.data_mut(p);
            let samples: &mut [f32] = unsafe {
                std::slice::from_raw_parts_mut(
                    data.as_mut_ptr() as *mut f32,
                    frame.samples() as usize,
                )
            };
            for s in samples.iter_mut() {
                *s *= gain;
                max_amp = max_amp.max(s.abs());
            }
        }
    } else {
        let data = frame.data_mut(0);
        let samples: &mut [f32] = unsafe {
            std::slice::from_raw_parts_mut(
                data.as_mut_ptr() as *mut f32,
                frame.samples() as usize * frame.channels() as usize,
            )
        };
        for s in samples.iter_mut() {
            *s *= gain;
            max_amp = max_amp.max(s.abs());
        }
    }

    if remove_silence && max_amp < silence_amp {
        return false; // 丢弃静音帧
    }
    true
}

/// 使用 FFmpeg 压缩音频文件
pub fn compress_audio_file<E: TaskEmitter>(
    emitter: E,
    params: AudioCompressionParams,
) -> Result<(), String> {
    media_common::ensure_ffmpeg_init()?;

    let mut ictx = format::input(&params.input_path)
        .map_err(|e| format!("无法打开输入文件: {}", e))?;
    let mut octx = format::output(&params.output_path)
        .map_err(|e| format!("无法创建输出文件: {}", e))?;

    let audio_stream = ictx
        .streams()
        .best(media::Type::Audio)
        .ok_or("未找到音频流")?;
    let stream_index = audio_stream.index();

    let decoder_ctx = codec::context::Context::from_parameters(audio_stream.parameters())
        .map_err(|e| format!("创建解码器失败: {}", e))?;
    let mut decoder = decoder_ctx
        .decoder()
        .audio()
        .map_err(|e| format!("创建音频解码器失败: {}", e))?;

    let original_bitrate = decoder.bit_rate().max(128_000) as i64;
    let target_bitrate = if let Some(br) = params.bitrate {
        (br as i64 * 1000).max(32_000)
    } else if let Some(ratio) = params.compression_ratio {
        ((original_bitrate as f64 * ratio as f64 / 100.0) as i64).max(32_000)
    } else {
        128_000
    };

    // 选择编码器
    let codec_id = params
        .codec
        .as_deref()
        .and_then(|name| encoder::find_by_name(name))
        .or_else(|| encoder::find(audio_stream.parameters().id()))
        .ok_or("找不到合适的音频编码器")?;

    let mut ost = octx
        .add_stream(codec_id)
        .map_err(|e| format!("添加输出流失败: {}", e))?;

    let preferred_sample =
        media_common::preferred_sample_from_bit_depth(params.bit_depth, None);
    let target_format = media_common::pick_sample_format(&codec_id, preferred_sample);

    let desired_rate = params.sample_rate.unwrap_or_else(|| decoder.rate() as u32);
    let target_rate: i32 =
        media_common::pick_sample_rate(&codec_id, desired_rate, decoder.rate() as u32) as i32;

    let mut input_layout = decoder.channel_layout();
    if input_layout.is_empty() {
        input_layout = ChannelLayout::default(decoder.channels() as i32);
    }
    let desired_layout = params
        .channels
        .and_then(media_common::channel_layout_from_count)
        .unwrap_or(input_layout);
    let target_layout =
        media_common::pick_channel_layout(&codec_id, Some(desired_layout), input_layout);

    let mut encoder_ctx = codec::context::Context::new_with_codec(codec_id)
        .encoder()
        .audio()
        .map_err(|e| format!("创建编码器失败: {}", e))?;

    encoder_ctx.set_rate(target_rate);
    encoder_ctx.set_channel_layout(target_layout);
    encoder_ctx.set_format(target_format);
    encoder_ctx.set_bit_rate(target_bitrate as usize);
    encoder_ctx.set_time_base((1, target_rate));

    let mut encoder = encoder_ctx
        .open_as(codec_id)
        .map_err(|e| format!("打开编码器失败: {}", e))?;

    let encoder_frame_size = encoder.frame_size() as usize;
    let mut audio_fifo = if encoder_frame_size > 0 {
        Some(AudioFifo::new(
            target_format,
            target_layout,
            target_rate as u32,
        ))
    } else {
        None
    };

    let mut resampler = ffmpeg::software::resampling::Context::get(
        decoder.format(),
        input_layout,
        decoder.rate(),
        target_format,
        target_layout,
        target_rate as u32,
        )
        .map_err(|e| format!("创建重采样器失败: {}", e))?;

    ost.set_parameters(&encoder);
    let ost_index = ost.index();
    let ost_time_base = ost.time_base();
    drop(ost);
    octx.write_header()
        .map_err(|e| format!("写入输出头失败: {}", e))?;

    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;
    let mut pts_counter: i64 = 0;
    let mut last_progress = 0.0;
    let start_time = Instant::now();
    let mut encoded = ffmpeg::Packet::empty();

    for (stream, packet) in ictx.packets() {
        if stream.index() != stream_index {
            continue;
        }
        decoder
            .send_packet(&packet)
            .map_err(|e| format!("发送数据包失败: {}", e))?;

        let mut decoded = frame::Audio::empty();
        while decoder.receive_frame(&mut decoded).is_ok() {
            let mut resampled = frame::Audio::empty();
            resampled.set_channel_layout(target_layout);
            resampled.set_format(target_format);
            resampled.set_rate(target_rate as u32);

            resampler
                .run(&decoded, &mut resampled)
                .map_err(|e| format!("重采样失败: {}", e))?;

            // 处理音量/静音
            let keep_frame = apply_volume_and_silence(
                &mut resampled,
                params.volume_gain.unwrap_or(0.0),
                params.remove_silence.unwrap_or(false),
                params.silence_threshold.unwrap_or(-50.0),
            );
            if !keep_frame {
                continue;
            }

            if let Some(fifo) = audio_fifo.as_mut() {
                fifo.push_frame(&resampled);
                while fifo.has_samples(encoder_frame_size) {
                    let mut output_frame =
                        frame::Audio::new(target_format, encoder_frame_size, target_layout);
                    output_frame.set_rate(target_rate as u32);
                    if !fifo.pop_into_frame(&mut output_frame, encoder_frame_size) {
                        break;
                    }
                    output_frame.set_pts(Some(pts_counter));
                    pts_counter += encoder_frame_size as i64;
                    encoder
                        .send_frame(&output_frame)
                        .map_err(|e| format!("发送音频帧失败: {}", e))?;
                    while encoder.receive_packet(&mut encoded).is_ok() {
                        encoded.set_stream(ost_index);
                        encoded.rescale_ts(decoder.time_base(), ost_time_base);
                        encoded
                            .write_interleaved(&mut octx)
                            .map_err(|e| format!("写入数据包失败: {}", e))?;
                    }
                }
            } else {
                resampled.set_pts(Some(pts_counter));
                pts_counter += resampled.samples() as i64;

                encoder
                    .send_frame(&resampled)
                    .map_err(|e| format!("发送音频帧失败: {}", e))?;

                while encoder.receive_packet(&mut encoded).is_ok() {
                    encoded.set_stream(ost_index);
                    encoded.rescale_ts(decoder.time_base(), ost_time_base);
                    encoded
                        .write_interleaved(&mut octx)
                        .map_err(|e| format!("写入数据包失败: {}", e))?;
                }
            }

            // 进度
            if duration > 0.0 {
                let progress = (pts_counter as f64 / target_rate as f64) / duration * 100.0;
                if (progress - last_progress).abs() >= 1.0 {
                    last_progress = progress;
                    emitter.emit("progress", Some(progress.min(99.0)), None, None);
                }
            }
        }
    }

    if let Some(fifo) = audio_fifo.as_mut() {
        let remaining_samples = fifo.available_samples();
        if remaining_samples > 0 {
            let mut output_frame =
                frame::Audio::new(target_format, remaining_samples, target_layout);
            output_frame.set_rate(target_rate as u32);
            let data = fifo.drain_remaining();
            fifo.fill_frame(&mut output_frame, &data, remaining_samples);
            output_frame.set_pts(Some(pts_counter));
            pts_counter += remaining_samples as i64;
            encoder
                .send_frame(&output_frame)
                .map_err(|e| format!("发送音频帧失败: {}", e))?;
            while encoder.receive_packet(&mut encoded).is_ok() {
                encoded.set_stream(ost_index);
                encoded.rescale_ts(decoder.time_base(), ost_time_base);
                encoded
                    .write_interleaved(&mut octx)
                    .map_err(|e| format!("写入尾部数据包失败: {}", e))?;
            }
        }
    }

    encoder
        .send_eof()
        .map_err(|e| format!("发送 EOF 失败: {}", e))?;
    while encoder.receive_packet(&mut encoded).is_ok() {
        encoded.set_stream(ost_index);
        encoded.rescale_ts(decoder.time_base(), ost_time_base);
        encoded
            .write_interleaved(&mut octx)
            .map_err(|e| format!("写入数据包失败: {}", e))?;
    }

    octx.write_trailer()
        .map_err(|e| format!("写入尾部失败: {}", e))?;

    emitter.emit("complete", Some(100.0), Some(params.output_path), None);

    let _elapsed = start_time.elapsed();
    Ok(())
}
