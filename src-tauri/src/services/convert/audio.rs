use std::collections::HashMap;
use std::path::Path;

use ffmpeg::format;
use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};

use crate::events::TaskEmitter;
use crate::media_common;
pub use crate::services::convert::audio_transcode::AudioEncodingParams;
use crate::services::convert::audio_transcode::{AudioOutputSummary, AudioTrackProcessor};
use crate::services::ffmpeg::media_info::{self, MediaDetails, StreamDetails};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AudioTrackConfig {
    pub source_stream_index: Option<usize>,
    #[serde(flatten)]
    pub encoding: AudioEncodingParams,
}

#[derive(Debug, Clone)]
struct ResolvedAudioTrack {
    source_stream_index: usize,
    encoding: AudioEncodingParams,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioConversionReport {
    pub output_media: MediaDetails,
}

fn audio_summary_to_stream_details(summary: AudioOutputSummary) -> StreamDetails {
    StreamDetails {
        index: summary.ost_index,
        codec_type: "audio".to_string(),
        codec_name: summary.codec_name,
        codec_long_name: None,
        time_base: summary.time_base,
        pix_fmt: None,
        width: None,
        height: None,
        frame_rate: None,
        channels: summary.channels,
        sample_rate: summary.sample_rate,
        bit_rate: summary.bit_rate,
    }
}

/// 音频转换参数（全部可选，提供默认或沿用原始值）
#[derive(Debug, Clone)]
pub struct AudioConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub format: Option<String>, // mp3, wav, flac, ogg, aac, m4a, opus, wma
    pub codec: Option<String>,  // libmp3lame, pcm_s16le, flac, aac, libopus, wmav2...
    pub bitrate: Option<f32>,   // kbps
    pub sample_rate: Option<u32>, // Hz
    pub channels: Option<u32>,  // 1/2...
    pub bit_depth: Option<u32>, // 16/24/32
    pub quality: Option<u32>,   // 0-10 VBR
    pub use_hardware_acceleration: Option<bool>,
    pub use_ultra_fast_speed: Option<bool>,
    pub audio_tracks: Option<Vec<AudioTrackConfig>>,
}

fn resolve_format(params: &AudioConversionParams) -> String {
    if let Some(fmt) = &params.format {
        return fmt.to_lowercase();
    }
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
    if let Some(c) = codec_override {
        return c.to_string();
    }
    match format {
        "mp3" => "libmp3lame".to_string(),
        "mp2" => "libmp2lame".to_string(),
        "wav" => "pcm_s16le".to_string(),
        "flac" => "flac".to_string(),
        "ogg" => "libvorbis".to_string(),
        "amr" => "libopencore_amrnb".to_string(),
        "ape" => "ape".to_string(),
        "aac" | "m4a" | "m4r" => {
            if use_hw && cfg!(target_os = "macos") {
                "aac_at"
            } else {
                "aac"
            }
        }
        .to_string(),
        "opus" => "libopus".to_string(),
        "wma" => "wmav2".to_string(),
        _ => "libmp3lame".to_string(),
    }
}

fn resolve_audio_tracks(
    params: &AudioConversionParams,
    input_audio_indices: &[usize],
    default_codec: &str,
    is_amr: bool,
) -> Vec<ResolvedAudioTrack> {
    let mut default_encoding = AudioEncodingParams {
        codec: Some(default_codec.to_string()),
        bitrate: params.bitrate,
        sample_rate: params.sample_rate,
        channels: params.channels,
        bit_depth: params.bit_depth,
        quality: params.quality,
    };

    if is_amr {
        default_encoding.sample_rate = Some(8000);
        default_encoding.channels = Some(1);
    }

    if let Some(configs) = &params.audio_tracks {
        let mut resolved = Vec::new();
        for (i, cfg) in configs.iter().enumerate() {
            let source_stream_index = cfg
                .source_stream_index
                .or_else(|| input_audio_indices.get(i).copied())
                .unwrap_or_else(|| *input_audio_indices.first().unwrap_or(&0));
            let mut encoding = AudioEncodingParams {
                codec: cfg
                    .encoding
                    .codec
                    .clone()
                    .or(default_encoding.codec.clone()),
                bitrate: cfg.encoding.bitrate.or(default_encoding.bitrate),
                sample_rate: cfg.encoding.sample_rate.or(default_encoding.sample_rate),
                channels: cfg.encoding.channels.or(default_encoding.channels),
                bit_depth: cfg.encoding.bit_depth.or(default_encoding.bit_depth),
                quality: cfg.encoding.quality.or(default_encoding.quality),
            };
            if is_amr {
                encoding.sample_rate = Some(8000);
                encoding.channels = Some(1);
            }
            resolved.push(ResolvedAudioTrack {
                source_stream_index,
                encoding,
            });
        }
        resolved
    } else {
        input_audio_indices
            .iter()
            .map(|&idx| ResolvedAudioTrack {
                source_stream_index: idx,
                encoding: default_encoding.clone(),
            })
            .collect()
    }
}

fn can_stream_copy_track(
    track: &ResolvedAudioTrack,
    ist: &format::stream::Stream,
    _output_format: &str,
) -> bool {
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

fn try_stream_copy_audio<E: TaskEmitter>(
    emitter: &E,
    ictx: &mut format::context::Input,
    octx: &mut format::context::Output,
    resolved_tracks: &[ResolvedAudioTrack],
    output_format: &str,
    duration: f64,
    output_path: &str,
) -> Result<Option<AudioConversionReport>, String> {
    if resolved_tracks.is_empty() {
        return Ok(None);
    }

    let mut stream_mapping: HashMap<usize, usize> = HashMap::new();
    for track in resolved_tracks {
        if stream_mapping.contains_key(&track.source_stream_index) {
            // Duplicate input stream mapping means this path cannot be a plain remux copy.
            return Ok(None);
        }
        let ist = match ictx.stream(track.source_stream_index) {
            Some(s) => s,
            None => return Ok(None),
        };
        if ist.parameters().medium() != ffmpeg::media::Type::Audio {
            return Ok(None);
        }
        if !can_stream_copy_track(track, &ist, output_format) {
            return Ok(None);
        }

        let mut ost = octx
            .add_stream(ffmpeg::encoder::find(ffmpeg::codec::Id::None))
            .map_err(|e| format!("添加输出音频流失败: {}", e));
        let Ok(ref mut ost) = ost else {
            return Ok(None);
        };
        ost.set_parameters(ist.parameters());
        unsafe {
            (*ost.parameters().as_mut_ptr()).codec_tag = 0;
        }
        stream_mapping.insert(track.source_stream_index, ost.index());
    }

    if stream_mapping.is_empty() {
        return Ok(None);
    }

    if octx.write_header().is_err() {
        return Ok(None);
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

    if !Path::new(output_path).exists() {
        return Err(format!("转换完成但输出文件不存在: {}", output_path));
    }

    let output_media = media_info::get_media_details(output_path)?;
    log::info!("音频转换完成(直拷贝): {}", output_path);
    Ok(Some(AudioConversionReport { output_media }))
}

/// 执行音频转换（使用共享音频转码管线）
pub fn convert_audio<E: TaskEmitter>(
    emitter: E,
    params: AudioConversionParams,
) -> Result<AudioConversionReport, String> {
    media_common::ensure_ffmpeg_init()?;

    let use_hw = params.use_hardware_acceleration.unwrap_or(false);
    let output_format = resolve_format(&params);
    let codec_name = map_codec_name(&output_format, params.codec.as_deref(), use_hw);
    let is_amr = output_format == "amr" || codec_name.contains("amr");

    emitter.emit("progress", Some(0.0), None, None);
    let duration = media_common::get_audio_duration(&params.input_path)?;

    let mut ictx =
        format::input(&params.input_path).map_err(|e| format!("打开输入文件失败: {}", e))?;
    let mut octx = open_output_context(&params.output_path, &output_format)?;

    let input_audio_indices: Vec<usize> = ictx
        .streams()
        .filter(|s| s.parameters().medium() == ffmpeg::media::Type::Audio)
        .map(|s| s.index())
        .collect();
    if input_audio_indices.is_empty() {
        return Err("未找到音频流".to_string());
    }

    let resolved_tracks = resolve_audio_tracks(&params, &input_audio_indices, &codec_name, is_amr);
    if resolved_tracks.is_empty() {
        return Err("未解析出可用的音频轨道配置".to_string());
    }

    if let Some(report) = try_stream_copy_audio(
        &emitter,
        &mut ictx,
        &mut octx,
        &resolved_tracks,
        &output_format,
        duration,
        &params.output_path,
    )? {
        return Ok(report);
    }

    if params.use_ultra_fast_speed.unwrap_or(false) {
        log::debug!(
            "convert_audio: use_ultra_fast_speed currently not applied in shared audio pipeline"
        );
    }

    let mut processors: Vec<AudioTrackProcessor> = Vec::new();
    let mut ost_time_bases: Vec<ffmpeg::Rational> = Vec::new();

    for track in &resolved_tracks {
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

        let processor = AudioTrackProcessor::new(&ist, &mut octx, &track.encoding, 0)?;
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
                .process_packet(&pkt, stream.time_base(), ost_time_bases[idx], &mut octx)
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
            .finish(ost_time_bases[idx], &mut octx)
            .map_err(|e| {
                format!(
                    "结束音频流失败(ist={}): {}",
                    processor.source_stream_index, e
                )
            })?;
    }
    octx.write_trailer()
        .map_err(|e| format!("写入文件尾失败: {}", e))?;

    emitter.emit(
        "complete",
        Some(100.0),
        Some(params.output_path.clone()),
        None,
    );

    if !Path::new(&params.output_path).exists() {
        return Err(format!("转换完成但输出文件不存在: {}", params.output_path));
    }

    let mut total_written_bytes: u64 = 0;
    let mut streams: Vec<StreamDetails> = Vec::new();
    for processor in &processors {
        total_written_bytes = total_written_bytes.saturating_add(processor.written_bytes());
        streams.push(audio_summary_to_stream_details(processor.output_summary()));
    }
    streams.sort_by_key(|s| s.index);

    let output_media = MediaDetails {
        path: params.output_path.clone(),
        extension: Path::new(&params.output_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default(),
        format_names: output_format.clone(),
        format_long_name: None,
        duration,
        size: total_written_bytes,
        streams,
        tags: HashMap::new(),
        stream_tags: Vec::new(),
    };

    log::info!(
        "音频转换完成: {} (数据包={})",
        params.output_path,
        packets_processed
    );
    Ok(AudioConversionReport { output_media })
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
