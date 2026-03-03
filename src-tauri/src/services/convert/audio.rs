use std::collections::HashMap;
use std::path::Path;

use ffmpeg::format;
use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};

use crate::events::TaskEmitter;
use crate::media_common;
pub use crate::media_common::audio_transcode::AudioEncodingParams;
use crate::media_common::audio_transcode::{
    AudioOutputSummary, AudioTranscodeTrack, build_transcode_track, run_audio_transcode,
    try_stream_copy_audio,
};
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
        bit_depth: None,
        bits_per_sample: None,
    }
}

#[derive(Debug, Clone)]
pub struct AudioConversionParams {
    pub input_path: String,
    pub output_path: String,
    pub format: Option<String>,
    pub codec: Option<String>,
    pub bitrate: Option<f32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub bit_depth: Option<u32>,
    pub quality: Option<u32>,
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
                codec: cfg.encoding.codec.clone().or(default_encoding.codec.clone()),
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

pub fn convert_audio<E: TaskEmitter>(
    emitter: E,
    params: AudioConversionParams,
) -> Result<AudioConversionReport, String> {
    media_common::ensure_ffmpeg_init()?;
    let mut params = params;
    params.output_path = media_common::ensure_unique_output_path(&params.output_path);

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

    let tracks: Vec<AudioTranscodeTrack> = resolved_tracks
        .iter()
        .map(|track| build_transcode_track(track.source_stream_index, track.encoding.clone()))
        .collect();

    if try_stream_copy_audio(
        &emitter,
        &mut ictx,
        &mut octx,
        &tracks,
        duration,
        &params.output_path,
    )? {
        if !Path::new(&params.output_path).exists() {
            return Err(format!("转换完成但输出文件不存在: {}", params.output_path));
        }
        let output_media = media_info::get_media_details(&params.output_path)?;
        log::info!("音频转换完成(直拷贝): {}", params.output_path);
        return Ok(AudioConversionReport { output_media });
    }

    if params.use_ultra_fast_speed.unwrap_or(false) {
        log::debug!(
            "convert_audio: use_ultra_fast_speed currently not applied in shared audio pipeline"
        );
    }

    let run_report = run_audio_transcode(
        &emitter,
        &mut ictx,
        &mut octx,
        &tracks,
        duration,
        0,
        |_track_index, _frame| Ok(true),
    )?;

    emitter.emit(
        "complete",
        Some(100.0),
        Some(params.output_path.clone()),
        None,
    );

    if !Path::new(&params.output_path).exists() {
        return Err(format!("转换完成但输出文件不存在: {}", params.output_path));
    }

    let mut streams: Vec<StreamDetails> = Vec::new();
    for summary in run_report.summaries {
        streams.push(audio_summary_to_stream_details(summary));
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
        size: run_report.total_written_bytes,
        streams,
        tags: HashMap::new(),
        stream_tags: Vec::new(),
    };

    log::info!(
        "音频转换完成: {} (数据包={})",
        params.output_path,
        run_report.packets_processed
    );
    Ok(AudioConversionReport { output_media })
}

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
    Ok(media_common::ensure_unique_output_path(
        &output_path.to_string_lossy(),
    ))
}
