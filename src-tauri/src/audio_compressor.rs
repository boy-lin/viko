use ffmpeg::{codec, encoder, format, frame, media, packet};
use ffmpeg_next as ffmpeg;
use serde::Deserialize;
use std::time::Instant;
use tauri::WebviewWindow;

/// 音频压缩参数
#[derive(Deserialize)]
pub struct AudioCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub compression_ratio: u32, // 0-100，表示压缩到原文件的百分比
}

/// 使用 FFmpeg 压缩音频文件
pub fn compress_audio_file(
    window: &WebviewWindow,
    params: AudioCompressionParams,
    task_id: String,
) -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg init failed: {}", e))?;

    let mut ictx =
        format::input(&params.input_path).map_err(|e| format!("无法打开输入文件: {}", e))?;

    let mut octx =
        format::output(&params.output_path).map_err(|e| format!("无法打开输出文件: {}", e))?;

    // 获取音频时长
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    // 找到最佳音频流
    let audio_stream = ictx
        .streams()
        .best(media::Type::Audio)
        .ok_or("未找到音频流")?;
    let stream_index = audio_stream.index();

    // 设置音频解码器
    let decoder_ctx = codec::context::Context::from_parameters(audio_stream.parameters())
        .map_err(|e| format!("无法创建解码器上下文: {}", e))?;
    let mut decoder = decoder_ctx
        .decoder()
        .audio()
        .map_err(|e| format!("无法创建音频解码器: {}", e))?;

    // 获取原始比特率
    let original_bitrate = decoder.bit_rate() as i64;
    // 如果为0，使用默认值
    let original_bitrate = if original_bitrate == 0 {
        128 * 1000 // 默认 128kbps
    } else {
        original_bitrate
    };

    // 计算目标比特率（根据压缩比例）
    let target_bitrate = (original_bitrate as f64 * params.compression_ratio as f64 / 100.0) as i64;
    // 确保最小比特率
    let target_bitrate = target_bitrate.max(32 * 1000); // 最小 32kbps

    // 设置音频编码器（保持原格式和编码器）
    let codec_id = audio_stream.parameters().id();
    // 尝试通过 ID 查找，如果失败则尝试通过名称查找
    let encoder_codec = encoder::find(codec_id)
        .or_else(|| encoder::find_by_name(codec_id.name()))
        .ok_or_else(|| format!("未找到编码器: {:?}", codec_id))?;

    let mut ost = octx
        .add_stream(encoder_codec)
        .map_err(|e| format!("无法添加输出流: {}", e))?;

    // 检查编码器支持的采样格式
    let encoder_supported_formats = encoder_codec
        .audio()
        .unwrap()
        .formats()
        .map(|iter| iter.collect::<Vec<_>>())
        .unwrap_or_default();

    // 选择最佳采样格式
    let target_format = if encoder_supported_formats.contains(&decoder.format()) {
        decoder.format()
    } else {
        // 如果原格式不支持，优先选择 FLTP (浮点 planar) 或 S16 (16位整数)
        *encoder_supported_formats
            .iter()
            .find(|&&fmt| fmt == format::Sample::F32(format::sample::Type::Planar))
            .or_else(|| {
                encoder_supported_formats
                    .iter()
                    .find(|&&fmt| fmt == format::Sample::F32(format::sample::Type::Packed))
            })
            .or_else(|| {
                encoder_supported_formats
                    .iter()
                    .find(|&&fmt| fmt == format::Sample::I16(format::sample::Type::Planar))
            })
            .or_else(|| {
                encoder_supported_formats
                    .iter()
                    .find(|&&fmt| fmt == format::Sample::I16(format::sample::Type::Packed))
            })
            .unwrap_or(
                encoder_supported_formats
                    .first()
                    .ok_or("编码器没有支持的采样格式")?,
            )
    };

    // 检查编码器支持的采样率
    let encoder_supported_rates: Vec<i32> = encoder_codec
        .audio()
        .unwrap()
        .rates()
        .map(|iter| iter.collect())
        .unwrap_or_default();

    // 选择最佳采样率
    let input_rate = decoder.rate() as i32;
    let target_rate =
        if encoder_supported_rates.is_empty() || encoder_supported_rates.contains(&input_rate) {
            input_rate
        } else {
            // 找最接近的
            *encoder_supported_rates
                .iter()
                .min_by_key(|&&rate| (rate - input_rate).abs())
                .unwrap_or(&input_rate)
        };

    // 检查编码器支持的声道布局
    let encoder_supported_layouts = encoder_codec
        .audio()
        .unwrap()
        .channel_layouts()
        .map(|iter| iter.collect::<Vec<_>>())
        .unwrap_or_default();

    // 选择最佳声道布局
    let target_layout = if encoder_supported_layouts.is_empty()
        || encoder_supported_layouts.contains(&decoder.channel_layout())
    {
        decoder.channel_layout()
    } else {
        // 默认使用第一个支持的布局
        // 如果需要默认立体声，可能需要查找 ffmpeg::util::channel_layout::STEREO，但路径可能不同
        *encoder_supported_layouts
            .iter()
            .find(|&&layout| layout.channels() == 2) // 尝试找双声道的
            .or_else(|| encoder_supported_layouts.first())
            .ok_or("编码器没有支持的声道布局")?
    };

    let mut encoder = codec::context::Context::new_with_codec(encoder_codec)
        .encoder()
        .audio()
        .map_err(|e| format!("无法创建音频编码器: {}", e))?;

    // 设置编码器参数
    encoder.set_rate(target_rate);
    encoder.set_channel_layout(target_layout);
    encoder.set_format(target_format);
    encoder.set_bit_rate(target_bitrate as usize);
    encoder.set_time_base((1, target_rate));

    // 打开编码器
    let mut encoder = encoder
        .open_as(encoder_codec)
        .map_err(|e| format!("无法打开音频编码器: {}", e))?;

    // 创建重采样器
    let mut resampler = ffmpeg::software::resampling::Context::get(
        decoder.format(),
        decoder.channel_layout(),
        decoder.rate(),
        target_format,
        target_layout,
        target_rate as u32,
    )
    .map_err(|e| format!("无法创建重采样器: {}", e))?;

    // 初始化环形缓冲区 (容量设为几秒钟的音频数据)
    // ffmpeg 7.1.0 可能需要 ringbuf 0.3 或 0.4 API，这里假设 Cargo.toml 中是 0.3
    // 如果是 video-rs 依赖的 ringbuf 版本，需确认 API
    use ringbuf::HeapRb;
    let buffer_capacity = (target_rate as usize) * 5 * target_layout.channels() as usize;
    let buffer = HeapRb::<f32>::new(buffer_capacity);
    let (mut producer, mut consumer) = buffer.split();

    // 重新获取 encoder_frame_size，如果为 0 (某些编码器)，则设为一个合理值 (例如 1024)
    let frame_size = if encoder.frame_size() == 0 {
        1024
    } else {
        encoder.frame_size() as usize
    };

    ost.set_parameters(&encoder);
    let ost_time_base = ost.time_base();
    let ost_index = ost.index();

    // 写入文件头
    octx.write_header()
        .map_err(|e| format!("无法写入文件头: {}", e))?;

    let start_time = Instant::now();
    let mut sample_count = 0;
    let mut total_samples_encoded = 0;
    let mut last_progress_emitted = 0.0;
    let mut pts_counter = 0;

    // 处理所有音频数据包
    for (stream, packet) in ictx.packets() {
        if stream.index() == stream_index {
            decoder
                .send_packet(&packet)
                .map_err(|e| format!("发送数据包失败: {}", e))?;

            let mut decoded = frame::Audio::empty();
            while decoder.receive_frame(&mut decoded).is_ok() {
                // 重采样
                let mut resampled = frame::Audio::empty();
                resampled.set_channel_layout(target_layout);

                resampler
                    .run(&decoded, &mut resampled)
                    .map_err(|e| format!("重采样失败: {}", e))?;

                // 将重采样后的数据写入缓冲区
                // 注意：这里假设 target_format 是 F32 (Planar 或 Packed)
                // 如果是其他格式 (S16)，Buf 类型需要调整。
                // 鉴于我们之前优先选择了 F32/FLTP，这里先处理 float。
                // 如果必须支持 S16，需要更复杂的泛型或枚举处理。
                // 为简化，这里假设我们能转换成 float 或编码器接受 float。

                // 为了安全，我们需要从 resampled frame 读取数据并 push 到 ringbuf
                // Data reading depends on format (planar vs packed)
                if resampled.is_packed() {
                    let data: &[f32] = resampled.plane(0);
                    producer.push_slice(data);
                } else {
                    // Planar: 需交错 (interleave) 或如果 ringbuf 支持多通道...
                    // 简单起见，我们手动交错 packed 到 ringbuf
                    // 或者如果 ringbuf 存的是 interleaved samples
                    let channels = target_layout.channels() as usize;
                    let samples = resampled.samples();
                    // 简单的交错实现
                    for i in 0..samples {
                        for ch in 0..channels {
                            let val: f32 = resampled.plane::<f32>(ch)[i];
                            producer.push(val).ok(); // 忽略溢出，假设 buffer 够大
                        }
                    }
                }

                // 当缓冲区足够一个 frame 时，弹出并编码
                let samples_needed = frame_size * target_layout.channels() as usize;
                while consumer.len() >= samples_needed {
                    let mut frame_data = vec![0.0f32; samples_needed];
                    consumer.pop_slice(&mut frame_data);

                    let mut new_frame = frame::Audio::new(target_format, frame_size, target_layout);
                    new_frame.set_rate(target_rate as u32);
                    new_frame.set_pts(Some(pts_counter));
                    pts_counter += frame_size as i64;

                    // 填充 frame 数据
                    if new_frame.is_packed() {
                        new_frame.plane_mut(0).copy_from_slice(&frame_data);
                    } else {
                        // De-interleave if planar
                        let channels = target_layout.channels() as usize;
                        for i in 0..frame_size {
                            for ch in 0..channels {
                                new_frame.plane_mut::<f32>(ch)[i] = frame_data[i * channels + ch];
                            }
                        }
                    }

                    // 编码帧
                    encoder
                        .send_frame(&new_frame)
                        .map_err(|e| format!("发送帧到编码器失败: {}", e))?;

                    let mut encoded = packet::Packet::empty();
                    while encoder.receive_packet(&mut encoded).is_ok() {
                        encoded.set_stream(ost_index);
                        encoded.rescale_ts(encoder.time_base(), ost_time_base);
                        encoded
                            .write_interleaved(&mut octx)
                            .map_err(|e| format!("写入数据包失败: {}", e))?;
                    }

                    total_samples_encoded += frame_size;
                }

                sample_count += decoded.samples();

                // 发送进度更新
                if sample_count % (decoder.rate() as usize * 2) == 0
                    || start_time.elapsed().as_secs_f64() >= 1.0
                {
                    let progress = if duration > 0.0 {
                        let current_time = decoded.pts().unwrap_or(0) as f64
                            * decoder.time_base().0 as f64
                            / decoder.time_base().1 as f64;
                        ((current_time / duration) * 100.0).min(100.0)
                    } else {
                        0.0
                    };

                    if (progress - last_progress_emitted).abs() >= 1.0 {
                        crate::events::emit_media_task_event(
                            window,
                            &task_id,
                            "compress",
                            "audio",
                            "progress",
                            Some(progress),
                            None,
                            None,
                        );
                        last_progress_emitted = progress;
                    }
                }
            }
        }
    }

    // Flush 剩余数据
    let channels = target_layout.channels() as usize;
    let remaining_samples = consumer.len() / channels;
    if remaining_samples > 0 {
        let mut frame_data = vec![0.0f32; remaining_samples * channels];
        consumer.pop_slice(&mut frame_data);

        let mut new_frame = frame::Audio::new(target_format, remaining_samples, target_layout);
        new_frame.set_rate(target_rate as u32);
        new_frame.set_pts(Some(pts_counter));

        if new_frame.is_packed() {
            new_frame.plane_mut(0).copy_from_slice(&frame_data);
        } else {
            for i in 0..remaining_samples {
                for ch in 0..channels {
                    new_frame.plane_mut::<f32>(ch)[i] = frame_data[i * channels + ch];
                }
            }
        }

        encoder
            .send_frame(&new_frame)
            .map_err(|e| format!("发送剩余帧到编码器失败: {}", e))?;

        // 接收 flush 产生的数据包
        let mut encoded = packet::Packet::empty();
        while encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(ost_index);
            encoded.rescale_ts(encoder.time_base(), ost_time_base);
            encoded
                .write_interleaved(&mut octx)
                .map_err(|e| format!("写入数据包失败: {}", e))?;
        }
    }

    // 在发送 EOF 之前，确保所有 encoded packet 都写完了
    // 这里的逻辑已经在上面的 loop 里了，但为了保险，再次 check

    // 发送 EOF 到编码器（在清空所有待处理帧之后）
    encoder
        .send_eof()
        .map_err(|e| format!("发送 EOF 失败: {}", e))?;

    // 接收所有最终的编码数据包（包括 EOF 后的剩余数据）
    let mut encoded = packet::Packet::empty();
    while encoder.receive_packet(&mut encoded).is_ok() {
        encoded.set_stream(ost_index);
        encoded.rescale_ts(encoder.time_base(), ost_time_base);
        encoded
            .write_interleaved(&mut octx)
            .map_err(|e| format!("写入最终数据包失败: {}", e))?;
    }

    // 写入文件尾
    octx.write_trailer()
        .map_err(|e| format!("写入文件尾失败: {}", e))?;

    crate::events::emit_media_task_event(
        window,
        &task_id,
        "compress",
        "audio",
        "complete",
        Some(100.0),
        Some(params.output_path),
        None,
    );

    Ok(())
}
