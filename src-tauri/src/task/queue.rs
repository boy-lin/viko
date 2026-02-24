use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::commands::{
    AudioCompressionArgs, AudioConversionArgs, GifConversionArgs, ImageCompressionArgs,
    VideoCompressionArgs, VideoConversionArgs,
};
use crate::events;
use crate::events::TaskEmitter;
use crate::services::convert::audio::{self, AudioConversionParams};
use crate::services::convert::gif::{self, GifConversionParams};
use crate::services::convert::image::{self, ImageConversionParams};
use crate::services::convert::video::{self, VideoConversionParams};
use crate::services::media_tools::thumbnail::{ThumbnailOptions};
use crate::shared::get_millis;
use crate::storage::media_queue;
use crate::storage::task_history::{self, TaskHistoryItem};
use crate::task::cancel;

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(tag = "kind", content = "args")]
pub enum MediaTaskRequest {
    #[serde(rename = "convert-audio")]
    ConvertAudio(AudioConversionArgs),
    #[serde(rename = "convert-video")]
    ConvertVideo(VideoConversionArgs),
    #[serde(rename = "convert-gif")]
    ConvertGif(GifConversionArgs),
    #[serde(rename = "convert-image")]
    ConvertImage(ImageConversionParams),
    #[serde(rename = "compress-video")]
    CompressVideo(VideoCompressionArgs),
    #[serde(rename = "compress-audio")]
    CompressAudio(AudioCompressionArgs),
    #[serde(rename = "compress-image")]
    CompressImage(ImageCompressionArgs),
    #[serde(rename = "watermark")]
    Watermark(VideoConversionArgs),
}

static TASK_RUNNING: AtomicBool = AtomicBool::new(false);
static CURRENT_TASK_KIND: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_TASK_ID: Mutex<Option<String>> = Mutex::new(None);

fn task_kind(task: &MediaTaskRequest) -> &'static str {
    match task {
        MediaTaskRequest::ConvertAudio(_) => "convert-audio",
        MediaTaskRequest::ConvertVideo(_) => "convert-video",
        MediaTaskRequest::ConvertGif(_) => "convert-gif",
        MediaTaskRequest::ConvertImage(_) => "convert-image",
        MediaTaskRequest::CompressVideo(_) => "compress-video",
        MediaTaskRequest::CompressAudio(_) => "compress-audio",
        MediaTaskRequest::CompressImage(_) => "compress-image",
        MediaTaskRequest::Watermark(_) => "watermark",
    }
}

fn task_id(task: &MediaTaskRequest) -> Option<String> {
    match task {
        MediaTaskRequest::ConvertAudio(args) => Some(args.task_id.clone()),
        MediaTaskRequest::ConvertVideo(args) => Some(args.task_id.clone()),
        MediaTaskRequest::ConvertGif(args) => Some(args.task_id.clone()),
        MediaTaskRequest::ConvertImage(args) => Some(args.task_id.clone()),
        MediaTaskRequest::CompressVideo(args) => Some(args.task_id.clone()),
        MediaTaskRequest::CompressAudio(args) => Some(args.task_id.clone()),
        MediaTaskRequest::CompressImage(args) => Some(args.task_id.clone()),
        MediaTaskRequest::Watermark(args) => Some(args.task_id.clone()),
    }
}

pub async fn submit_tasks(app: AppHandle, tasks: Vec<MediaTaskRequest>) -> Result<usize, String> {
    for task in tasks {
        media_queue::enqueue(&task).await.map_err(|e| {
            println!("enqueue err: {e}");
            e.to_string()
        })?;
    }
    let pending = media_queue::count().await.map_err(|e| {
        println!("count err: {e}");
        e.to_string()
    })?;
    start_worker(app);
    Ok(pending)
}

pub async fn has_running(task_type: Option<String>) -> bool {
    if task_type.is_none() {
        if TASK_RUNNING.load(Ordering::SeqCst) {
            return true;
        }
        return media_queue::count().await.map(|c| c > 0).unwrap_or(false);
    }

    let task_type = task_type.unwrap_or_default();

    if TASK_RUNNING.load(Ordering::SeqCst) {
        let current = CURRENT_TASK_KIND.lock().unwrap();
        if current.as_deref() == Some(task_type.as_str()) {
            return true;
        }
    }

    media_queue::count_by_type(&task_type)
        .await
        .map(|c| c > 0)
        .unwrap_or(false)
}

pub async fn clear_pending(task_type: Option<String>) -> Result<usize, String> {
    clear_pending_with_cancel(task_type, false).await
}

pub async fn clear_pending_with_cancel(
    task_type: Option<String>,
    stop_running: bool,
) -> Result<usize, String> {
    if stop_running {
        if let Some(t_type) = task_type.as_ref() {
            let current = CURRENT_TASK_KIND.lock().unwrap();
            if current.as_deref() == Some(t_type.as_str()) {
                cancel::request_cancel();
            }
        } else {
            cancel::request_cancel();
        }
    }

    if let Some(task_type) = task_type {
        return media_queue::clear_by_type(&task_type)
            .await
            .map_err(|e| e.to_string());
    }

    let count = media_queue::count().await.map_err(|e| e.to_string())?;
    media_queue::clear().await.map_err(|e| e.to_string())?;
    Ok(count)
}

pub async fn cancel_task(task_id: String) -> Result<(), String> {
    {
        let current = CURRENT_TASK_ID.lock().unwrap();
        if current.as_deref() == Some(task_id.as_str()) {
            cancel::request_cancel();
        }
    }
    media_queue::remove_by_task_id(&task_id)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn start_worker(app: AppHandle) {
    println!("start_worker");
    if TASK_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        loop {
            let task = match media_queue::dequeue().await {
                Ok(t) => t,
                Err(e) => {
                    log::error!("Failed to dequeue task: {}", e);
                    None
                }
            };
            println!("task: {:?}", task);
            match task {
                Some(task) => {
                    let kind = task_kind(&task).to_string();
                    let id = task_id(&task);
                    *CURRENT_TASK_KIND.lock().unwrap() = Some(kind);
                    *CURRENT_TASK_ID.lock().unwrap() = id;
                    cancel::reset_cancel();
                    // Run execution in blocking thread to avoid stalling async runtime
                    let app_clone = app.clone();
                    // We spawn a blocking task to handle the actual processing
                    // This allows valid mixing of async and sync code without blocking the main runtime
                    let result = tauri::async_runtime::spawn_blocking(move || {
                        if let Err(err) = execute_task(&app_clone, task) {
                            log::error!("media task failed: {}", err);
                        }
                    })
                    .await;

                    if let Err(e) = result {
                        log::error!("Worker thread join error: {}", e);
                    }
                    *CURRENT_TASK_KIND.lock().unwrap() = None;
                    *CURRENT_TASK_ID.lock().unwrap() = None;
                    cancel::reset_cancel();
                }
                None => {
                    println!("No task found, breaking loop");
                    TASK_RUNNING.store(false, Ordering::SeqCst);
                    *CURRENT_TASK_KIND.lock().unwrap() = None;
                    *CURRENT_TASK_ID.lock().unwrap() = None;
                    cancel::reset_cancel();
                    let count = media_queue::count().await.unwrap_or(0);
                    if count == 0 {
                        break;
                    }
                    if !TASK_RUNNING.swap(true, Ordering::SeqCst) {
                        continue;
                    }
                }
            }
        }
    });
}

fn execute_task(app: &AppHandle, task: MediaTaskRequest) -> Result<(), String> {
    println!("execute_task: {:?}", task);
    match task {
        MediaTaskRequest::ConvertAudio(args) => run_convert_audio(app, args),
        MediaTaskRequest::ConvertVideo(args) => run_convert_video(app, args),
        MediaTaskRequest::ConvertGif(args) => run_convert_gif(app, args),
        MediaTaskRequest::ConvertImage(args) => run_convert_image(app, args),
        MediaTaskRequest::CompressVideo(args) => run_compress_video(app, args),
        MediaTaskRequest::CompressAudio(args) => run_compress_audio(app, args),
        MediaTaskRequest::CompressImage(args) => run_compress_image(app, args),
        MediaTaskRequest::Watermark(args) => run_watermark_video(app, args),
    }
}

fn run_convert_audio(app: &AppHandle, args: AudioConversionArgs) -> Result<(), String> {
    let resolved_format = if args.format.trim().is_empty() {
        Path::new(&args.input_path)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| "mp3".to_string())
    } else {
        args.format.to_lowercase()
    };

    let output_path = if let Some(path) = args.output_path.as_ref() {
        path.clone()
    } else {
        audio::generate_output_path(&args.input_path, &resolved_format)?
    };

    let start_time = get_millis();
    record_history_start(
        args.task_id.clone(),
        "convert-audio".into(),
        "audio".into(),
        args.input_path.clone(),
        output_path.clone(),
        start_time,
        &args,
    );

    let params = AudioConversionParams {
        input_path: args.input_path.clone(),
        output_path: output_path.clone(),
        format: Some(resolved_format),
        codec: args.codec.clone(),
        bitrate: args.bitrate,
        sample_rate: args.sample_rate,
        channels: args.channels,
        bit_depth: args.bit_depth,
        quality: args.quality,
        use_hardware_acceleration: args.use_hardware_acceleration,
        use_ultra_fast_speed: args.use_ultra_fast_speed,
        audio_tracks: args.audio_tracks.clone(),
    };

    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| "audio".to_string());
    let emitter = events::window_emitter(
        app,
        args.task_id.clone(),
        "convert-audio".into(),
        file_type,
    )?;

    let result = audio::convert_audio(emitter.clone(), params);
    let (error, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (Some(e), serde_json::to_value(&args).ok(), None)
        }
    };

    record_history(
        args.task_id.clone(),
        "convert-audio".into(),
        "audio".into(),
        args.input_path.clone(),
        output_path,
        start_time,
        error,
        args,
        effective_params,
        output_size_hint,
    );

    Ok(())
}

fn run_convert_video(app: &AppHandle, args: VideoConversionArgs) -> Result<(), String> {
    run_convert_video_with_task_type(app, args, "convert-video")
}

fn run_watermark_video(app: &AppHandle, args: VideoConversionArgs) -> Result<(), String> {
    run_convert_video_with_task_type(app, args, "watermark")
}

fn run_convert_video_with_task_type(
    app: &AppHandle,
    args: VideoConversionArgs,
    task_type: &str,
) -> Result<(), String> {
    println!("run_convert_video: {:?}", args);
    let resolved_format = args
        .format
        .clone()
        .or_else(|| {
            Path::new(&args.input_path)
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
        })
        .unwrap_or_else(|| "mp4".to_string());

    let output_path = if let Some(path) = args.output_path.as_ref() {
        path.clone()
    } else {
        let path = Path::new(&args.input_path);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        parent
            .join(format!("{}.{}", stem, resolved_format))
            .to_string_lossy()
            .to_string()
    };

    let start_time = get_millis();
    record_history_start(
        args.task_id.clone(),
        task_type.into(),
        "video".into(),
        args.input_path.clone(),
        output_path.clone(),
        start_time,
        &args,
    );

    let params = VideoConversionParams {
        input_path: args.input_path.clone(),
        output_path: output_path.clone(),
        format: args.format.clone().or(Some(resolved_format)),
        video_encoder: args.video_encoder.clone(),
        video_bitrate: args.video_bitrate,
        min_bitrate: args.min_bitrate,
        max_bitrate: args.max_bitrate,
        rc_mode: args.rc_mode.clone(),
        crf: args.crf,
        resolution: args.resolution.clone(),
        aspect_ratio: args.aspect_ratio.clone(),
        scaling_mode: args.scaling_mode.clone(),
        frame_rate: args.frame_rate.clone(),
        gop_size: args.gop_size,
        preset: args.preset.clone(),
        profile: args.profile.clone(),
        tune: args.tune.clone(),
        color_space: args.color_space.clone(),
        bit_depth: args.bit_depth,
        crop: args.crop.clone(),
        audio_tracks: args.audio_tracks.clone(),
        default_audio_params: args.default_audio_params.clone(),
        audio_encoder: args.audio_encoder.clone(),
        use_hardware_acceleration: args.use_hardware_acceleration.unwrap_or(false),
        use_ultra_fast_speed: args.use_ultra_fast_speed.unwrap_or(false),
        watermark: args.watermark.clone(),
    };

    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| "video".to_string());
    let emitter = events::window_emitter(app, args.task_id.clone(), task_type.into(), file_type)?;

    let result = video::convert_video(emitter.clone(), params);
    let (error, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (Some(e), serde_json::to_value(&args).ok(), None)
        }
    };

    record_history(
        args.task_id.clone(),
        task_type.into(),
        "video".into(),
        args.input_path.clone(),
        output_path,
        start_time,
        error,
        args,
        effective_params,
        output_size_hint,
    );

    Ok(())
}

fn run_convert_gif(app: &AppHandle, args: GifConversionArgs) -> Result<(), String> {
    let output_path = if let Some(path) = args.output_path.as_ref() {
        path.clone()
    } else {
        let path = Path::new(&args.input_path);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        parent
            .join(format!("{}.gif", stem))
            .to_string_lossy()
            .to_string()
    };

    let start_time = get_millis();
    record_history_start(
        args.task_id.clone(),
        "convert-gif".into(),
        "gif".into(),
        args.input_path.clone(),
        output_path.clone(),
        start_time,
        &args,
    );

    let params = GifConversionParams {
        input_path: args.input_path.clone(),
        output_path: output_path.clone(),
        width: args.width,
        height: args.height,
        quality: args.quality,
        preserve_transparency: args.preserve_transparency,
        color_mode: args.color_mode.clone(),
        dpi: args.dpi,
        frame_rate: args.frame_rate,
        loop_count: args.loop_count,
        frame_delay: args.frame_delay,
        colors: args.colors,
        preserve_extensions: args.preserve_extensions,
        sharpen: args.sharpen,
        denoise: args.denoise,
    };

    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| "video".to_string());
    let emitter =
        events::window_emitter(app, args.task_id.clone(), "convert-gif".into(), file_type)?; // GIF treated as video/image hybrid.

    let result = gif::convert_video_to_gif(emitter.clone(), params);
    let (error, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (Some(e), serde_json::to_value(&args).ok(), None)
        }
    };

    record_history(
        args.task_id.clone(),
        "convert-gif".into(),
        "gif".into(),
        args.input_path.clone(),
        output_path,
        start_time,
        error,
        args,
        effective_params,
        output_size_hint,
    );

    Ok(())
}

fn run_convert_image(app: &AppHandle, mut args: ImageConversionParams) -> Result<(), String> {
    if args.output_path.is_empty() {
        let format = if args.format.is_empty() {
            "jpg".to_string()
        } else {
            args.format.clone()
        };
        if args.format.is_empty() {
            args.format = format.clone();
        }
        let path = Path::new(&args.input_path);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        args.output_path = parent
            .join(format!("{}.{}", stem, format))
            .to_string_lossy()
            .to_string();
    }

    let task_id = if args.task_id.is_empty() {
        "unknown".to_string()
    } else {
        args.task_id.clone()
    };

    let start_time = get_millis();
    record_history_start(
        task_id.clone(),
        "convert-image".into(),
        "image".into(),
        args.input_path.clone(),
        args.output_path.clone(),
        start_time,
        &args,
    );

    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| "image".to_string());
    let emitter = events::window_emitter(app, task_id.clone(), "convert-image".into(), file_type)?;

    let result =
        tauri::async_runtime::block_on(image::convert_image_file_with_report(args.clone()));

    let (error, final_output_path, effective_params, output_size_hint) = match result {
        Ok(report) => {
            let path = report.output_media.path.clone();
            let size = report.output_media.size as i64;
            let effective = serde_json::to_value(&report).ok();
            emitter.emit("complete", Some(100.0), Some(path.clone()), None);
            (None, path, effective, Some(size))
        }
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (
                Some(e),
                args.output_path.clone(),
                serde_json::to_value(&args).ok(),
                None,
            )
        }
    };

    record_history(
        task_id,
        "convert-image".into(),
        "image".into(),
        args.input_path.clone(),
        final_output_path,
        start_time,
        error,
        args,
        effective_params,
        output_size_hint,
    );

    Ok(())
}

fn run_compress_video(app: &AppHandle, args: VideoCompressionArgs) -> Result<(), String> {
    let start_time = get_millis();
    record_history_start(
        args.task_id.clone(),
        "compress-video".into(),
        "video".into(),
        args.input_path.clone(),
        args.output_path.clone(),
        start_time,
        &args,
    );

    let params = crate::services::compress::video::VideoCompressionParams {
        input_path: args.input_path.clone(),
        output_path: args.output_path.clone(),
        width: args.width,
        height: args.height,
        bitrate: args.bitrate,
        frame_rate: args.frame_rate,
        codec: args.codec.clone(),
        keyframe_interval: args.keyframe_interval,
        color_depth: args.color_depth,
        aspect_ratio: args.aspect_ratio.clone(),
        remove_audio: args.remove_audio,
        audio_bitrate: args.audio_bitrate,
        preset: args.preset.clone(),
        use_hardware_acceleration: args.use_hardware_acceleration,
    };

    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| "video".to_string());
    let emitter = events::window_emitter(
        app,
        args.task_id.clone(),
        "compress-video".into(),
        file_type,
    )?;

    let result = crate::services::compress::video::compress_video_file(emitter.clone(), params);
    let (error, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (Some(e), serde_json::to_value(&args).ok(), None)
        }
    };

    record_history(
        args.task_id.clone(),
        "compress-video".into(),
        "video".into(),
        args.input_path.clone(),
        args.output_path.clone(),
        start_time,
        error,
        args,
        effective_params,
        output_size_hint,
    );

    Ok(())
}

fn run_compress_audio(app: &AppHandle, args: AudioCompressionArgs) -> Result<(), String> {
    let start_time = get_millis();
    record_history_start(
        args.task_id.clone(),
        "compress-audio".into(),
        "audio".into(),
        args.input_path.clone(),
        args.output_path.clone(),
        start_time,
        &args,
    );

    let params = crate::services::compress::audio::AudioCompressionParams {
        input_path: args.input_path.clone(),
        output_path: args.output_path.clone(),
        sample_rate: args.sample_rate,
        bitrate: args.bitrate,
        codec: args.codec.clone(),
        channels: args.channels,
        bit_depth: args.bit_depth,
        remove_silence: args.remove_silence,
        silence_threshold: args.silence_threshold,
        volume_gain: args.volume_gain,
    };

    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| "audio".to_string());
    let emitter = events::window_emitter(
        app,
        args.task_id.clone(),
        "compress-audio".into(),
        file_type,
    )?;

    let result = crate::services::compress::audio::compress_audio_file(emitter.clone(), params);
    let (error, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (Some(e), serde_json::to_value(&args).ok(), None)
        }
    };

    record_history(
        args.task_id.clone(),
        "compress-audio".into(),
        "audio".into(),
        args.input_path.clone(),
        args.output_path.clone(),
        start_time,
        error,
        args,
        effective_params,
        output_size_hint,
    );

    Ok(())
}

fn run_compress_image(app: &AppHandle, args: ImageCompressionArgs) -> Result<(), String> {
    let start_time = get_millis();
    record_history_start(
        args.task_id.clone(),
        "compress-image".into(),
        "image".into(),
        args.input_path.clone(),
        args.output_path.clone(),
        start_time,
        &args,
    );

    let params = crate::services::compress::image::ImageCompressionParams {
        input_path: args.input_path.clone(),
        output_path: args.output_path.clone(),
        quality: args.quality,
        format: args.format.clone(),
        width: args.width,
        height: args.height,
        color_mode: args.color_mode.clone(),
        strip_metadata: args.strip_metadata,
        keep_transparency: args.keep_transparency,
        dpi: args.dpi,
        crop_whitespace: args.crop_whitespace,
    };

    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| "image".to_string());
    let emitter = events::window_emitter(
        app,
        args.task_id.clone(),
        "compress-image".into(),
        file_type,
    )?;

    let result = crate::services::compress::image::compress_image_file(emitter.clone(), params);
    let (error, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (Some(e), serde_json::to_value(&args).ok(), None)
        }
    };

    record_history(
        args.task_id.clone(),
        "compress-image".into(),
        "image".into(),
        args.input_path.clone(),
        args.output_path.clone(),
        start_time,
        error,
        args,
        effective_params,
        output_size_hint,
    );

    Ok(())
}

fn record_history<T: Serialize + Send + Sync + 'static>(
    id: String,
    task_type: String,
    media_type: String,
    input_path: String,
    output_path: String,
    start_time: i64,
    error: Option<String>,
    args: T,
    effective_params: Option<serde_json::Value>,
    _output_size_hint: Option<i64>,
) {
    tauri::async_runtime::spawn(async move {
        let finished_at = get_millis();
        let _duration = finished_at - start_time;

        let result_status = if let Some(ref msg) = error {
            if msg == "Task cancelled" {
                "cancelled"
            } else {
                "error"
            }
        } else {
            "finished"
        };

        let output_media = effective_params
            .as_ref()
            .and_then(|v| v.get("output_media"));
        let output_size = Some(
            output_media
                .and_then(|m| m.get("size"))
                .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|u| u as i64)))
                .unwrap_or(0),
        );
        let output_duration = Some(
            output_media
                .and_then(|m| m.get("duration"))
                .and_then(|v| {
                    v.as_f64()
                        .or_else(|| v.as_i64().map(|i| i as f64))
                        .or_else(|| v.as_u64().map(|u| u as f64))
                })
                .map(|v| format!("{:.3}", v.max(0.0)))
                .unwrap_or_else(|| "0".to_string()),
        );

        let title = Path::new(&output_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string());

        let thumbnail = None;

        let item = TaskHistoryItem {
            id,
            task_type,
            media_type,
            status: result_status.to_string(),
            input_path,
            output_path: Some(output_path),
            output_size,
            output_duration,
            duration: None,
            title,
            thumbnail,
            created_at: start_time,
            finished_at,
            error_message: error,
            task_data: serde_json::to_string(&args).unwrap_or_default(),
            effective_params: effective_params.and_then(|v| serde_json::to_string(&v).ok()),
        };

        if let Err(e) = task_history::add_history(&item).await {
            log::error!("Failed to save task history: {}", e);
        }
    });
}

fn record_history_start<T: Serialize + Send + Sync + 'static>(
    id: String,
    task_type: String,
    media_type: String,
    input_path: String,
    output_path: String,
    start_time: i64,
    args: &T,
) {
    let task_data = serde_json::to_string(args).unwrap_or_default();
    tauri::async_runtime::spawn(async move {
        let title = Path::new(&output_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .or_else(|| {
                Path::new(&input_path)
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
            });

        let item = TaskHistoryItem {
            id,
            task_type,
            media_type,
            status: "processing".to_string(),
            input_path,
            output_path: Some(output_path),
            output_size: None,
            output_duration: None,
            duration: None,
            title,
            thumbnail: None,
            created_at: start_time,
            finished_at: start_time,
            error_message: None,
            task_data,
            effective_params: None,
        };

        if let Err(e) = task_history::add_history(&item).await {
            log::error!("Failed to save task history start: {}", e);
        }
    });
}
