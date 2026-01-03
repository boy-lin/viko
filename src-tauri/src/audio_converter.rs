// src-tauri/src/audio_converter.rs
// 音频转换模块 - 使用 FFmpeg 库进行音频格式转换
// 使用 ffmpeg-next 库的 API，不依赖命令行工具

use std::path::Path;
use tauri::Emitter;
use tauri::WebviewWindow;

use ffmpeg::codec;
use ffmpeg::format;
use ffmpeg::format::sample::Type as SampleType;
use ffmpeg::util::channel_layout::ChannelLayout;
use ffmpeg::util::format::Sample;
use ffmpeg::util::frame::Audio;
use ffmpeg_next as ffmpeg;

/// 音频转换参数
#[derive(Debug, Clone)]
pub struct AudioConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub format: String,   // mp3, wav, flac, ogg, aac
    pub bitrate: u32,     // kbps
    pub sample_rate: u32, // Hz
}

/// 获取音频文件的时长（秒）
pub fn get_audio_duration(input_path: &str) -> Result<f64, String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;

    let ictx = ffmpeg::format::input(input_path).map_err(|e| format!("打开文件失败: {}", e))?;

    // 优先使用流级别的 duration
    let duration = if let Some(audio_stream) = ictx.streams().best(ffmpeg::media::Type::Audio) {
        let time_base = audio_stream.time_base();
        let duration_ts = audio_stream.duration();
        if duration_ts > 0 {
            duration_ts as f64 * time_base.numerator() as f64 / time_base.denominator() as f64
        } else {
            let dur_raw = ictx.duration();
            if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
                dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
            } else {
                0.0
            }
        }
    } else {
        let dur_raw = ictx.duration();
        if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
            dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
        } else {
            0.0
        }
    };

    Ok(duration)
}

/// 根据格式获取音频编码器
fn get_audio_codec_for_format(format: &str) -> String {
    match format.to_lowercase().as_str() {
        "mp3" => "libmp3lame".to_string(),
        "wav" => "pcm_s16le".to_string(),
        "flac" => "flac".to_string(),
        "ogg" => "libvorbis".to_string(),
        "aac" => "aac".to_string(),
        _ => "libmp3lame".to_string(), // 默认使用 MP3
    }
}

/// 根据格式获取输出文件扩展名
fn get_output_extension(format: &str) -> &str {
    match format.to_lowercase().as_str() {
        "mp3" => "mp3",
        "wav" => "wav",
        "flac" => "flac",
        "ogg" => "ogg",
        "aac" => "m4a",
        _ => "mp3",
    }
}

/// 根据格式获取编码器 ID
fn get_codec_id_for_format(format: &str) -> codec::Id {
    match format.to_lowercase().as_str() {
        "mp3" => codec::Id::MP3,
        "wav" => codec::Id::PCM_S16LE,
        "flac" => codec::Id::FLAC,
        "ogg" => codec::Id::VORBIS,
        "aac" => codec::Id::AAC,
        _ => codec::Id::MP3, // 默认使用 MP3
    }
}

/// 选择编码器支持的采样格式，优先使用期望的格式
fn pick_sample_format(encoder_codec: &ffmpeg::Codec, preferred: Sample) -> Sample {
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(formats) = audio.formats() {
            let supported: Vec<Sample> = formats.collect();
            for candidate in [
                preferred,
                preferred.planar(),
                preferred.packed(),
                Sample::F32(SampleType::Planar),
                Sample::F32(SampleType::Packed),
            ] {
                if supported.iter().any(|f| *f == candidate) {
                    return candidate;
                }
            }
            if let Some(first) = supported.first() {
                return *first;
            }
        }
    }

    preferred
}

/// 选择编码器可接受的声道布局，优先沿用输入布局
fn pick_channel_layout(
    encoder_codec: &ffmpeg::Codec,
    input_layout: ChannelLayout,
) -> ChannelLayout {
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(mut layouts) = audio.channel_layouts() {
            let target_channels = if input_layout.is_empty() {
                2
            } else {
                input_layout.channels()
            };
            let best = layouts.best(target_channels);
            if !best.is_empty() {
                return best;
            }
        }
    }

    if input_layout.is_empty() {
        ChannelLayout::STEREO
    } else {
        input_layout
    }
}

/// 选择编码器支持的采样率，尽量使用用户指定值
fn pick_sample_rate(encoder_codec: &ffmpeg::Codec, requested: u32, fallback: u32) -> u32 {
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(rates) = audio.rates() {
            let supported: Vec<i32> = rates.collect();
            if supported.is_empty() {
                return requested.max(1);
            }

            if supported.iter().any(|r| *r == requested as i32) {
                return requested;
            }

            let mut sorted = supported.clone();
            sorted.sort_by_key(|r| (requested as i32 - *r).abs());
            if let Some(best) = sorted.first() {
                return (*best) as u32;
            }
        }
    }

    if requested > 0 {
        requested
    } else {
        fallback
    }
}

/// 执行音频转换（使用 ffmpeg-next 库 API）
pub fn convert_audio(window: &WebviewWindow, params: AudioConversionParams) -> Result<(), String> {
    // 初始化 FFmpeg
    ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;

    // 记录转换参数
    log::info!(
        "音频转换参数: 输入={}, 输出={}, 格式={}, 比特率={}kbps, 采样率={}Hz",
        params.input_path,
        params.output_path,
        params.format,
        params.bitrate,
        params.sample_rate
    );
    log::debug!(
        "转码内部初始: ffmpeg_version={:?}",
        unsafe {
            let ptr = ffmpeg::ffi::av_version_info();
            std::ffi::CStr::from_ptr(ptr).to_string_lossy()
        }
    );

    // 发送开始转换事件
    let _ = window.emit("audio-conversion-progress", "0.0%");

    // 获取输入文件时长（用于计算进度）
    let duration = get_audio_duration(&params.input_path)?;

    // 打开输入文件
    let mut ictx =
        format::input(&params.input_path).map_err(|e| format!("打开输入文件失败: {}", e))?;

    // 查找音频流
    let input_stream = ictx
        .streams()
        .best(ffmpeg::media::Type::Audio)
        .ok_or_else(|| "未找到音频流".to_string())?;
    let input_stream_index = input_stream.index();
    let input_time_base = input_stream.time_base();
    let input_parameters = input_stream.parameters();
    drop(input_stream);

    // 创建解码器
    let mut decoder_context = codec::context::Context::from_parameters(input_parameters)
        .map_err(|e| format!("创建解码器失败: {}", e))?;
    let mut decoder = decoder_context
        .decoder()
        .audio()
        .map_err(|e| format!("获取音频解码器失败: {}", e))?;

    // 获取输入格式信息
    let input_sample_rate = decoder.rate() as u32;
    let input_channels = decoder.channels() as usize;
    let input_format = decoder.format();
    let input_channel_layout = {
        let layout = decoder.channel_layout();
        if layout.is_empty() {
            ChannelLayout::default(input_channels as i32)
        } else {
            layout
        }
    };

    // 创建输出格式上下文
    let mut octx =
        format::output(&params.output_path).map_err(|e| format!("创建输出文件失败: {}", e))?;

    // 获取编码器
    let codec_id = get_codec_id_for_format(&params.format);
    let encoder_codec = ffmpeg::encoder::find(codec_id)
        .ok_or_else(|| format!("未找到编码器: {:?}", codec_id))?;
    log::info!(
        "选用编码器: id={:?}, name={:?}, profile_supported={:?}",
        codec_id,
        encoder_codec.name(),
        encoder_codec.profiles().map(|p| p.collect::<Vec<_>>().len())
    );

    let global_header = octx
        .format()
        .flags()
        .contains(format::flag::Flags::GLOBAL_HEADER);

    // 添加输出流
    let mut output_stream = octx
        .add_stream(encoder_codec)
        .map_err(|e| format!("添加输出流失败: {}", e))?;

    // 选择编码参数（采样格式、声道布局、采样率）
    let preferred_format = match params.format.to_lowercase().as_str() {
        "wav" | "flac" => Sample::I16(SampleType::Packed),
        "aac" | "ogg" | "mp3" => Sample::F32(SampleType::Planar),
        _ => Sample::F32(SampleType::Planar),
    };
    let target_sample_format = pick_sample_format(&encoder_codec, preferred_format);
    let target_channel_layout = pick_channel_layout(&encoder_codec, input_channel_layout);
    let target_sample_rate =
        pick_sample_rate(&encoder_codec, params.sample_rate, input_sample_rate);

    // 创建编码器上下文
    let mut encoder_context = codec::context::Context::new_with_codec(encoder_codec);

    // 如果格式需要全局头，设置标志
    if global_header {
        encoder_context.set_flags(codec::flag::Flags::GLOBAL_HEADER);
    }

    // 配置并打开编码器
    let mut encoder = {
        let mut enc = encoder_context
            .encoder()
            .audio()
            .map_err(|e| format!("获取音频编码器失败: {}", e))?;

        // 设置编码器参数
        let mut target_bit_rate = (params.bitrate.max(32) * 1000) as usize;
        if matches!(codec_id, codec::Id::PCM_S16LE | codec::Id::FLAC) {
            // 对于无损/PCM，根据采样格式估算比特率，避免过低数值
            let bits_per_sample = match target_sample_format {
                Sample::I16(_) => 16,
                Sample::I32(_) => 32,
                Sample::I64(_) => 64,
                Sample::F64(_) => 64,
                _ => 32,
            } as usize;
            target_bit_rate = target_sample_rate as usize
                * target_channel_layout.channels() as usize
                * bits_per_sample;
        }
        log::info!(
            "编码器 set_bit_rate={} bps (requested={} kbps)",
            target_bit_rate,
            params.bitrate
        );

        enc.set_bit_rate(target_bit_rate);
        enc.set_rate(target_sample_rate as i32);
        enc.set_channel_layout(target_channel_layout);
        enc.set_format(target_sample_format);
        enc.set_time_base((1, target_sample_rate as i32));

        // 打开编码器（使用空选项字典）
        let options = ffmpeg::Dictionary::new();
        enc.open_as(encoder_codec)
            .map_err(|e| format!("打开编码器失败: {}", e))?
    };

    let target_channels = target_channel_layout.channels() as usize;
    let target_bytes_per_sample = target_sample_format.bytes();
    let target_is_planar = target_sample_format.is_planar();
    let target_planes = if target_is_planar { target_channels } else { 1 };
    let encoder_frame_size = encoder.frame_size() as usize;
    log::info!(
        "编码参数: format={:?}, channels={}, layout={:?}, sample_rate={}, frame_size={}, planar={}, bytes_per_sample={}, input_rate={}, input_channels={}, input_layout={:?}, input_fmt={:?}",
        target_sample_format,
        target_channels,
        target_channel_layout,
        target_sample_rate,
        encoder_frame_size,
        target_is_planar,
        target_bytes_per_sample,
        input_sample_rate,
        input_channels,
        input_channel_layout,
        input_format
    );

    // 从编码器获取参数并设置到输出流
    // 注意：set_parameters 接受编码器引用
    output_stream.set_parameters(&encoder);
    output_stream.set_time_base(encoder.time_base());
    let output_stream_index = output_stream.index();
    let output_time_base = output_stream.time_base();
    drop(output_stream);

    // 创建重采样器（如果需要）
    let needs_resample = input_sample_rate != target_sample_rate
        || input_channel_layout != target_channel_layout
        || input_format != target_sample_format;

    let mut resampler = if needs_resample {
        Some(
            ffmpeg::software::resampling::context::Context::get(
                input_format,
                input_channel_layout,
                input_sample_rate,
                target_sample_format,
                target_channel_layout,
                target_sample_rate,
            )
            .map_err(|e| format!("创建重采样器失败: {}", e))?,
        )
    } else {
        None
    };
    log::info!(
        "重采样: needs_resample={}, input_rate={}, output_rate={}, input_fmt={:?}, output_fmt={:?}, input_layout={:?}, output_layout={:?}",
        needs_resample,
        input_sample_rate,
        target_sample_rate,
        input_format,
        target_sample_format,
        input_channel_layout,
        target_channel_layout
    );

    // 写入文件头
    octx.write_header()
        .map_err(|e| format!("写入文件头失败: {}", e))?;

    // 处理数据包和帧
    let mut decoded = Audio::empty();
    let mut resampled = Audio::empty();
    let mut encoded = ffmpeg::packet::Packet::empty();
    let mut packets_processed = 0u64;
    let mut frames_processed = 0u64;
    let mut pending_planes: Vec<Vec<u8>> = vec![Vec::new(); target_planes];
    let mut next_pts: i64 = 0;

    fn push_frame_into_buffer(
        frame: &Audio,
        pending_planes: &mut [Vec<u8>],
        target_is_planar: bool,
    ) {
        let samples = frame.samples();
        if samples == 0 {
            return;
        }

        if target_is_planar {
            for (idx, plane_buf) in pending_planes.iter_mut().enumerate() {
                let data = frame.data(idx);
                plane_buf.extend_from_slice(data);
            }
        } else {
            let data = frame.data(0);
            pending_planes[0].extend_from_slice(data);
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn build_frames_from_buffer(
        pending_planes: &mut [Vec<u8>],
        target_is_planar: bool,
        target_bytes_per_sample: usize,
        target_channels: usize,
        target_sample_format: Sample,
        target_channel_layout: ChannelLayout,
        target_sample_rate: u32,
        encoder_frame_size: usize,
        next_pts: &mut i64,
        is_final: bool,
    ) -> Vec<Audio> {
        let mut ready = Vec::new();

        loop {
            let available_samples = if target_is_planar {
                pending_planes[0].len() / target_bytes_per_sample
            } else {
                pending_planes[0].len() / (target_bytes_per_sample * target_channels)
            };

            let mut samples_per_full_frame = encoder_frame_size;
            if samples_per_full_frame == 0 {
                // Variable frame size codecs (e.g., Vorbis) accept any packet size.
                samples_per_full_frame = available_samples;
            }

            let enough_for_full =
                samples_per_full_frame > 0 && available_samples >= samples_per_full_frame;
            let should_flush = is_final && available_samples > 0;

            if (!enough_for_full && !should_flush) || available_samples == 0 {
                break;
            }

            let take_samples = if enough_for_full {
                samples_per_full_frame
            } else {
                available_samples
            };

            let mut out = Audio::empty();
            unsafe {
                out.alloc(target_sample_format, take_samples, target_channel_layout);
            }
            out.set_rate(target_sample_rate);
            out.set_channel_layout(target_channel_layout);
            out.set_format(target_sample_format);
            out.set_pts(Some(*next_pts));
            *next_pts += take_samples as i64;

            if target_is_planar {
                let plane_bytes = take_samples * target_bytes_per_sample;
                if pending_planes.iter().any(|buf| buf.len() < plane_bytes) {
                    break;
                }
                for (idx, plane_buf) in pending_planes.iter_mut().enumerate() {
                    let chunk = plane_buf.drain(..plane_bytes).collect::<Vec<u8>>();
                    out.data_mut(idx)[..plane_bytes].copy_from_slice(&chunk);
                }
            } else {
                let total_bytes = take_samples * target_bytes_per_sample * target_channels;
                if pending_planes[0].len() < total_bytes {
                    break;
                }
                let chunk = pending_planes[0].drain(..total_bytes).collect::<Vec<u8>>();
                out.data_mut(0)[..total_bytes].copy_from_slice(&chunk);
            }

            ready.push(out);

            if !enough_for_full && should_flush {
                break;
            }
        }

        ready
    }

    for (stream, packet) in ictx.packets() {
        if stream.index() == input_stream_index {
            // 发送数据包到解码器
            if decoder.send_packet(&packet).is_ok() {
                // 接收解码后的帧
                while decoder.receive_frame(&mut decoded).is_ok() {
                    frames_processed += 1;

                    // 更新进度（每 100 帧更新一次）
                    if frames_processed % 100 == 0 && duration > 0.0 {
                        if let Some(pts) = decoded.pts() {
                            let current_time = pts as f64 * input_time_base.numerator() as f64
                                / input_time_base.denominator() as f64;
                            let progress = (current_time / duration * 100.0).min(100.0);
                            let _ = window
                                .emit("audio-conversion-progress", format!("{:.1}%", progress));
                        }
                    }

                    // 重采样（如果需要）
                    if let Some(ref mut resampler) = resampler {
                        resampled = Audio::empty();
                        resampler
                            .run(&decoded, &mut resampled)
                            .map_err(|e| format!("重采样失败: {}", e))?;
                        resampled.set_pts(decoded.pts());
                        push_frame_into_buffer(&resampled, &mut pending_planes, target_is_planar);
                    } else {
                        push_frame_into_buffer(&decoded, &mut pending_planes, target_is_planar);
                    }

                    // 构建符合编码器帧长的帧并发送
                    for mut frame_to_encode in build_frames_from_buffer(
                        &mut pending_planes,
                        target_is_planar,
                        target_bytes_per_sample,
                        target_channels,
                        target_sample_format,
                        target_channel_layout,
                        target_sample_rate,
                        encoder_frame_size,
                        &mut next_pts,
                        false,
                    ) {
                        let pts = frame_to_encode.pts().or(Some(next_pts));
                        frame_to_encode.set_pts(pts);
                        log::debug!(
                            "发送编码帧: samples={}, pts={:?}, planar={}, planes_lens={:?}",
                            frame_to_encode.samples(),
                            frame_to_encode.pts(),
                            target_is_planar,
                            pending_planes.iter().map(|p| p.len()).collect::<Vec<_>>()
                        );
                        encoder
                            .send_frame(&frame_to_encode)
                            .map_err(|e| format!("发送帧到编码器失败: {}", e))?;

                        while encoder.receive_packet(&mut encoded).is_ok() {
                            encoded.set_stream(output_stream_index);
                            encoded.rescale_ts(encoder.time_base(), output_time_base);
                            encoded
                                .write_interleaved(&mut octx)
                                .map_err(|e| format!("写入数据包失败: {}", e))?;
                            packets_processed += 1;
                        }
                    }
                }
            }
        }
    }

    // 刷新解码器（处理剩余的帧）
    decoder
        .send_eof()
        .map_err(|e| format!("发送 EOF 到解码器失败: {}", e))?;
    while decoder.receive_frame(&mut decoded).is_ok() {
        if let Some(ref mut resampler) = resampler {
            resampled = Audio::empty();
            resampler
                .run(&decoded, &mut resampled)
                .map_err(|e| format!("重采样失败: {}", e))?;
            push_frame_into_buffer(&resampled, &mut pending_planes, target_is_planar);
        } else {
            push_frame_into_buffer(&decoded, &mut pending_planes, target_is_planar);
        }
    }

    // 如果有重采样器，刷新内部缓存
    if let Some(ref mut resampler) = resampler {
        loop {
            resampled = Audio::empty();
            match resampler.flush(&mut resampled) {
                Ok(Some(_)) | Ok(None) => {
                    if resampled.samples() > 0 {
                        push_frame_into_buffer(&resampled, &mut pending_planes, target_is_planar);
                    }
                    if resampled.samples() == 0 {
                        break;
                    }
                }
                Err(e) => return Err(format!("重采样 flush 失败: {}", e)),
            }
        }
    }

    // 处理剩余缓冲中的样本（最后一帧可以不足 frame_size）
    for mut frame_to_encode in build_frames_from_buffer(
        &mut pending_planes,
        target_is_planar,
        target_bytes_per_sample,
        target_channels,
        target_sample_format,
        target_channel_layout,
        target_sample_rate,
        encoder_frame_size,
        &mut next_pts,
        true,
    ) {
        let pts = frame_to_encode.pts().or(Some(next_pts));
        frame_to_encode.set_pts(pts);
        log::debug!(
            "发送尾帧: samples={}, pts={:?}, remaining_planes={:?}",
            frame_to_encode.samples(),
            frame_to_encode.pts(),
            pending_planes.iter().map(|p| p.len()).collect::<Vec<_>>()
        );
        encoder
            .send_frame(&frame_to_encode)
            .map_err(|e| format!("发送帧到编码器失败: {}", e))?;

        while encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(output_stream_index);
            encoded.rescale_ts(encoder.time_base(), output_time_base);
            encoded
                .write_interleaved(&mut octx)
                .map_err(|e| format!("写入数据包失败: {}", e))?;
        }
    }

    // 刷新编码器
    encoder
        .send_eof()
        .map_err(|e| format!("发送 EOF 到编码器失败: {}", e))?;
    let mut trailer_packets = Vec::new();
    while encoder.receive_packet(&mut encoded).is_ok() {
        let mut pkt = encoded.clone();
        pkt.set_stream(output_stream_index);
        pkt.rescale_ts(encoder.time_base(), output_time_base);
        trailer_packets.push(pkt);
    }
    for pkt in trailer_packets {
        pkt.write_interleaved(&mut octx)
            .map_err(|e| format!("写入数据包失败: {}", e))?;
    }

    // 写入文件尾
    octx.write_trailer()
        .map_err(|e| format!("写入文件尾失败: {}", e))?;

    // 发送完成事件
    let _ = window.emit("audio-conversion-progress", "100.0%");

    // 验证输出文件是否存在
    if !Path::new(&params.output_path).exists() {
        return Err(format!("转换完成但输出文件不存在: {}", params.output_path));
    }

    log::info!(
        "音频转换成功完成: {} (处理了 {} 个数据包, {} 帧)",
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
    let extension = get_output_extension(format);

    let output_path = parent.join(format!("{}.{}", stem, extension));
    Ok(output_path.to_string_lossy().to_string())
}
