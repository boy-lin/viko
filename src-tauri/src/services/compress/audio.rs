use ffmpeg::{format, media};
use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::events::TaskEmitter;
use crate::media_common;
use crate::media_common::audio_transcode::{
    AudioEncodingParams, build_transcode_track, run_audio_transcode,
};
use crate::services::ffmpeg::media_info::{self, MediaDetails};

#[derive(Deserialize)]
pub struct AudioCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub format: Option<String>,
    #[serde(flatten)]
    pub encoding: AudioEncodingParams,
    pub remove_silence: Option<bool>,
    pub silence_threshold: Option<f32>,
    pub volume_gain: Option<f32>,
}

fn resolve_output_path_by_format(output_path: &str, format: Option<&str>) -> String {
    let Some(fmt) = format.map(|f| f.trim().to_lowercase()) else {
        return output_path.to_string();
    };
    if fmt.is_empty() {
        return output_path.to_string();
    }

    let mut path = PathBuf::from(output_path);
    let ext_matches = Path::new(output_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case(&fmt))
        .unwrap_or(false);
    if ext_matches {
        return output_path.to_string();
    }

    path.set_extension(&fmt);
    path.to_string_lossy().to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioCompressionReport {
    pub output_media: MediaDetails,
}

fn apply_volume_and_silence(
    frame: &mut ffmpeg::frame::Audio,
    volume_gain_db: f32,
    remove_silence: bool,
    silence_db: f32,
) -> bool {
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
                std::slice::from_raw_parts_mut(data.as_mut_ptr() as *mut f32, frame.samples())
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
                frame.samples() * frame.channels() as usize,
            )
        };
        for s in samples.iter_mut() {
            *s *= gain;
            max_amp = max_amp.max(s.abs());
        }
    }

    if remove_silence && max_amp < silence_amp {
        return false;
    }
    true
}

pub fn compress_audio_file<E: TaskEmitter>(
    emitter: E,
    params: AudioCompressionParams,
) -> Result<AudioCompressionReport, String> {
    media_common::ensure_ffmpeg_init()?;
    let mut params = params;
    params.output_path = resolve_output_path_by_format(&params.output_path, params.format.as_deref());
    params.output_path = media_common::ensure_unique_output_path(&params.output_path);

    let mut ictx =
        format::input(&params.input_path).map_err(|e| format!("无法打开输入文件: {}", e))?;
    let mut octx =
        format::output(&params.output_path).map_err(|e| format!("无法创建输出文件: {}", e))?;

    let audio_stream = ictx
        .streams()
        .best(media::Type::Audio)
        .ok_or("未找到音频流")?;
    let source_stream_index = audio_stream.index();
    emitter.emit("progress", Some(0.0), None, None);

    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;
    let tracks = vec![build_transcode_track(source_stream_index, params.encoding.clone())];
    let _run_report = run_audio_transcode(
        &emitter,
        &mut ictx,
        &mut octx,
        &tracks,
        duration,
        0,
        |_track_index, resampled| {
            Ok(apply_volume_and_silence(
                resampled,
                params.volume_gain.unwrap_or(0.0),
                params.remove_silence.unwrap_or(false),
                params.silence_threshold.unwrap_or(-50.0),
            ))
        },
    )?;

    emitter.emit(
        "complete",
        Some(100.0),
        Some(params.output_path.clone()),
        None,
    );

    if !std::path::Path::new(&params.output_path).exists() {
        return Err(format!(
            "压缩完成但输出文件不存在: {}",
            params.output_path
        ));
    }

    let output_media = media_info::get_media_details(&params.output_path)?;
    Ok(AudioCompressionReport { output_media })
}
