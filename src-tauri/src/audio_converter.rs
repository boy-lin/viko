use std::path::Path;
use tauri::WebviewWindow;

use ffmpeg::{codec, format, frame, packet, software};
use ffmpeg::util::channel_layout::ChannelLayout;
use ffmpeg_next as ffmpeg;
use serde::Deserialize;

use crate::media_common::{self, AudioFifo};

/// 音频编码参数（可复用于视频多轨配置）
#[derive(Debug, Clone, Deserialize)]
pub struct AudioEncodingParams {
    pub codec: Option<String>,        // libmp3lame, aac, flac, pcm 等
    pub bitrate: Option<f32>,         // kbps
    pub sample_rate: Option<u32>,     // Hz
    pub channels: Option<u32>,        // 声道数
    pub bit_depth: Option<u32>,       // 16/24/32
    pub quality: Option<u32>,         // VBR 质量 0-10
}

/// 音频转换参数（全部可选，提供默认或沿用原始值）
#[derive(Debug, Clone)]
pub struct AudioConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub format: Option<String>,           // mp3, wav, flac, ogg, aac, m4a, opus, wma
    pub codec: Option<String>,            // libmp3lame, pcm_s16le, flac, aac, libopus, wmav2...
    pub bitrate: Option<f32>,             // kbps
    pub sample_rate: Option<u32>,         // Hz
    pub channels: Option<u32>,            // 1/2...
    pub bit_depth: Option<u32>,           // 16/24/32
    pub quality: Option<u32>,             // 0-10 VBR
    pub use_hardware_acceleration: Option<bool>, // Try hardware encoders
    pub use_ultra_fast_speed: Option<bool>,      // Optimize for speed
}

fn resolve_format(params: &AudioConversionParams) -> String {
    if let Some(fmt) = &params.format { return fmt.to_lowercase(); }
    Path::new(&params.output_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_else(|| "mp3".to_string())
}

fn open_output_context(path: &str, format_name: &str) -> Result<format::context::Output, String> {
    if format_name == "m4r" {
        if let Ok(ctx) = format::output_as(path, "ipod") {
            return Ok(ctx);
        }
        if let Ok(ctx) = format::output_as(path, "mp4") {
            return Ok(ctx);
        }
    }
    if format_name == "ape" {
        if let Ok(ctx) = format::output_as(path, "ape") {
            return Ok(ctx);
        }
    }

    format::output(path).map_err(|e| format!("创建输出文件失败: {}", e))
}

fn map_codec_name(format: &str, codec_override: Option<&str>, use_hw: bool) -> String {
    if let Some(c) = codec_override { return c.to_string(); }
    match format {
        "mp3" => "libmp3lame".to_string(),
        "mp2" => "libmp2lame".to_string(),
        "wav" => "pcm_s16le".to_string(),
        "flac" => "flac".to_string(),
        "ogg" => "libvorbis".to_string(),
        "amr" => "libopencore_amrnb".to_string(),
        "ape" => "ape".to_string(),
        "aac" | "m4a" | "m4r" => {
            if use_hw && cfg!(target_os = "macos") { "aac_at" } else { "aac" }
        }.to_string(),
        "opus" => "libopus".to_string(),
        "wma" => "wmav2".to_string(),
        _ => "libmp3lame".to_string(),
    }
}

fn map_codec_id(format: &str) -> codec::Id {
    match format {
        "mp3" => codec::Id::MP3,
        "mp2" => codec::Id::MP2,
        "wav" => codec::Id::PCM_S16LE,
        "flac" => codec::Id::FLAC,
        "ogg" => codec::Id::VORBIS,
        "amr" => codec::Id::AMR_NB,
        "ape" => codec::Id::APE,
        "aac" | "m4a" | "m4r" => codec::Id::AAC,
        "opus" => codec::Id::OPUS,
        "wma" => codec::Id::WMAV2,
        _ => codec::Id::MP3,
    }
}

fn is_lossless(codec_id: codec::Id, codec_name: &str) -> bool {
    matches!(codec_id, codec::Id::FLAC | codec::Id::PCM_S16LE | codec::Id::PCM_S24LE | codec::Id::PCM_S32LE)
        || codec_name.starts_with("pcm_")
}

fn build_quality_options(codec_name: &str, quality: Option<u32>) -> ffmpeg::Dictionary<'static> {
    let mut opts = ffmpeg::Dictionary::new();
    if let Some(q) = quality {
        match codec_name {
            name if name.contains("mp3") => {
                let v = q.min(9);
                opts.set("q:a", v.to_string().as_str());
            }
            name if name.contains("vorbis") => {
                let v = q.min(10);
                opts.set("q:a", v.to_string().as_str());
            }
            name if name.contains("aac") => {
                let v = q.clamp(1, 5);
                opts.set("vbr", v.to_string().as_str());
            }
            name if name.contains("opus") => {
                let v = q.clamp(1, 10);
                opts.set("application", "audio");
                opts.set("vbr", "on");
                opts.set("compression_level", v.to_string().as_str());
            }
            _ => {}
        }
    }
    opts
}

fn send_frame_and_drain(
    encoder: &mut ffmpeg::encoder::audio::Audio,
    frame: &frame::Audio,
    encoded: &mut packet::Packet,
    octx: &mut format::context::Output,
    output_stream_index: usize,
    output_time_base: ffmpeg::Rational,
    packets_processed: &mut u64,
) -> Result<(), String> {
    encoder
        .send_frame(frame)
        .map_err(|e| format!("发送音频帧失败: {}", e))?;

    while encoder.receive_packet(encoded).is_ok() {
        if encoded.size() == 0 {
            continue;
        }
        encoded.set_stream(output_stream_index);
        encoded.rescale_ts(encoder.time_base(), output_time_base);
        encoded
            .write_interleaved(octx)
            .map_err(|e| format!("写入数据包失败: {}", e))?;
        *packets_processed += 1;
    }
    Ok(())
}

/// 执行音频转换（使用 ffmpeg-next 库 API）
pub fn convert_audio(
    window: &WebviewWindow,
    params: AudioConversionParams,
    task_id: String,
) -> Result<(), String> {
    media_common::ensure_ffmpeg_init()?;

    let use_hw = params.use_hardware_acceleration.unwrap_or(false);
    let format = resolve_format(&params);
    let codec_name = map_codec_name(&format, params.codec.as_deref(), use_hw);
    let is_amr = format == "amr" || codec_name.contains("amr");

    crate::events::emit_media_task_event(
        window,
        &task_id,
        "convert",
        "audio",
        "progress",
        Some(0.0),
        None,
        None,
    );

    let duration = media_common::get_audio_duration(&params.input_path)?;

    let mut ictx = format::input(&params.input_path).map_err(|e| format!("打开输入文件失败: {}", e))?;
    let mut octx = open_output_context(&params.output_path, &format)?;

    let input_stream = ictx
        .streams()
        .best(ffmpeg::media::Type::Audio)
        .ok_or_else(|| "未找到音频流".to_string())?;
    let input_stream_index = input_stream.index();
    let _input_time_base = input_stream.time_base();
    let input_parameters = input_stream.parameters();

    let decoder_ctx = codec::context::Context::from_parameters(input_parameters)
        .map_err(|e| format!("创建解码器失败: {}", e))?;
    let mut decoder = decoder_ctx
        .decoder()
        .audio()
        .map_err(|e| format!("获取音频解码器失败: {}", e))?;

    let input_sample_rate = decoder.rate() as u32;
    let input_channels = decoder.channels() as usize;
    let mut input_layout = decoder.channel_layout();
    if input_layout.is_empty() { input_layout = ChannelLayout::default(input_channels as i32); }
    let _input_format = decoder.format();

    let codec_id = map_codec_id(&format);
    let encoder_codec = ffmpeg::encoder::find_by_name(&codec_name)
        .or_else(|| ffmpeg::encoder::find(codec_id))
        .ok_or_else(|| format!("未找到编码器: {}", codec_name))?;

    let global_header = octx.format().flags().contains(format::flag::Flags::GLOBAL_HEADER);

    let mut output_stream = octx
        .add_stream(encoder_codec)
        .map_err(|e| format!("添加输出流失败: {}", e))?;

    let desired_sample_rate = if is_amr {
        8000
    } else {
        params.sample_rate.unwrap_or(input_sample_rate.max(44100))
    };
    let target_sample_rate =
        media_common::pick_sample_rate(&encoder_codec, desired_sample_rate, input_sample_rate);

    let desired_layout = if is_amr {
        Some(ChannelLayout::MONO)
    } else {
        params.channels.map(|ch| ChannelLayout::default(ch as i32))
    };
    let target_channel_layout =
        media_common::pick_channel_layout(&encoder_codec, desired_layout, input_layout);

    let preferred_sample =
        media_common::preferred_sample_from_bit_depth(params.bit_depth, Some(&format));
    let target_sample_format = media_common::pick_sample_format(&encoder_codec, preferred_sample);

    let mut encoder_ctx = codec::context::Context::new_with_codec(encoder_codec);
    if global_header {
        encoder_ctx.set_flags(codec::flag::Flags::GLOBAL_HEADER);
    }

    let mut enc = encoder_ctx
        .encoder()
        .audio()
        .map_err(|e| format!("创建音频编码器失败: {}", e))?;

    let is_lossless_codec = is_lossless(codec_id, &codec_name);
    if let Some(br) = params.bitrate {
        let kbps = br.max(1.0);
        enc.set_bit_rate((kbps * 1000.0).round() as usize);
    } else if !is_lossless_codec {
        enc.set_bit_rate(128_000);
    }

    enc.set_rate(target_sample_rate as i32);
    enc.set_channel_layout(target_channel_layout);
    enc.set_format(target_sample_format);
    enc.set_time_base((1, target_sample_rate as i32));

    let mut opts = build_quality_options(&codec_name, params.quality);
    if params.use_ultra_fast_speed.unwrap_or(false) {
        opts.set("compression_level", "0");
    }

    let mut encoder = enc
        .open_as_with(encoder_codec, opts)
        .map_err(|e| format!("打开编码器失败: {}", e))?;

    let encoder_format = encoder.format();
    let encoder_layout = encoder.channel_layout();
    let encoder_rate = encoder.rate() as u32;

    output_stream.set_parameters(&encoder);
    output_stream.set_time_base(encoder.time_base());
    let output_stream_index = output_stream.index();
    let output_time_base = output_stream.time_base();

    let target_layout = if encoder_layout.is_empty() {
        target_channel_layout
    } else {
        encoder_layout
    };
    let target_format = if encoder_format == target_sample_format {
        target_sample_format
    } else {
        encoder_format
    };
    let target_rate = if encoder_rate == 0 {
        target_sample_rate
    } else {
        encoder_rate
    };
    let encoder_frame_size = encoder.frame_size() as usize;
    let use_i16_buffer = target_format == format::Sample::I16(format::sample::Type::Packed)
        && codec_name.contains("flac")
        && encoder_frame_size > 0;
    let use_fifo = encoder_frame_size > 0 && !use_i16_buffer;
    let mut i16_buffer: Vec<i16> = Vec::new();
    let mut audio_fifo = if use_fifo {
        Some(AudioFifo::new(
            target_format,
            target_layout,
            target_rate,
        ))
    } else {
        None
    };
    let mut resampler = software::resampling::Context::get(
        decoder.format(),
        input_layout,
        decoder.rate(),
        target_format,
        target_layout,
        target_rate,
    )
    .map_err(|e| format!("创建重采样器失败: {}", e))?;

    octx.write_header().map_err(|e| format!("写入头失败: {}", e))?;

    let mut decoded = frame::Audio::empty();
    let mut encoded = packet::Packet::empty();
    let mut pts_counter: i64 = 0;
    let mut packets_processed = 0u64;
    let mut frames_processed = 0u64;

    for (stream, mut pkt) in ictx.packets() {
        if stream.index() != input_stream_index { continue; }
        pkt.rescale_ts(stream.time_base(), decoder.time_base());

        decoder.send_packet(&pkt).map_err(|e| format!("发送数据包失败: {}", e))?;

        while decoder.receive_frame(&mut decoded).is_ok() {
            let mut resampled = frame::Audio::empty();
            resampled.set_channel_layout(target_layout);
            resampled.set_format(target_format);
            resampled.set_rate(target_rate);

            resampler.run(&decoded, &mut resampled).map_err(|e| format!("重采样失败: {}", e))?;

            if use_i16_buffer {
                let bytes = resampled.data(0);
                let sample_count = bytes.len() / std::mem::size_of::<i16>();
                let expected = resampled.samples() * target_layout.channels() as usize;
                let count = sample_count.min(expected);
                if count > 0 {
                    let data = unsafe {
                        std::slice::from_raw_parts(bytes.as_ptr() as *const i16, sample_count)
                    };
                    i16_buffer.extend_from_slice(&data[..count]);
                }
                let channels = target_layout.channels() as usize;
                let needed = encoder_frame_size * channels;
                while i16_buffer.len() >= needed {
                    let mut output_frame =
                        frame::Audio::new(target_format, encoder_frame_size, target_layout);
                    output_frame.set_rate(target_rate);
                    output_frame.set_pts(Some(pts_counter));
                    pts_counter = pts_counter.saturating_add(encoder_frame_size as i64);

                    let out_bytes = output_frame.data_mut(0);
                    let out_samples = out_bytes.len() / std::mem::size_of::<i16>();
                    let dest = unsafe {
                        std::slice::from_raw_parts_mut(
                            out_bytes.as_mut_ptr() as *mut i16,
                            out_samples,
                        )
                    };
                    dest[..needed].copy_from_slice(&i16_buffer[..needed]);
                    i16_buffer.drain(..needed);

                    send_frame_and_drain(
                        &mut encoder,
                        &output_frame,
                        &mut encoded,
                        &mut octx,
                        output_stream_index,
                        output_time_base,
                        &mut packets_processed,
                    )?;
                    frames_processed += 1;
                }
            } else if let Some(fifo) = audio_fifo.as_mut() {
                fifo.push_frame(&resampled);
                while fifo.has_samples(encoder_frame_size) {
                    let mut output_frame =
                        frame::Audio::new(target_format, encoder_frame_size, target_layout);
                    output_frame.set_rate(target_rate);
                    if !fifo.pop_into_frame(&mut output_frame, encoder_frame_size) {
                        break;
                    }
                    output_frame.set_pts(Some(pts_counter));
                    pts_counter = pts_counter.saturating_add(encoder_frame_size as i64);

                    send_frame_and_drain(
                        &mut encoder,
                        &output_frame,
                        &mut encoded,
                        &mut octx,
                        output_stream_index,
                        output_time_base,
                        &mut packets_processed,
                    )?;
                    frames_processed += 1;
                    if frames_processed % 50 == 0 && duration > 0.0 {
                        let progress =
                            (pts_counter as f64 / target_rate as f64) / duration * 100.0;
                        crate::events::emit_media_task_event(
                            window,
                            &task_id,
                            "convert",
                            "audio",
                            "progress",
                            Some(progress.min(99.0)),
                            None,
                            None,
                        );
                    }
                }
            } else {
                resampled.set_pts(Some(pts_counter));
                pts_counter = pts_counter.saturating_add(resampled.samples() as i64);
                send_frame_and_drain(
                    &mut encoder,
                    &resampled,
                    &mut encoded,
                    &mut octx,
                    output_stream_index,
                    output_time_base,
                    &mut packets_processed,
                )?;
                frames_processed += 1;
                if frames_processed % 50 == 0 && duration > 0.0 {
                    let progress = (pts_counter as f64 / target_rate as f64) / duration * 100.0;
                    crate::events::emit_media_task_event(
                        window,
                        &task_id,
                        "convert",
                        "audio",
                        "progress",
                        Some(progress.min(99.0)),
                        None,
                        None,
                    );
                }
            }
        }
    }

    decoder.send_eof().map_err(|e| format!("发送 EOF 失败: {}", e))?;
    while decoder.receive_frame(&mut decoded).is_ok() {
        let mut resampled = frame::Audio::empty();
        resampled.set_channel_layout(target_layout);
        resampled.set_format(target_format);
        resampled.set_rate(target_rate);
        resampler.run(&decoded, &mut resampled).map_err(|e| format!("重采样失败: {}", e))?;
        if use_i16_buffer {
            let bytes = resampled.data(0);
            let sample_count = bytes.len() / std::mem::size_of::<i16>();
            let expected = resampled.samples() * target_layout.channels() as usize;
            let count = sample_count.min(expected);
            if count > 0 {
                let data = unsafe {
                    std::slice::from_raw_parts(bytes.as_ptr() as *const i16, sample_count)
                };
                i16_buffer.extend_from_slice(&data[..count]);
            }
            let channels = target_layout.channels() as usize;
            let needed = encoder_frame_size * channels;
            while i16_buffer.len() >= needed {
                let mut output_frame =
                    frame::Audio::new(target_format, encoder_frame_size, target_layout);
                output_frame.set_rate(target_rate);
                output_frame.set_pts(Some(pts_counter));
                pts_counter = pts_counter.saturating_add(encoder_frame_size as i64);

                let out_bytes = output_frame.data_mut(0);
                let out_samples = out_bytes.len() / std::mem::size_of::<i16>();
                let dest = unsafe {
                    std::slice::from_raw_parts_mut(
                        out_bytes.as_mut_ptr() as *mut i16,
                        out_samples,
                    )
                };
                dest[..needed].copy_from_slice(&i16_buffer[..needed]);
                i16_buffer.drain(..needed);

                send_frame_and_drain(
                    &mut encoder,
                    &output_frame,
                    &mut encoded,
                    &mut octx,
                    output_stream_index,
                    output_time_base,
                    &mut packets_processed,
                )?;
                frames_processed += 1;
            }
        } else if let Some(fifo) = audio_fifo.as_mut() {
            fifo.push_frame(&resampled);
            while fifo.has_samples(encoder_frame_size) {
                let mut output_frame =
                    frame::Audio::new(target_format, encoder_frame_size, target_layout);
                output_frame.set_rate(target_rate);
                if !fifo.pop_into_frame(&mut output_frame, encoder_frame_size) {
                    break;
                }
                output_frame.set_pts(Some(pts_counter));
                pts_counter = pts_counter.saturating_add(encoder_frame_size as i64);
                send_frame_and_drain(
                    &mut encoder,
                    &output_frame,
                    &mut encoded,
                    &mut octx,
                    output_stream_index,
                    output_time_base,
                    &mut packets_processed,
                )?;
                frames_processed += 1;
            }
        } else {
            resampled.set_pts(Some(pts_counter));
            pts_counter = pts_counter.saturating_add(resampled.samples() as i64);
            send_frame_and_drain(
                &mut encoder,
                &resampled,
                &mut encoded,
                &mut octx,
                output_stream_index,
                output_time_base,
                &mut packets_processed,
            )?;
            frames_processed += 1;
        }
    }

    if use_i16_buffer {
        let channels = target_layout.channels() as usize;
        let remaining_samples = i16_buffer.len() / channels;
        let needed = remaining_samples * channels;
        if remaining_samples > 0 {
            let mut output_frame =
                frame::Audio::new(target_format, remaining_samples, target_layout);
            output_frame.set_rate(target_rate);
            output_frame.set_pts(Some(pts_counter));
            pts_counter = pts_counter.saturating_add(remaining_samples as i64);

            let out_bytes = output_frame.data_mut(0);
            let out_samples = out_bytes.len() / std::mem::size_of::<i16>();
            let dest = unsafe {
                std::slice::from_raw_parts_mut(
                    out_bytes.as_mut_ptr() as *mut i16,
                    out_samples,
                )
            };
            dest[..needed].copy_from_slice(&i16_buffer[..needed]);
            i16_buffer.drain(..needed);

            send_frame_and_drain(
                &mut encoder,
                &output_frame,
                &mut encoded,
                &mut octx,
                output_stream_index,
                output_time_base,
                &mut packets_processed,
            )?;
            frames_processed += 1;
        }
    } else if let Some(fifo) = audio_fifo.as_mut() {
        let remaining_samples = fifo.available_samples();
        if remaining_samples > 0 {
            let mut output_frame =
                frame::Audio::new(target_format, remaining_samples, target_layout);
            output_frame.set_rate(target_rate);
            let data = fifo.drain_remaining();
            fifo.fill_frame(&mut output_frame, &data, remaining_samples);
            output_frame.set_pts(Some(pts_counter));
            pts_counter = pts_counter.saturating_add(remaining_samples as i64);
            send_frame_and_drain(
                &mut encoder,
                &output_frame,
                &mut encoded,
                &mut octx,
                output_stream_index,
                output_time_base,
                &mut packets_processed,
            )?;
            frames_processed += 1;
        }
    }

    encoder.send_eof().map_err(|e| format!("编码器 EOF 失败: {}", e))?;
    while encoder.receive_packet(&mut encoded).is_ok() {
        if encoded.size() == 0 {
            continue;
        }
        encoded.set_stream(output_stream_index);
        encoded.rescale_ts(encoder.time_base(), output_time_base);
        encoded.write_interleaved(&mut octx).map_err(|e| format!("写入尾部数据包失败: {}", e))?;
    }

    octx.write_trailer().map_err(|e| format!("写入文件尾失败: {}", e))?;

    crate::events::emit_media_task_event(
        window,
        &task_id,
        "convert",
        "audio",
        "complete",
        Some(100.0),
        Some(params.output_path.clone()),
        None,
    );

    if !Path::new(&params.output_path).exists() {
        return Err(format!("转换完成但输出文件不存在: {}", params.output_path));
    }

    log::info!(
        "音频转换完成: {} (数据包={}, 帧数={})",
        params.output_path,
        packets_processed,
        frames_processed
    );
    Ok(())
}

/// 生成输出文件路径
pub fn generate_output_path(input_path: &str, format: &str) -> Result<String, String> {
    let input_path_obj = Path::new(input_path);
    let parent = input_path_obj.parent().ok_or("无法获取输入文件的父目录")?;
    let stem = input_path_obj
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("无法获取输入文件名")?;
    let extension = match format.to_lowercase().as_str() {
        "mp3" => "mp3",
        "mp2" => "mp2",
        "wav" => "wav",
        "flac" => "flac",
        "ogg" => "ogg",
        "amr" => "amr",
        "ape" => "ape",
        "aac" => "m4a",
        "m4a" => "m4a",
        "m4r" => "m4r",
        "opus" => "opus",
        "wma" => "wma",
        _ => "mp3",
    };

    let output_path = parent.join(format!("{}.{}", stem, extension));
    Ok(output_path.to_string_lossy().to_string())
}
