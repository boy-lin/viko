// src-tauri/src/audio_converter.rs
// 音频转换模块 - 使用 FFmpeg 库进行音频格式转换
// 使用 ffmpeg-next 库的 API，不依赖命令行工具

use std::path::Path;
use tauri::Emitter;
use tauri::WebviewWindow;

use ffmpeg::codec;
use ffmpeg::filter;
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
    pub use_hardware_acceleration: bool, // Try to use hardware encoders (e.g. aac_at)
    pub use_ultra_fast_speed: bool,      // Optimize for speed
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
fn get_audio_codec_for_format(format: &str, use_hardware_acceleration: bool) -> String {
    match format.to_lowercase().as_str() {
        "mp3" => "libmp3lame".to_string(),
        "wav" => "pcm_s16le".to_string(),
        "flac" => "flac".to_string(),
        "ogg" => "libvorbis".to_string(),
        "aac" => {
            // MacOS AudioToolbox hardware acceleration for AAC
            if use_hardware_acceleration && cfg!(target_os = "macos") {
                "aac_at".to_string()
            } else {
                "aac".to_string()
            }
        },
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
fn get_codec_id_for_format(format: &str, use_hardware_acceleration: bool) -> codec::Id {
    match format.to_lowercase().as_str() {
        "mp3" => codec::Id::MP3,
        "wav" => codec::Id::PCM_S16LE,
        "flac" => codec::Id::FLAC,
        "ogg" => codec::Id::VORBIS,
        "aac" => {
             // We return standard AAC ID, the specific encoder implementation (aac vs aac_at) 
             // is selected by name later, but the ID remains AAC.
             codec::Id::AAC
        },
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
        if let Some(layouts) = audio.channel_layouts() {
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

/// 创建音频过滤器图，用于格式转换和重采样
fn create_audio_filter(
    decoder: &codec::decoder::Audio,
    encoder: &codec::encoder::Audio,
    target_sample_rate: u32,
) -> Result<filter::Graph, String> {
    let mut filter_graph = filter::Graph::new();

    // 构建 abuffer 输入参数
    let decoder_time_base = decoder.time_base();
    let decoder_rate = decoder.rate();
    let decoder_format_name = decoder.format().name();
    let decoder_layout_bits = decoder.channel_layout().bits();

    let abuffer_args = format!(
        "time_base={}:sample_rate={}:sample_fmt={}:channel_layout=0x{:x}",
        decoder_time_base, decoder_rate, decoder_format_name, decoder_layout_bits
    );

    // 添加 abuffer 输入过滤器
    filter_graph
        .add(
            &filter::find("abuffer").ok_or("未找到 abuffer 过滤器")?,
            "in",
            &abuffer_args,
        )
        .map_err(|e| format!("添加 abuffer 失败: {}", e))?;

    // 添加 abuffersink 输出过滤器
    filter_graph
        .add(
            &filter::find("abuffersink").ok_or("未找到 abuffersink 过滤器")?,
            "out",
            "",
        )
        .map_err(|e| format!("添加 abuffersink 失败: {}", e))?;

    // 配置输出格式
    {
        let mut out = filter_graph.get("out").ok_or("无法获取输出过滤器")?;

        out.set_sample_format(encoder.format());
        out.set_channel_layout(encoder.channel_layout());
        out.set_sample_rate(encoder.rate() as u32);
    }

    // 构建过滤器链：如果需要重采样，使用 aresample，否则使用 anull
    let filter_spec = if decoder.rate() as u32 != target_sample_rate {
        format!("aresample={}", target_sample_rate)
    } else {
        "anull".to_string()
    };

    // 连接过滤器
    filter_graph
        .output("in", 0)
        .map_err(|e| format!("连接过滤器输出失败: {}", e))?
        .input("out", 0)
        .map_err(|e| format!("连接过滤器输入失败: {}", e))?
        .parse(&filter_spec)
        .map_err(|e| format!("解析过滤器失败: {}", e))?;

    // 验证过滤器图
    filter_graph
        .validate()
        .map_err(|e| format!("验证过滤器图失败: {}", e))?;

    // 如果编码器不支持可变帧大小，设置固定帧大小
    if let Some(codec) = encoder.codec() {
        if !codec
            .capabilities()
            .contains(codec::capabilities::Capabilities::VARIABLE_FRAME_SIZE)
        {
            filter_graph
                .get("out")
                .ok_or("无法获取输出过滤器")?
                .sink()
                .set_frame_size(encoder.frame_size());
        }
    }

    log::debug!("过滤器图: {}", filter_graph.dump());

    Ok(filter_graph)
}

/// 执行音频转换（使用 ffmpeg-next 库 API 和 filter graph）
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
    log::debug!("转码内部初始: ffmpeg_version={:?}", unsafe {
        let ptr = ffmpeg::ffi::av_version_info();
        std::ffi::CStr::from_ptr(ptr).to_string_lossy()
    });

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
    // 获取编码器
    // 首先尝试获取特定的编码器名称（可能包含 hardware accel 的选择）
    let codec_name = get_audio_codec_for_format(&params.format, params.use_hardware_acceleration);
    // 尝试通过名称查找
    let mut encoder_codec = ffmpeg::encoder::find_by_name(&codec_name);
    // 如果找不到指定的（例如 aac_at），回退到通用 ID
    let codec_id = if let Some(ref codec) = encoder_codec {
        codec.id()
    } else {
        let id = get_codec_id_for_format(&params.format, params.use_hardware_acceleration);
        encoder_codec = ffmpeg::encoder::find(id);
        id
    };
    
    let encoder_codec = encoder_codec.ok_or_else(|| format!("未找到编码器: {:?} ({})", codec_id, codec_name))?;
    log::info!(
        "选用编码器: id={:?}, name={:?}, profile_supported={:?}",
        codec_id,
        encoder_codec.name(),
        encoder_codec
            .profiles()
            .map(|p| p.collect::<Vec<_>>().len())
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

        // 打开编码器
        enc.open_as(encoder_codec)
            .map_err(|e| format!("打开编码器失败: {}", e))?
    };

    let target_channels = target_channel_layout.channels() as usize;
    let target_bytes_per_sample = target_sample_format.bytes();
    let target_is_planar = target_sample_format.is_planar();
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
    output_stream.set_parameters(&encoder);
    output_stream.set_time_base(encoder.time_base());
    let output_stream_index = output_stream.index();
    let output_time_base = output_stream.time_base();
    drop(output_stream);

    // 创建音频过滤器图
    let mut filter_graph = create_audio_filter(&decoder, &encoder, target_sample_rate)?;

    log::info!(
        "过滤器配置: input_rate={}, output_rate={}, input_fmt={:?}, output_fmt={:?}, input_layout={:?}, output_layout={:?}",
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
    let mut filtered = Audio::empty();
    let mut encoded = ffmpeg::packet::Packet::empty();
    let mut packets_processed = 0u64;
    let mut frames_processed = 0u64;

    // 处理输入数据包
    for (stream, mut packet) in ictx.packets() {
        if stream.index() == input_stream_index {
            // 重新缩放时间戳到解码器的时间基准
            packet.rescale_ts(stream.time_base(), decoder.time_base());

            // 发送数据包到解码器
            decoder
                .send_packet(&packet)
                .map_err(|e| format!("发送数据包到解码器失败: {}", e))?;

            // 接收并处理解码后的帧
            while decoder.receive_frame(&mut decoded).is_ok() {
                frames_processed += 1;

                // 更新进度（每 100 帧更新一次）
                if frames_processed % 100 == 0 && duration > 0.0 {
                    if let Some(pts) = decoded.pts() {
                        let current_time = pts as f64 * input_time_base.numerator() as f64
                            / input_time_base.denominator() as f64;
                        let progress = (current_time / duration * 100.0).min(100.0);
                        let _ =
                            window.emit("audio-conversion-progress", format!("{:.1}%", progress));
                    }
                }

                // 设置帧的时间戳
                if let Some(timestamp) = decoded.timestamp() {
                    decoded.set_pts(Some(timestamp));
                }

                // 将解码后的帧添加到过滤器图
                filter_graph
                    .get("in")
                    .ok_or("无法获取输入过滤器")?
                    .source()
                    .add(&decoded)
                    .map_err(|e| format!("添加帧到过滤器失败: {}", e))?;

                // 从过滤器图获取处理后的帧并编码
                while filter_graph
                    .get("out")
                    .ok_or("无法获取输出过滤器")?
                    .sink()
                    .frame(&mut filtered)
                    .is_ok()
                {
                    // 过滤后的帧应该已经有正确的时间戳（由过滤器图处理）
                    // 但如果时间戳缺失，尝试从解码帧继承
                    if filtered.pts().is_none() {
                        if let Some(decoded_pts) = decoded.pts() {
                            // 需要将时间戳从解码器时间基准转换到编码器时间基准
                            let pts_in_encoder_base = (decoded_pts as f64
                                * decoder.time_base().numerator() as f64
                                / decoder.time_base().denominator() as f64
                                * encoder.time_base().denominator() as f64
                                / encoder.time_base().numerator() as f64)
                                as i64;
                            filtered.set_pts(Some(pts_in_encoder_base));
                        }
                    }

                    // 发送过滤后的帧到编码器
                    // 如果发送失败，记录详细信息以便调试
                    if let Err(e) = encoder.send_frame(&filtered) {
                        log::error!(
                            "发送帧到编码器失败: {}, frame_samples={}, frame_pts={:?}, frame_format={:?}",
                            e,
                            filtered.samples(),
                            filtered.pts(),
                            filtered.format()
                        );
                        return Err(format!("发送帧到编码器失败: {}", e));
                    }

                    // 接收编码后的数据包
                    while encoder.receive_packet(&mut encoded).is_ok() {
                        encoded.set_stream(output_stream_index);
                        encoded.rescale_ts(encoder.time_base(), output_time_base);

                        // 记录数据包信息以便调试
                        log::debug!(
                            "写入数据包: stream={}, pts={:?}, size={}, time_base={:?}",
                            output_stream_index,
                            encoded.pts(),
                            encoded.size(),
                            output_time_base
                        );

                        encoded
                            .write_interleaved(&mut octx)
                            .map_err(|e| {
                                log::error!(
                                    "写入数据包失败: {}, packet_stream={}, packet_pts={:?}, packet_size={}",
                                    e,
                                    encoded.stream(),
                                    encoded.pts(),
                                    encoded.size()
                                );
                                format!("写入数据包失败: {}", e)
                            })?;
                        packets_processed += 1;
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
        if let Some(timestamp) = decoded.timestamp() {
            decoded.set_pts(Some(timestamp));
        }

        filter_graph
            .get("in")
            .ok_or("无法获取输入过滤器")?
            .source()
            .add(&decoded)
            .map_err(|e| format!("添加帧到过滤器失败: {}", e))?;

        while filter_graph
            .get("out")
            .ok_or("无法获取输出过滤器")?
            .sink()
            .frame(&mut filtered)
            .is_ok()
        {
            // 确保过滤后的帧有正确的时间戳
            if filtered.pts().is_none() {
                if let Some(decoded_pts) = decoded.pts() {
                    filtered.set_pts(Some(decoded_pts));
                }
            }

            encoder
                .send_frame(&filtered)
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

    // 刷新过滤器图
    filter_graph
        .get("in")
        .ok_or("无法获取输入过滤器")?
        .source()
        .flush()
        .map_err(|e| format!("刷新过滤器失败: {}", e))?;

    // 处理过滤器图剩余的帧
    while filter_graph
        .get("out")
        .ok_or("无法获取输出过滤器")?
        .sink()
        .frame(&mut filtered)
        .is_ok()
    {
        encoder
            .send_frame(&filtered)
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
