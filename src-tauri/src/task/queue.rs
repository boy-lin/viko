use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::services::convert::audio::{self, AudioConversionParams};
use crate::commands::{
    AudioCompressionArgs, AudioConversionArgs, GifConversionArgs, ImageCompressionArgs,
    VideoCompressionArgs, VideoConversionArgs,
};
use crate::events;
use crate::events::TaskEmitter;
use crate::services::convert::gif::{self, GifConversionParams};
use crate::services::convert::image::{self, ImageConversionParams};
use crate::services::convert::video::{self, VideoConversionParams};
use crate::storage::media_queue;

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
}

static TASK_RUNNING: AtomicBool = AtomicBool::new(false);

pub async fn submit_tasks(app: AppHandle, tasks: Vec<MediaTaskRequest>) -> Result<usize, String> {
    println!("submit_tasks");
    for task in tasks {
        media_queue::enqueue(&task).await.map_err(|e| {
            println!("enqueue err: {e}");
            e.to_string()
        })?;
    }
    println!("submit_tasks end");
    let pending = media_queue::count().await.map_err(|e| {
        println!("count err: {e}");
        e.to_string()
    })?;
    println!("pending: {pending}");
    start_worker(app);
    Ok(pending)
}

pub async fn has_running() -> bool {
    if TASK_RUNNING.load(Ordering::SeqCst) {
        return true;
    }
    media_queue::count()
        .await
        .map(|c| c > 0)
        .unwrap_or(false)
}

pub async fn clear_pending() -> Result<usize, String> {
    let count = media_queue::count().await.map_err(|e| e.to_string())?;
    media_queue::clear().await.map_err(|e| e.to_string())?;
    Ok(count)
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
                    // Run execution in blocking thread to avoid stalling async runtime
                    let app_clone = app.clone();
                    // We spawn a blocking task to handle the actual processing
                    // This allows valid mixing of async and sync code without blocking the main runtime
                    let result = tauri::async_runtime::spawn_blocking(move || {
                        if let Err(err) = execute_task(&app_clone, task) {
                            log::error!("media task failed: {}", err);
                        }
                    }).await;
                    
                    if let Err(e) = result {
                         log::error!("Worker thread join error: {}", e);
                    }
                }
                None => {
                    println!("No task found, breaking loop");
                    TASK_RUNNING.store(false, Ordering::SeqCst);
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
    }
}

fn run_convert_audio(app: &AppHandle, args: AudioConversionArgs) -> Result<(), String> {
    let resolved_format = args
        .format
        .clone()
        .or_else(|| {
            Path::new(&args.input_path)
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
        })
        .unwrap_or_else(|| "mp3".to_string());

    let output_path = if let Some(path) = args.output_path {
        path
    } else {
        audio::generate_output_path(&args.input_path, &resolved_format)?
    };

    let params = AudioConversionParams {
        input_path: args.input_path,
        output_path: output_path.clone(),
        format: args.format.or(Some(resolved_format)),
        codec: args.codec,
        bitrate: args.bitrate,
        sample_rate: args.sample_rate,
        channels: args.channels,
        bit_depth: args.bit_depth,
        quality: args.quality,
        use_hardware_acceleration: args.use_hardware_acceleration,
        use_ultra_fast_speed: args.use_ultra_fast_speed,
    };

    let emitter = events::window_emitter(app, args.task_id, "convert".into(), "audio".into())?;
    if let Err(e) = audio::convert_audio(emitter.clone(), params) {
        emitter.emit("error", None, None, Some(e));
    }
    Ok(())
}

fn run_convert_video(app: &AppHandle, args: VideoConversionArgs) -> Result<(), String> {
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

    let output_path = if let Some(path) = args.output_path {
        path
    } else {
        let path = Path::new(&args.input_path);
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        parent
            .join(format!("{}.{}", stem, resolved_format))
            .to_string_lossy()
            .to_string()
    };

    let params = VideoConversionParams {
        input_path: args.input_path,
        output_path: output_path.clone(),
        format: args.format.or(Some(resolved_format)),
        video_encoder: args.video_encoder,
        video_bitrate: args.video_bitrate,
        min_bitrate: args.min_bitrate,
        max_bitrate: args.max_bitrate,
        rc_mode: args.rc_mode,
        resolution: args.resolution,
        aspect_ratio: args.aspect_ratio,
        scaling_mode: args.scaling_mode,
        frame_rate: args.frame_rate,
        gop_size: args.gop_size,
        preset: args.preset,
        profile: args.profile,
        tune: args.tune,
        color_space: args.color_space,
        bit_depth: args.bit_depth,
        crop: args.crop,
        audio_tracks: args.audio_tracks,
        default_audio_params: args.default_audio_params,
        audio_encoder: args.audio_encoder,
        use_hardware_acceleration: args.use_hardware_acceleration.unwrap_or(false),
        use_ultra_fast_speed: args.use_ultra_fast_speed.unwrap_or(false),
        watermark: args.watermark,
    };

    let emitter = events::window_emitter(app, args.task_id, "convert".into(), "image".into())?;
    if let Err(e) = video::convert_video(emitter.clone(), params) {
        emitter.emit("error", None, None, Some(e));
    }
    Ok(())
}

fn run_convert_gif(app: &AppHandle, args: GifConversionArgs) -> Result<(), String> {
    let output_path = if let Some(path) = args.output_path {
        path
    } else {
        let path = Path::new(&args.input_path);
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        parent.join(format!("{}.gif", stem)).to_string_lossy().to_string()
    };

    let params = GifConversionParams {
        input_path: args.input_path,
        output_path,
        width: args.width,
        height: args.height,
        quality: args.quality,
        preserve_transparency: args.preserve_transparency,
        color_mode: args.color_mode,
        dpi: args.dpi,
        frame_rate: args.frame_rate,
        loop_count: args.loop_count,
        frame_delay: args.frame_delay,
        colors: args.colors,
        preserve_extensions: args.preserve_extensions,
        sharpen: args.sharpen,
        denoise: args.denoise,
    };

    let emitter = events::window_emitter(app, args.task_id, "convert".into(), "video".into())?;
    if let Err(e) = gif::convert_video_to_gif(emitter.clone(), params) {
        emitter.emit("error", None, None, Some(e));
    }
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
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
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
    let emitter = events::window_emitter(app, task_id, "convert".into(), "image".into())?;
    let result = tauri::async_runtime::block_on(image::convert_image_file(args));
    match result {
        Ok(output_path) => {
            emitter.emit("complete", Some(100.0), Some(output_path), None);
        }
        Err(e) => {
            emitter.emit("error", None, None, Some(e));
        }
    }
    Ok(())
}

fn run_compress_video(app: &AppHandle, args: VideoCompressionArgs) -> Result<(), String> {
    let params = crate::services::compress::video::VideoCompressionParams {
        input_path: args.input_path,
        output_path: args.output_path.clone(),
        compression_ratio: args.compression_ratio,
        width: args.width,
        height: args.height,
        bitrate: args.bitrate,
        frame_rate: args.frame_rate,
        codec: args.codec,
        keyframe_interval: args.keyframe_interval,
        color_depth: args.color_depth,
        aspect_ratio: args.aspect_ratio,
        remove_audio: args.remove_audio,
        audio_bitrate: args.audio_bitrate,
        preset: args.preset,
        use_hardware_acceleration: args.use_hardware_acceleration,
    };

    let emitter = events::window_emitter(app, args.task_id, "compress".into(), "video".into())?;
    if let Err(e) = crate::services::compress::video::compress_video_file(emitter.clone(), params) {
        emitter.emit("error", None, None, Some(e));
    }
    Ok(())
}

fn run_compress_audio(app: &AppHandle, args: AudioCompressionArgs) -> Result<(), String> {
    let params = crate::services::compress::audio::AudioCompressionParams {
        input_path: args.input_path,
        output_path: args.output_path.clone(),
        compression_ratio: Some(args.compression_ratio),
        sample_rate: args.sample_rate,
        bitrate: args.bitrate,
        codec: args.codec,
        channels: args.channels,
        bit_depth: args.bit_depth,
        remove_silence: args.remove_silence,
        silence_threshold: args.silence_threshold,
        volume_gain: args.volume_gain,
    };

    let emitter = events::window_emitter(app, args.task_id, "compress".into(), "audio".into())?;
    if let Err(e) = crate::services::compress::audio::compress_audio_file(emitter.clone(), params) {
        emitter.emit("error", None, None, Some(e));
    }
    Ok(())
}

fn run_compress_image(app: &AppHandle, args: ImageCompressionArgs) -> Result<(), String> {
    let params = crate::services::compress::image::ImageCompressionParams {
        input_path: args.input_path,
        output_path: args.output_path.clone(),
        quality: args.quality,
        format: args.format,
        width: args.width,
        height: args.height,
        color_mode: args.color_mode,
        strip_metadata: args.strip_metadata,
        keep_transparency: args.keep_transparency,
        dpi: args.dpi,
        crop_whitespace: args.crop_whitespace,
    };

    let emitter = events::window_emitter(app, args.task_id, "compress".into(), "image".into())?;
    if let Err(e) = crate::services::compress::image::compress_image_file(emitter.clone(), params) {
        emitter.emit("error", None, None, Some(e));
    }
    Ok(())
}
