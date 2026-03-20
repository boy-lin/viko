use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::commands::{
    AudioCompressionArgs, AudioConversionArgs, DenoiseMediaArgs, GifConversionArgs, ImageCompressionArgs,
    MediaTaskSubmitResult, TaskSubmitClientContext, VideoCompressionArgs, VideoConversionArgs,
};
use crate::events;
use crate::events::TaskEmitter;
use crate::services::convert::audio::{self, AudioConversionParams};
use crate::services::convert::denoise;
use crate::services::convert::gif;
use crate::services::convert::image::{self, ImageConversionParams};
use crate::services::convert::video::{self, VideoConversionParams};
use crate::shared::get_millis;
use crate::storage::media_queue;
use crate::storage::task_history::{self, TaskHistoryItem};
use crate::task::cancel;

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(tag = "type", content = "args")]
pub enum MediaTaskRequest {
    #[serde(rename = "convert-to-audio")]
    ConvertToAudio(AudioConversionArgs),
    #[serde(rename = "convert-to-video")]
    ConvertToVideo(VideoConversionArgs),
    #[serde(rename = "convert-to-image")]
    ConvertToImage(ImageConversionParams),
    #[serde(rename = "convert-to-animated-image")]
    ConvertToAnimatedImage(GifConversionArgs),
    #[serde(rename = "compress-video")]
    CompressVideo(VideoCompressionArgs),
    #[serde(rename = "compress-audio")]
    CompressAudio(AudioCompressionArgs),
    #[serde(rename = "compress-image")]
    CompressImage(ImageCompressionArgs),
    #[serde(rename = "watermark")]
    Watermark(VideoConversionArgs),
    #[serde(rename = "convert-denoise")]
    ConvertDenoise(DenoiseMediaArgs),
}

static WORKER_RUNNING: AtomicBool = AtomicBool::new(false);
static ACTIVE_TASKS: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static ACTIVE_COUNT: AtomicUsize = AtomicUsize::new(0);
const FREE_VISIBLE_MEDIA_LIMIT: u64 = 3;
const FREE_VISIBLE_MEDIA_FEATURE: &str = "free_visible_media_submit";

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
        MediaTaskRequest::ConvertToAudio(_) => "convert-to-audio",
        MediaTaskRequest::ConvertToVideo(_) => "convert-to-video",
        MediaTaskRequest::ConvertToImage(_) => "convert-to-image",
        MediaTaskRequest::ConvertToAnimatedImage(_) => "convert-to-animated-image",
        MediaTaskRequest::CompressVideo(_) => "compress-video",
        MediaTaskRequest::CompressAudio(_) => "compress-audio",
        MediaTaskRequest::CompressImage(_) => "compress-image",
        MediaTaskRequest::Watermark(_) => "watermark",
        MediaTaskRequest::ConvertDenoise(_) => "convert-denoise",
    }
}

fn task_id(task: &MediaTaskRequest) -> Option<String> {
    match task {
        MediaTaskRequest::ConvertToAudio(args) => Some(args.task_id.clone()),
        MediaTaskRequest::ConvertToVideo(args) => Some(args.task_id.clone()),
        MediaTaskRequest::ConvertToImage(args) => Some(args.task_id.clone()),
        MediaTaskRequest::ConvertToAnimatedImage(args) => Some(args.task_id.clone()),
        MediaTaskRequest::CompressVideo(args) => Some(args.task_id.clone()),
        MediaTaskRequest::CompressAudio(args) => Some(args.task_id.clone()),
        MediaTaskRequest::CompressImage(args) => Some(args.task_id.clone()),
        MediaTaskRequest::Watermark(args) => Some(args.task_id.clone()),
        MediaTaskRequest::ConvertDenoise(args) => Some(args.task_id.clone()),
    }
}

fn resolve_client_identity(context: Option<&TaskSubmitClientContext>) -> Option<(String, String)> {
    let context = context?;
    if context.is_logged_in {
        return None;
    }
    let identity_key = context.identity_key.trim();
    if identity_key.is_empty() {
        return None;
    }
    let identity_scope = if context.identity_scope.trim().is_empty() {
        "guest".to_string()
    } else {
        context.identity_scope.clone()
    };
    Some((identity_scope, identity_key.to_string()))
}

fn visible_media_kind(task: &MediaTaskRequest) -> Option<&'static str> {
    match task {
        MediaTaskRequest::ConvertToVideo(_) => Some("video"),
        MediaTaskRequest::ConvertToImage(_) => Some("image"),
        MediaTaskRequest::ConvertToAnimatedImage(_) => Some("animated_image"),
        MediaTaskRequest::CompressVideo(_) => Some("video"),
        MediaTaskRequest::CompressImage(_) => Some("image"),
        MediaTaskRequest::Watermark(args) => {
            if args.input_file_type.as_deref() == Some("image") {
                Some("image")
            } else {
                Some("video")
            }
        }
        MediaTaskRequest::ConvertDenoise(args) => {
            let input_ext = Path::new(&args.input_path)
                .extension()
                .and_then(|ext| ext.to_str());
            let format_ext = args.format.as_deref();
            let media_type = resolve_denoise_media_type(
                args.input_file_type.as_deref(),
                input_ext,
                format_ext,
            );
            if media_type.as_deref() == Some("audio") {
                None
            } else {
                Some("video")
            }
        }
        MediaTaskRequest::ConvertToAudio(_) | MediaTaskRequest::CompressAudio(_) => None,
    }
}

fn default_watermark_icon_path(app: &AppHandle) -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("icons").join("128x128.png"));
        candidates.push(resource_dir.join("icons").join("icon.png"));
        candidates.push(resource_dir.join("resources").join("icons").join("128x128.png"));
    }
    candidates.push(PathBuf::from("src-tauri").join("icons").join("128x128.png"));

    candidates
        .into_iter()
        .find(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
}

fn build_default_forced_watermark(app: &AppHandle) -> crate::services::media_tools::watermark::WatermarkConfig {
    let image = default_watermark_icon_path(app).map(|path| crate::services::media_tools::watermark::ImageWatermark {
        path,
        scale: 1.0,
        opacity: 0.16,
        x: "0".to_string(),
        y: "0".to_string(),
        anchor: Some("br".to_string()),
        offset_x: Some(4.0),
        offset_y: Some(4.0),
        offset_unit: Some("percent".to_string()),
        size_mode: Some("video_width_ratio".to_string()),
        size_value: Some(0.08),
    });

    crate::services::media_tools::watermark::WatermarkConfig {
        image,
        text: Some(crate::services::media_tools::watermark::TextWatermark {
            content: "Exported by viko Free".to_string(),
            font_path: crate::services::media_tools::watermark::preferred_system_font_path(),
            font_size: 24.0,
            color: "#FFFFFF".to_string(),
            opacity: 0.55,
            x: "0".to_string(),
            y: "0".to_string(),
            anchor: Some("br".to_string()),
            offset_x: Some(4.0),
            offset_y: Some(14.0),
            offset_unit: Some("percent".to_string()),
        }),
    }
}

fn apply_forced_watermark(
    app: &AppHandle,
    task: &mut MediaTaskRequest,
) -> bool {
    let forced = build_default_forced_watermark(app);
    match task {
        MediaTaskRequest::ConvertToVideo(args) | MediaTaskRequest::Watermark(args) => {
            args.forced_watermark = Some(forced);
            true
        }
        MediaTaskRequest::ConvertToImage(args) => {
            args.forced_watermark = Some(forced);
            true
        }
        MediaTaskRequest::ConvertToAnimatedImage(args) => {
            args.forced_watermark = Some(forced);
            true
        }
        MediaTaskRequest::CompressImage(args) => {
            args.forced_watermark = Some(forced);
            true
        }
        MediaTaskRequest::ConvertDenoise(args) => {
            args.forced_watermark = Some(forced);
            true
        }
        MediaTaskRequest::CompressVideo(args) => {
            args.forced_watermark = Some(forced);
            true
        }
        MediaTaskRequest::ConvertToAudio(_) | MediaTaskRequest::CompressAudio(_) => false,
    }
}

pub async fn submit_tasks(
    app: AppHandle,
    tasks: Vec<MediaTaskRequest>,
    client_context: Option<TaskSubmitClientContext>,
) -> Result<MediaTaskSubmitResult, String> {
    let identity = resolve_client_identity(client_context.as_ref());
    let day_key = crate::storage::usage_gate::current_day_key();
    let mut forced_watermark_count = 0usize;

    for mut task in tasks {
        if let (Some((identity_scope, identity_key)), Some(media_kind)) =
            (identity.as_ref(), visible_media_kind(&task))
        {
            let current_count = crate::storage::usage_gate::count_today(
                identity_key,
                FREE_VISIBLE_MEDIA_FEATURE,
                &day_key,
            )
            .await
            .map_err(|e| e.to_string())?;

            if current_count >= FREE_VISIBLE_MEDIA_LIMIT && apply_forced_watermark(&app, &mut task) {
                forced_watermark_count += 1;
            }

            if let Some(task_id) = task_id(&task) {
                crate::storage::usage_gate::record_submit(
                    &day_key,
                    identity_scope,
                    identity_key,
                    FREE_VISIBLE_MEDIA_FEATURE,
                    &task_id,
                    task_kind(&task),
                    media_kind,
                    get_millis(),
                )
                .await
                .map_err(|e| e.to_string())?;
            }
        }
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
    let remaining_free_count = if let Some((_, identity_key)) = identity.as_ref() {
        let total = crate::storage::usage_gate::count_today(
            identity_key,
            FREE_VISIBLE_MEDIA_FEATURE,
            &day_key,
        )
        .await
        .map_err(|e| e.to_string())?;
        Some(FREE_VISIBLE_MEDIA_LIMIT.saturating_sub(total) as usize)
    } else {
        None
    };
    Ok(MediaTaskSubmitResult {
        pending_count: pending,
        forced_watermark_count,
        remaining_free_count,
    })
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
        MediaTaskRequest::ConvertToAudio(args) => run_convert_audio(app, args),
        MediaTaskRequest::ConvertToVideo(args) => run_convert_video(app, args),
        MediaTaskRequest::ConvertToImage(args) => run_convert_image(app, args),
        MediaTaskRequest::ConvertToAnimatedImage(args) => run_convert_animated_image(app, args),
        MediaTaskRequest::CompressVideo(args) => run_compress_video(app, args),
        MediaTaskRequest::CompressAudio(args) => run_compress_audio(app, args),
        MediaTaskRequest::CompressImage(args) => run_compress_image(app, args),
        MediaTaskRequest::Watermark(args) => run_watermark_task(app, args),
        MediaTaskRequest::ConvertDenoise(args) => run_convert_denoise(app, args),
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
        "convert-to-audio".into(),
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
        audio_filter_spec: None,
    };

    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| "audio".to_string());
    let emitter = events::window_emitter(
        app,
        args.task_id.clone(),
        "convert-to-audio".into(),
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
        "convert-to-audio".into(),
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
    run_convert_video_with_task_type(app, args, "convert-to-video")
}

fn is_image_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "tif" | "ico"
    )
}

fn is_audio_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "mp3"
            | "m4a"
            | "wav"
            | "flac"
            | "ogg"
            | "aac"
            | "ac3"
            | "mp2"
            | "m4b"
            | "ape"
            | "caf"
            | "aiff"
            | "m4r"
            | "amr"
            | "opus"
            | "wma"
    )
}

fn is_video_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "mp4"
            | "mov"
            | "mkv"
            | "avi"
            | "wmv"
            | "webm"
            | "flv"
            | "3gp"
            | "mpg"
            | "mpeg"
            | "vob"
            | "ogv"
            | "m4v"
            | "ts"
            | "m2ts"
    )
}

fn resolve_denoise_media_type(
    input_file_type: Option<&str>,
    input_ext: Option<&str>,
    format_ext: Option<&str>,
) -> Option<String> {
    if let Some(kind) = input_file_type {
        let normalized = kind.trim().to_lowercase();
        if normalized == "audio" || normalized == "video" {
            return Some(normalized);
        }
    }

    if let Some(ext) = input_ext {
        if is_audio_extension(ext) {
            return Some("audio".to_string());
        }
        if is_video_extension(ext) {
            return Some("video".to_string());
        }
    }

    if let Some(ext) = format_ext {
        if is_audio_extension(ext) {
            return Some("audio".to_string());
        }
        if is_video_extension(ext) {
            return Some("video".to_string());
        }
    }

    None
}

fn generate_denoise_output_path(input_path: &str, format: &str) -> String {
    let path = Path::new(input_path);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let candidate = parent.join(format!("{}_denoise.{}", stem, format));
    crate::media_common::ensure_unique_output_path(&candidate.to_string_lossy())
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
            frame_rate: None,
            quality: None,
            preserve_transparency: None,
            color_mode: None,
            dpi: None,
            loop_count: None,
            frame_delay: None,
            colors: None,
            preserve_extensions: None,
            sharpen: None,
            denoise: None,
            watermark: args.watermark,
            forced_watermark: args.forced_watermark,
        };
        return run_convert_image_with_task_type(app, image_args, "watermark");
    }

    run_convert_video_with_task_type(app, args, "watermark")
}

fn run_convert_denoise(app: &AppHandle, args: DenoiseMediaArgs) -> Result<(), String> {
    let task_type = "convert-denoise";
    let input_ext = Path::new(&args.input_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    let format_ext = args
        .format
        .as_ref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());
    let media_type = resolve_denoise_media_type(
        args.input_file_type.as_deref(),
        input_ext.as_deref(),
        format_ext.as_deref(),
    )
    .ok_or_else(|| "仅支持音频/视频文件降噪".to_string())?;
    let resolved_format = format_ext
        .or_else(|| input_ext.clone())
        .unwrap_or_else(|| {
            if media_type == "video" {
                "mp4".to_string()
            } else {
                "mp3".to_string()
            }
        });
    let output_path = args
        .output_path
        .as_ref()
        .filter(|path| !path.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| generate_denoise_output_path(&args.input_path, &resolved_format));
    let file_type = args
        .input_file_type
        .clone()
        .unwrap_or_else(|| media_type.clone());
    let start_time = get_millis();

    record_history_start(
        args.task_id.clone(),
        task_type.into(),
        media_type.clone(),
        args.input_path.clone(),
        output_path.clone(),
        start_time,
        &args,
    );

    let emitter = events::window_emitter(app, args.task_id.clone(), task_type.into(), file_type)?;
    let engine = args
        .engine
        .as_deref()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "ffmpeg".to_string());
    if engine != "ffmpeg" {
        let err = "AI 降噪暂未实现，请先使用 FFmpeg 降噪".to_string();
        emitter.emit("error", None, None, Some(err.clone()));
        record_history(
            args.task_id.clone(),
            task_type.into(),
            media_type,
            args.input_path.clone(),
            output_path,
            start_time,
            Some(err),
            args,
            None,
            None,
        );
        return Ok(());
    }

    let filter_spec = denoise::build_audio_filter_spec(args.filter.as_ref());
    let use_hardware_acceleration = args.use_hardware_acceleration.unwrap_or(false);
    let use_ultra_fast_speed = args.use_ultra_fast_speed.unwrap_or(false);

    let (error, final_output_path, effective_params, output_size_hint) = if media_type == "audio" {
        let params = AudioConversionParams {
            input_path: args.input_path.clone(),
            output_path: output_path.clone(),
            format: Some(resolved_format.clone()),
            codec: None,
            bitrate: None,
            sample_rate: None,
            channels: None,
            bit_depth: None,
            quality: None,
            use_hardware_acceleration: Some(use_hardware_acceleration),
            use_ultra_fast_speed: Some(use_ultra_fast_speed),
            audio_tracks: None,
            audio_filter_spec: Some(filter_spec),
        };
        match audio::convert_audio(emitter.clone(), params) {
            Ok(report) => (
                None,
                report.output_media.path.clone(),
                serde_json::to_value(&report).ok(),
                Some(report.output_media.size as i64),
            ),
            Err(e) => {
                emitter.emit("error", None, None, Some(e.clone()));
                (Some(e), output_path.clone(), serde_json::to_value(&args).ok(), None)
            }
        }
    } else {
        let params = VideoConversionParams {
            input_path: args.input_path.clone(),
            output_path: output_path.clone(),
            format: Some(resolved_format.clone()),
            video_encoder: None,
            video_bitrate: None,
            min_bitrate: None,
            max_bitrate: None,
            rc_mode: None,
            crf: None,
            resolution: None,
            aspect_ratio: None,
            scaling_mode: None,
            frame_rate: None,
            gop_size: None,
            preset: None,
            profile: None,
            tune: None,
            color_space: None,
            color_range: None,
            bit_depth: None,
            crop: None,
            audio_tracks: None,
            default_audio_params: None,
            audio_filter_spec: Some(filter_spec),
            audio_encoder: None,
            use_hardware_acceleration,
            use_ultra_fast_speed,
            watermark: None,
            forced_watermark: args.forced_watermark.clone(),
        };
        match video::convert_video(emitter.clone(), params) {
            Ok(report) => (
                None,
                report.output_media.path.clone(),
                serde_json::to_value(&report).ok(),
                Some(report.output_media.size as i64),
            ),
            Err(e) => {
                emitter.emit("error", None, None, Some(e.clone()));
                (Some(e), output_path.clone(), serde_json::to_value(&args).ok(), None)
            }
        }
    };

    record_history(
        args.task_id.clone(),
        task_type.into(),
        media_type,
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
        audio_filter_spec: None,
        watermark: args.watermark.clone(),
        forced_watermark: args.forced_watermark.clone(),
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

fn run_convert_image(app: &AppHandle, args: ImageConversionParams) -> Result<(), String> {
    run_convert_image_with_task_type(app, args, "convert-to-image")
}

fn run_convert_animated_image(app: &AppHandle, mut args: GifConversionArgs) -> Result<(), String> {
    let normalized_format = args.format.trim().to_lowercase();
    if normalized_format != "gif" && normalized_format != "apng" {
        return Err(format!(
            "convert-to-animated-image 暂仅支持 GIF/APNG，收到格式: {}",
            args.format
        ));
    }

    let output_path = args
        .output_path
        .as_ref()
        .filter(|path| !path.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| {
            let path = Path::new(&args.input_path);
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
            let parent = path.parent().unwrap_or_else(|| Path::new("."));
            let ext = if normalized_format == "apng" { "png" } else { "gif" };
            parent.join(format!("{stem}.{ext}")).to_string_lossy().to_string()
        });
    args.output_path = Some(output_path.clone());

    let start_time = get_millis();
    record_history_start(
        args.task_id.clone(),
        "convert-to-animated-image".into(),
        normalized_format.clone(),
        args.input_path.clone(),
        output_path.clone(),
        start_time,
        &args,
    );

    let emitter = events::window_emitter(
        app,
        args.task_id.clone(),
        "convert-to-animated-image".into(),
        normalized_format.clone(),
    )?;

    let result = if normalized_format == "apng" {
        gif::convert_to_apng(app, emitter.clone(), args.clone())
    } else {
        gif::convert_to_gif(emitter.clone(), args.clone())
    };
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
                output_path,
                serde_json::to_value(&args).ok(),
                None,
            )
        }
    };

    record_history(
        args.task_id.clone(),
        "convert-to-animated-image".into(),
        normalized_format,
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

    let result = if image::is_animated_image_target(&args.format, &args.output_path, &args.input_path)
    {
        gif::convert_animated_image(app, task_id.clone(), task_type, args.clone())
    } else {
        tauri::async_runtime::block_on(image::convert_image_file_with_report(args.clone()))
    };

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
    if args.forced_watermark.is_some() {
        let video_args = VideoConversionArgs {
            task_id: args.task_id,
            input_path: args.input_path,
            input_file_type: args.input_file_type,
            output_path: Some(args.output_path),
            format: None,
            video_encoder: args.codec,
            video_bitrate: args.bitrate,
            min_bitrate: None,
            max_bitrate: None,
            rc_mode: Some("vbr".to_string()),
            crf: None,
            resolution: match (args.width, args.height) {
                (Some(width), Some(height)) => Some(format!("{width}x{height}")),
                _ => None,
            },
            aspect_ratio: args.aspect_ratio,
            scaling_mode: None,
            frame_rate: args.frame_rate.map(|value| value.to_string()),
            gop_size: args.keyframe_interval,
            preset: args.preset,
            profile: None,
            tune: None,
            color_space: None,
            color_range: None,
            bit_depth: args.color_depth,
            crop: None,
            audio_encoder: None,
            audio_bitrate: None,
            audio_sample_rate: None,
            audio_channels: None,
            audio_bit_depth: None,
            audio_quality: None,
            audio_tracks: None,
            default_audio_params: None,
            use_hardware_acceleration: args.use_hardware_acceleration,
            use_ultra_fast_speed: args.use_ultra_fast_speed,
            watermark: None,
            forced_watermark: args.forced_watermark,
        };
        return run_convert_video_with_task_type(app, video_args, "compress-video");
    }

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
        forced_watermark: args.forced_watermark.clone(),
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

    let params = crate::services::animated_image::ImageCompressionParams {
        input_path: args.input_path.clone(),
        output_path: args.output_path.clone(),
        quality: args.quality,
        format: args.format.clone(),
        width: args.width,
        height: args.height,
        color_mode: args.color_mode.clone(),
        colors: args.colors,
        strip_metadata: args.strip_metadata,
        keep_transparency: args.keep_transparency,
        dpi: args.dpi,
        crop_whitespace: args.crop_whitespace,
        forced_watermark: args.forced_watermark.clone(),
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

    let result = if crate::services::compress::image::is_animated_image_target(
        params.format.as_deref(),
        &params.output_path,
        &params.input_path,
    ) {
        gif::compress_animated_image(app, args.task_id.clone(), "compress-image", params)
    } else {
        crate::services::compress::image::compress_image_file(emitter.clone(), params)
    };
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
