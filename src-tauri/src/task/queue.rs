use std::path::Path;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

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
use crate::shared::get_millis;
use crate::storage::media_queue;
use crate::storage::task_history::{self, TaskHistoryItem};
use crate::task::cancel;

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(tag = "type", content = "args")]
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

static WORKER_RUNNING: AtomicBool = AtomicBool::new(false);
static ACTIVE_TASKS: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static ACTIVE_COUNT: AtomicUsize = AtomicUsize::new(0);

fn worker_parallelism() -> usize {
    let env_limit = std::env::var("FIGUREX_TASK_PARALLELISM")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);

    if env_limit > 0 {
        return env_limit.clamp(1, 32);
    }

    let cpus = std::thread::available_parallelism()
        .map(|v| v.get())
        .unwrap_or(4);
    cpus.clamp(2, 8)
}

fn active_task_ids_by_type(task_type: Option<&str>) -> Vec<String> {
    let tasks = ACTIVE_TASKS.lock().unwrap();
    tasks
        .iter()
        .filter_map(|(id, kind)| {
            if task_type.is_none() || Some(kind.as_str()) == task_type {
                Some(id.clone())
            } else {
                None
            }
        })
        .collect()
}

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
        if WORKER_RUNNING.load(Ordering::SeqCst) || ACTIVE_COUNT.load(Ordering::SeqCst) > 0 {
            return true;
        }
        return media_queue::count().await.map(|c| c > 0).unwrap_or(false);
    }

    let task_type = task_type.unwrap_or_default();

    {
        let active = ACTIVE_TASKS.lock().unwrap();
        if active.values().any(|kind| kind == &task_type) {
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
        let target_ids = active_task_ids_by_type(task_type.as_deref());
        for task_id in target_ids {
            cancel::request_cancel_task(&task_id);
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
    if ACTIVE_TASKS.lock().unwrap().contains_key(&task_id) {
        cancel::request_cancel_task(&task_id);
    }
    media_queue::remove_by_task_id(&task_id)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn start_worker(app: AppHandle) {
    println!("start_worker");
    if WORKER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    let max_parallel = worker_parallelism();
    log::info!("media queue worker started with parallelism={}", max_parallel);

    tauri::async_runtime::spawn(async move {
        loop {
            while ACTIVE_COUNT.load(Ordering::SeqCst) < max_parallel {
                let task = match media_queue::dequeue().await {
                    Ok(t) => t,
                    Err(e) => {
                        log::error!("Failed to dequeue task: {}", e);
                        None
                    }
                };

                let Some(task) = task else {
                    break;
                };

                let app_clone = app.clone();
                let kind = task_kind(&task).to_string();
                let id = task_id(&task);

                if let Some(task_id) = id.as_ref() {
                    ACTIVE_TASKS
                        .lock()
                        .unwrap()
                        .insert(task_id.clone(), kind.clone());
                    cancel::clear_cancel_task(task_id);
                }

                ACTIVE_COUNT.fetch_add(1, Ordering::SeqCst);

                tauri::async_runtime::spawn(async move {
                    let id_for_cancel = id.clone();
                    let result = tauri::async_runtime::spawn_blocking(move || {
                        cancel::set_current_task(id_for_cancel.clone());
                        let execute_result = execute_task(&app_clone, task);
                        cancel::clear_current_task();
                        if let Err(err) = execute_result {
                            log::error!("media task failed: {}", err);
                        }
                    })
                    .await;

                    if let Err(e) = result {
                        log::error!("Worker thread join error: {}", e);
                    }

                    if let Some(task_id) = id {
                        ACTIVE_TASKS.lock().unwrap().remove(&task_id);
                        cancel::clear_cancel_task(&task_id);
                    }

                    ACTIVE_COUNT.fetch_sub(1, Ordering::SeqCst);
                });
            }

            let pending_count = media_queue::count().await.unwrap_or(0);
            let active_count = ACTIVE_COUNT.load(Ordering::SeqCst);
            if pending_count == 0 && active_count == 0 {
                WORKER_RUNNING.store(false, Ordering::SeqCst);

                let latest_pending = media_queue::count().await.unwrap_or(0);
                if latest_pending == 0 {
                    break;
                }

                if !WORKER_RUNNING.swap(true, Ordering::SeqCst) {
                    continue;
                }
            }

            tokio::time::sleep(Duration::from_millis(80)).await;
        }

        if ACTIVE_COUNT.load(Ordering::SeqCst) == 0 {
            cancel::reset_cancel();
            ACTIVE_TASKS.lock().unwrap().clear();
            WORKER_RUNNING.store(false, Ordering::SeqCst);
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
        MediaTaskRequest::Watermark(args) => run_watermark_task(app, args),
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
    let (error, final_output_path, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            report.output_media.path.clone(),
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (
                Some(e),
                output_path.clone(),
                serde_json::to_value(&args).ok(),
                None,
            )
        }
    };

    record_history(
        args.task_id.clone(),
        "convert-audio".into(),
        "audio".into(),
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

fn run_convert_video(app: &AppHandle, args: VideoConversionArgs) -> Result<(), String> {
    run_convert_video_with_task_type(app, args, "convert-video")
}

fn is_image_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "tif" | "ico"
    )
}

fn run_watermark_task(app: &AppHandle, args: VideoConversionArgs) -> Result<(), String> {
    let input_ext = Path::new(&args.input_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    let format_ext = args.format.as_ref().map(|s| s.to_lowercase());
    let declared_image = args.input_file_type.as_deref() == Some("image");
    let should_run_image = declared_image
        || format_ext.as_deref().map(is_image_extension).unwrap_or(false)
        || input_ext.as_deref().map(is_image_extension).unwrap_or(false);

    if should_run_image {
        let resolved_format = format_ext
            .or(input_ext)
            .filter(|ext| is_image_extension(ext))
            .unwrap_or_else(|| "jpg".to_string());
        let image_args = ImageConversionParams {
            task_id: args.task_id,
            input_path: args.input_path,
            input_file_type: Some("image".to_string()),
            output_path: args.output_path.unwrap_or_default(),
            width: None,
            height: None,
            format: resolved_format,
            image_encoder: None,
            watermark: args.watermark,
        };
        return run_convert_image_with_task_type(app, image_args, "watermark");
    }

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
        color_range: args.color_range.clone(),
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
    let (error, final_output_path, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            report.output_media.path.clone(),
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (
                Some(e),
                output_path.clone(),
                serde_json::to_value(&args).ok(),
                None,
            )
        }
    };

    record_history(
        args.task_id.clone(),
        task_type.into(),
        "video".into(),
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
    let (error, final_output_path, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            report.output_media.path.clone(),
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
        Err(e) => {
            emitter.emit("error", None, None, Some(e.clone()));
            (
                Some(e),
                output_path.clone(),
                serde_json::to_value(&args).ok(),
                None,
            )
        }
    };

    record_history(
        args.task_id.clone(),
        "convert-gif".into(),
        "gif".into(),
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

fn run_convert_image(app: &AppHandle, args: ImageConversionParams) -> Result<(), String> {
    run_convert_image_with_task_type(app, args, "convert-image")
}

fn run_convert_image_with_task_type(
    app: &AppHandle,
    mut args: ImageConversionParams,
    task_type: &str,
) -> Result<(), String> {
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
        task_type.into(),
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
    let emitter = events::window_emitter(app, task_id.clone(), task_type.into(), file_type)?;

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
        task_type.into(),
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
        audio_tracks: args.audio_tracks.clone(),
        preset: args.preset.clone(),
        use_hardware_acceleration: args.use_hardware_acceleration,
        use_ultra_fast_speed: args.use_ultra_fast_speed,
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
    let (error, final_output_path, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            report.output_media.path.clone(),
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
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
        args.task_id.clone(),
        "compress-video".into(),
        "video".into(),
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
        format: args.format.clone(),
        encoding: args.encoding.clone(),
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
    let (error, final_output_path, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            report.output_media.path.clone(),
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
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
        args.task_id.clone(),
        "compress-audio".into(),
        "audio".into(),
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
    let (error, final_output_path, effective_params, output_size_hint) = match result {
        Ok(report) => (
            None,
            report.output_media.path.clone(),
            serde_json::to_value(&report).ok(),
            Some(report.output_media.size as i64),
        ),
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
        args.task_id.clone(),
        "compress-image".into(),
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
