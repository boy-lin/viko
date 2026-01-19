use std::collections::HashMap;
use std::time::Instant;
use tauri::WebviewWindow;

use ffmpeg::{
    codec, decoder, encoder, filter, format, frame, media, packet, picture, Dictionary, Rational,
};
use ffmpeg_next as ffmpeg;

use crate::audio_converter::AudioEncodingParams;

/// 视频转换参数（全部可选，使用默认值兜底）
#[derive(Debug, Clone)]
pub struct VideoConversionParams {
    pub input_path: String,
    pub output_path: String,
    // 视频参数
    pub format: Option<String>,
    pub video_encoder: Option<String>,
    pub video_bitrate: Option<u32>,
    pub min_bitrate: Option<u32>,
    pub max_bitrate: Option<u32>,
    pub rc_mode: Option<String>,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<String>,
    pub scaling_mode: Option<String>,
    pub frame_rate: Option<String>,
    pub gop_size: Option<u32>,
    pub preset: Option<String>,
    pub profile: Option<String>,
    pub tune: Option<String>,
    pub color_space: Option<String>,
    pub bit_depth: Option<u32>,
    pub crop: Option<String>,
    // 音频参数（多轨）
    pub audio_tracks: Option<Vec<AudioTrackConfig>>,
    pub default_audio_params: Option<AudioEncodingParams>,
    // 通用
    pub use_hardware_acceleration: Option<bool>,
    pub use_ultra_fast_speed: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct AudioTrackConfig {
    pub source_stream_index: Option<usize>,
    #[serde(flatten)]
    pub encoding: AudioEncodingParams,
}

#[derive(Debug, Clone)]
struct ResolvedAudioTrack {
    pub source_stream_index: usize,
    pub encoding: AudioEncodingParams,
}

#[derive(Debug, Clone)]
struct ResolvedVideoParams {
    pub input_path: String,
    pub output_path: String,
    pub format: String,
    pub video_encoder: String,
    pub video_bitrate: Option<u32>,
    pub min_bitrate: Option<u32>,
    pub max_bitrate: Option<u32>,
    pub rc_mode: Option<String>,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<String>,
    pub scaling_mode: Option<String>,
    pub frame_rate: Option<String>,
    pub gop_size: Option<u32>,
    pub preset: Option<String>,
    pub profile: Option<String>,
    pub tune: Option<String>,
    pub color_space: Option<String>,
    pub bit_depth: Option<u32>,
    pub crop: Option<String>,
    pub audio_tracks: Vec<ResolvedAudioTrack>,
    pub use_hardware_acceleration: bool,
    pub use_ultra_fast_speed: bool,
}

fn resolve_audio_tracks(
    params: &VideoConversionParams,
    input_audio_indices: &[usize],
) -> Vec<ResolvedAudioTrack> {
    let default_encoding = params
        .default_audio_params
        .clone()
        .unwrap_or(AudioEncodingParams {
            codec: None,
            bitrate: None,
            sample_rate: None,
            channels: None,
            bit_depth: None,
            quality: None,
        });

    if let Some(configs) = &params.audio_tracks {
        let mut resolved = Vec::new();
        for (i, cfg) in configs.iter().enumerate() {
            let src_idx = cfg
                .source_stream_index
                .or_else(|| input_audio_indices.get(i).copied())
                .unwrap_or(0);
            resolved.push(ResolvedAudioTrack {
                source_stream_index: src_idx,
                encoding: cfg.encoding.clone(),
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

fn resolve_video_params(params: VideoConversionParams, input_audio_indices: &[usize]) -> ResolvedVideoParams {
    let fmt = params
        .format
        .clone()
        .or_else(|| {
            std::path::Path::new(&params.output_path)
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
        })
        .unwrap_or_else(|| "mp4".to_string());

    let video_encoder = params
        .video_encoder
        .clone()
        .unwrap_or_else(|| "h264".to_string());

    let audio_tracks = resolve_audio_tracks(&params, input_audio_indices);

    ResolvedVideoParams {
        input_path: params.input_path,
        output_path: params.output_path,
        format: fmt,
        video_encoder,
        video_bitrate: params.video_bitrate,
        min_bitrate: params.min_bitrate,
        max_bitrate: params.max_bitrate,
        rc_mode: params.rc_mode,
        resolution: params.resolution,
        aspect_ratio: params.aspect_ratio,
        scaling_mode: params.scaling_mode,
        frame_rate: params.frame_rate,
        gop_size: params.gop_size,
        preset: params.preset,
        profile: params.profile,
        tune: params.tune,
        color_space: params.color_space,
        bit_depth: params.bit_depth,
        crop: params.crop,
        audio_tracks,
        use_hardware_acceleration: params.use_hardware_acceleration.unwrap_or(false),
        use_ultra_fast_speed: params.use_ultra_fast_speed.unwrap_or(false),
    }
}
