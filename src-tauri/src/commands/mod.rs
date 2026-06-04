use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::File;
use std::fs::OpenOptions;
use std::io;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri::State;
use tauri::ipc::{InvokeResponseBody, JavaScriptChannelId};

use ffmpeg_next as ffmpeg;

use crate::events::{MockEmitter, TaskEmitter, WindowEmitter};
use crate::media_common;
use crate::services::convert::audio::{self, AudioConversionParams};
use crate::services::convert::video::{self as convert_video_service, VideoConversionParams};
use crate::services::ffmpeg::media_info::{self, MediaDetails};
use crate::services::media_probe::{self, MediaCardResult, MediaProbeDetails, MediaProbeResult};
use crate::services::media_tools::image_info;
use crate::services::player::audio::AudioPlayer;
use crate::services::player::video::{FrameChannel, PreviewSize, VideoPlayer};
use crate::task::queue;
use crate::task::queue::MediaTaskRequest;

async fn run_blocking<T, F>(ctx: &'static str, job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| format!("[JOIN:{}] {}", ctx, e))?
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ClientLogInput {
    pub level: String,
    pub category: String,
    pub message: String,
    pub stack: Option<String>,
    pub url: Option<String>,
    pub meta: Option<serde_json::Value>,
    pub timestamp: Option<u64>,
}

fn collect_files_recursive(root: &Path, out: &mut Vec<PathBuf>) -> io::Result<()> {
    if !root.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_files_recursive(&path, out)?;
        } else if path.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

#[command]
pub async fn report_client_log(log: ClientLogInput) -> Result<(), String> {
    let level = log.level.to_lowercase();
    let prefix = format!("[CLIENT:{}] {}", log.category, log.message);
    let detail = format!(
        "{} | url={} | ts={} | stack={} | meta={}",
        prefix,
        log.url.unwrap_or_default(),
        log.timestamp.unwrap_or_default(),
        log.stack.unwrap_or_default(),
        log.meta.map(|m| m.to_string()).unwrap_or_default()
    );
    match level.as_str() {
        "warn" => log::warn!("{}", detail),
        "info" => log::info!("{}", detail),
        _ => log::error!("{}", detail),
    }
    Ok(())
}

#[command]
pub async fn export_logs_archive(app: AppHandle) -> Result<String, String> {
    run_blocking("export_logs_archive", move || {
        let log_dir = app
            .path()
            .app_log_dir()
            .map_err(|e| format!("resolve app_log_dir failed: {}", e))?;
        fs::create_dir_all(&log_dir)
            .map_err(|e| format!("create app_log_dir failed: {}", e))?;

        let mut files = Vec::new();
        collect_files_recursive(&log_dir, &mut files)
            .map_err(|e| format!("collect logs failed: {}", e))?;
        if files.is_empty() {
            return Err("no log files found".to_string());
        }

        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or_default();
        let zip_path = std::env::temp_dir().join(format!("viko-logs-{}.zip", ts));
        let file = File::create(&zip_path)
            .map_err(|e| format!("create zip failed: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for src in files {
            let rel = src
                .strip_prefix(&log_dir)
                .ok()
                .and_then(|p| p.to_str())
                .map(|s| s.replace('\\', "/"))
                .unwrap_or_else(|| {
                    src.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("log.txt")
                        .to_string()
                });
            zip.start_file(rel, options)
                .map_err(|e| format!("zip start_file failed: {}", e))?;
            let mut input = File::open(&src)
                .map_err(|e| format!("open log file failed ({}): {}", src.display(), e))?;
            io::copy(&mut input, &mut zip)
                .map_err(|e| format!("zip write failed ({}): {}", src.display(), e))?;
        }
        zip.finish()
            .map_err(|e| format!("zip finish failed: {}", e))?;

        Ok(zip_path.to_string_lossy().to_string())
    })
    .await
}

#[command]
pub async fn get_detailed_media_info(path: String) -> Result<MediaDetails, String> {
    run_blocking("get_detailed_media_info", move || media_info::get_media_details(&path)).await
}

#[command]
pub async fn get_detailed_image_info(path: String) -> Result<MediaDetails, String> {
    run_blocking("get_detailed_image_info", move || image_info::get_image_details(&path)).await
}

#[command]
pub async fn get_detailed_media_info_batch(paths: Vec<String>) -> Result<Vec<MediaDetails>, String> {
    run_blocking("get_detailed_media_info_batch", move || {
        paths
            .into_iter()
            .map(|path| media_info::get_media_details(&path))
            .collect::<Result<Vec<_>, _>>()
    })
    .await
}

#[command]
pub async fn probe_media_info(path: String) -> Result<MediaProbeResult, String> {
    run_blocking("probe_media_info", move || media_probe::probe_media_details(&path)).await
}

#[command]
pub async fn probe_media_info_batch(paths: Vec<String>) -> Result<Vec<MediaProbeResult>, String> {
    run_blocking("probe_media_info_batch", move || {
        paths
            .into_iter()
            .map(|path| media_probe::probe_media_details(&path))
            .collect::<Result<Vec<_>, _>>()
    })
    .await
}

#[command]
pub async fn probe_media_card_batch(
    paths: Vec<String>,
    thumbnail_options: Option<crate::services::media_tools::thumbnail::ThumbnailOptions>,
) -> Result<Vec<MediaCardResult>, String> {
    run_blocking("probe_media_card_batch", move || {
        paths
            .into_iter()
            .map(|path| media_probe::probe_media_card(&path, thumbnail_options.clone()))
            .collect::<Result<Vec<_>, _>>()
    })
    .await
}

#[command]
pub async fn media_task_submit(
    app: AppHandle,
    tasks: Vec<MediaTaskRequest>,
    _priority: Option<String>,
    client_context: Option<TaskSubmitClientContext>,
) -> Result<MediaTaskSubmitResult, String> {
    queue::submit_tasks(app, tasks, client_context)
        .await
        .map_err(|e| format!("[TASK_SUBMIT] {}", e))
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct TaskSubmitClientContext {
    pub is_logged_in: bool,
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub identity_scope: String,
    pub identity_key: String,
    pub is_token_preview: Option<bool>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct MediaTaskSubmitResult {
    pub pending_count: usize,
    /// DISABLED: forced_watermark detection 已关闭，该字段恒为 0
    pub forced_watermark_count: usize,
    /// DISABLED: forced_watermark detection 相关，仍返回计数供后续恢复
    pub remaining_free_count: Option<usize>,
}

#[command]
pub async fn media_task_has_running_by_type(task_type: Option<String>) -> Result<bool, String> {
    Ok(queue::has_running(task_type).await)
}

#[command]
pub async fn media_task_clear_by_type(task_type: Option<String>) -> Result<usize, String> {
    queue::clear_pending(task_type)
        .await
        .map_err(|e| format!("[TASK_CLEAR] {}", e))
}

#[command]
pub async fn media_task_clear_by_type_with_stop(
    task_type: Option<String>,
    stop_running: Option<bool>,
) -> Result<usize, String> {
    queue::clear_pending_with_cancel(task_type, stop_running.unwrap_or(false))
        .await
        .map_err(|e| format!("[TASK_CLEAR] {}", e))
}

#[command]
pub async fn media_task_cancel_task(id: String) -> Result<(), String> {
    queue::cancel_task(id)
        .await
        .map_err(|e| format!("[TASK_CANCEL] {}", e))
}

#[derive(Serialize)]
pub struct FileInfo {
    pub path: String,
    pub size: u64,
    pub format: String,
    pub format_long_name: Option<String>,
    pub codec: String,
    pub codec_long_name: Option<String>,
    pub resolution: String,
    pub width: u64,
    pub height: u64,
    pub duration: f64,
    pub output_dir: String,
    pub bitrate: Option<String>,
    pub fps: Option<String>,
    pub avg_frame_rate: Option<String>,
    pub nb_frames: Option<u64>,
    pub pix_fmt: Option<String>,
    pub color_space: Option<String>,
    pub color_range: Option<String>,
    pub audio_codec: Option<String>,
    pub audio_codec_long_name: Option<String>,
    pub audio_channels: Option<String>,
    pub audio_channel_layout: Option<String>,
    pub audio_sample_rate: Option<String>,
    pub audio_bitrate: Option<String>,
    pub audio_bits_per_sample: Option<String>,
    pub audio_sample_fmt: Option<String>,
    pub format_bitrate: Option<String>,
    pub format_tags: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct TranscodeArgs {
    pub input: String,
    pub output: String,
    pub resolution: Option<String>,
    pub quality: Option<String>,
    pub format: String,
}

#[derive(Serialize)]
pub struct SelfCheckResult {
    pub fs_permission: bool,
    pub fs_error: Option<String>,
}

#[derive(Serialize)]
pub struct ModuleInfo {
    pub id: Option<String>,
    pub name: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub version: Option<String>,
    pub source: Option<String>,
    pub is_active: bool,
}

#[derive(Serialize)]
pub struct HardwareSupport {
    pub h264_hardware: bool,
    pub hevc_hardware: bool,
    pub prores_hardware: bool,
}

fn check_fs_permission() -> (bool, Option<String>) {
    let download_dir = match dirs::download_dir() {
        Some(path) => path,
        None => return (false, Some("未找到下载目录".to_string())),
    };
    let test_path = download_dir.join("viko_permission_probe.tmp");
    match OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&test_path)
    {
        Ok(mut file) => {
            if let Err(err) = file.write_all(b"probe") {
                let _ = fs::remove_file(&test_path);
                return (false, Some(format!("写入失败: {}", err)));
            }
        }
        Err(err) => return (false, Some(format!("创建文件失败: {}", err))),
    }

    let read_result = fs::read(&test_path)
        .map(|_| ())
        .map_err(|err| format!("读取失败: {}", err));
    let _ = fs::remove_file(&test_path);
    if let Err(err) = read_result {
        return (false, Some(err));
    }
    (true, None)
}

#[command]
pub async fn run_self_check() -> Result<SelfCheckResult, String> {
    run_blocking("run_self_check", move || {
        let (fs_permission, fs_error) = check_fs_permission();
        Ok(SelfCheckResult {
            fs_permission,
            fs_error,
        })
    })
    .await
}

#[command]
pub async fn get_device_id() -> Result<String, String> {
    run_blocking("get_device_id", move || {
        machine_uid::get().map_err(|e| e.to_string())
    })
    .await
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AuthExchangeCodeInput {
    pub token_endpoint: String,
    pub client_id: String,
    pub code: String,
    pub code_verifier: String,
    pub redirect_uri: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct AuthTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
    pub id_token: Option<String>,
}

#[command]
pub async fn auth_exchange_code(input: AuthExchangeCodeInput) -> Result<AuthTokenResponse, String> {
    run_blocking("auth_exchange_code", move || {
        if input.token_endpoint.trim().is_empty() {
            return Err("[PARAM] token_endpoint is required".to_string());
        }

        let body = serde_json::json!({
            "grant_type": "authorization_code",
            "client_id": input.client_id,
            "code": input.code,
            "code_verifier": input.code_verifier,
            "redirect_uri": input.redirect_uri
        });

        let client = reqwest::blocking::Client::new();
        let response = client
            .post(&input.token_endpoint)
            .header("content-type", "application/json")
            .body(body.to_string())
            .send()
            .map_err(|e| format!("[NETWORK] Token exchange request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().unwrap_or_else(|_| String::new());
            return Err(format!("[HTTP] Token exchange failed with status {}: {}", status, text));
        }

        let text = response
            .text()
            .map_err(|e| format!("[NETWORK] Read token response failed: {}", e))?;
        serde_json::from_str::<AuthTokenResponse>(&text)
            .map_err(|e| format!("[PARSE] Parse token response failed: {}", e))
    })
    .await
}

#[command]
pub async fn updater_guard_report_success() -> Result<crate::storage::updater_guard::UpdaterGuardStatus, String> {
    crate::storage::updater_guard::record_success()
        .await
        .map_err(|e| e.to_string())?;
    crate::storage::updater_guard::get_status()
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn updater_guard_report_failure(
    reason: Option<String>,
) -> Result<crate::storage::updater_guard::UpdaterGuardStatus, String> {
    crate::storage::updater_guard::record_failure(reason)
        .await
        .map_err(|e| e.to_string())?;
    crate::storage::updater_guard::get_status()
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn updater_guard_get_status() -> Result<crate::storage::updater_guard::UpdaterGuardStatus, String> {
    crate::storage::updater_guard::get_status()
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn updater_guard_reset() -> Result<(), String> {
    crate::storage::updater_guard::reset_failures()
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn check_hardware_acceleration() -> Result<HardwareSupport, String> {
    run_blocking("check_hardware_acceleration", move || {
        let h264_encoders = vec![
            "h264_videotoolbox",
            "h264_nvenc",
            "h264_qsv",
            "h264_amf",
            "h264_mf",
        ];
        let h264_hardware = h264_encoders
            .iter()
            .any(|name| ffmpeg::encoder::find_by_name(name).is_some());

        let hevc_encoders = vec![
            "hevc_videotoolbox",
            "hevc_nvenc",
            "hevc_qsv",
            "hevc_amf",
            "hevc_mf",
        ];
        let hevc_hardware = hevc_encoders
            .iter()
            .any(|name| ffmpeg::encoder::find_by_name(name).is_some());

        let prores_encoders = vec!["prores_videotoolbox"];
        let prores_hardware = prores_encoders
            .iter()
            .any(|name| ffmpeg::encoder::find_by_name(name).is_some());

        Ok(HardwareSupport {
            h264_hardware,
            hevc_hardware,
            prores_hardware,
        })
    })
    .await
}

// 注意：本项目使用 ffmpeg-next 8.x 并链接系统 FFmpeg 库
#[command]
pub async fn get_media_info(path: String) -> Result<FileInfo, String> {
    run_blocking("get_media_info", move || -> Result<FileInfo, String> {
    media_common::ensure_ffmpeg_init().map_err(|e| format!("[FFMPEG_INIT] {}", e))?;

    // 获取文件大小
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();

    // 打开输入文件
    let ictx = ffmpeg::format::input(&path).map_err(|e| format!("打开文件失败: {}", e))?;

    // 获取格式信息
    let format_name = ictx.format().name().to_string();
    // ffmpeg-next 8.x: 使用 name() 获取格式名称
    let format_long_name = Some(format_name.clone());
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;
    // bit_rate() 返回 i64
    let format_bitrate = {
        let bitrate = ictx.bit_rate();
        if bitrate > 0 {
            Some(bitrate.to_string())
        } else {
            None
        }
    };

    // 查找视频流和音频流
    let mut video_stream_info: Option<(
        u32,
        u32,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<u64>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = None;
    let mut audio_stream_info: Option<(
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = None;

    for (_stream_index, stream) in ictx.streams().enumerate() {
        let codec_params = stream.parameters();
        match codec_params.medium() {
            ffmpeg::media::Type::Video => {
                if video_stream_info.is_none() {
                    // 先获取 codec 信息，因为 codec_params 会被移动
                    let codec = codec_params.id().name().to_string();
                    // codec_params.id() 返回 codec ID，可能不直接提供 long_name
                    // 使用 codec name 作为 fallback
                    let codec_long_name = Some(codec.clone());

                    let decoder = ffmpeg::codec::context::Context::from_parameters(codec_params)
                        .map_err(|e| format!("创建视频解码器失败: {}", e))?;
                    let video = decoder
                        .decoder()
                        .video()
                        .map_err(|e| format!("获取视频解码器失败: {}", e))?;

                    let width = video.width() as u64;
                    let height = video.height() as u64;

                    // 计算帧率
                    // Rational 使用 numerator() 和 denominator()
                    let avg_frame_rate_rational = stream.avg_frame_rate();
                    let fps = if avg_frame_rate_rational.numerator() > 0
                        && avg_frame_rate_rational.denominator() > 0
                    {
                        let fps_value = avg_frame_rate_rational.numerator() as f64
                            / avg_frame_rate_rational.denominator() as f64;
                        Some(format!("{:.2}", fps_value))
                    } else {
                        None
                    };

                    let avg_frame_rate = if avg_frame_rate_rational.numerator() > 0 {
                        Some(format!(
                            "{}/{}",
                            avg_frame_rate_rational.numerator(),
                            avg_frame_rate_rational.denominator()
                        ))
                    } else {
                        None
                    };

                    // frames() 返回 i64
                    let nb_frames = {
                        let frames = stream.frames();
                        if frames > 0 {
                            Some(frames as u64)
                        } else {
                            None
                        }
                    };

                    // format() 返回 Pixel 枚举，使用 Debug 格式化
                    let pix_fmt = Some(format!("{:?}", video.format()));

                    video_stream_info = Some((
                        width as u32,
                        height as u32,
                        codec,
                        codec_long_name,
                        fps,
                        avg_frame_rate,
                        nb_frames,
                        pix_fmt,
                        None, // color_space
                        None, // color_range
                    ));
                }
            }
            ffmpeg::media::Type::Audio => {
                if audio_stream_info.is_none() {
                    // 先获取 codec 信息，因为 codec_params 会被移动
                    let codec = codec_params.id().name().to_string();
                    let codec_long_name = codec.clone();

                    let decoder = ffmpeg::codec::context::Context::from_parameters(codec_params)
                        .map_err(|e| format!("创建音频解码器失败: {}", e))?;
                    let audio = decoder
                        .decoder()
                        .audio()
                        .map_err(|e| format!("获取音频解码器失败: {}", e))?;

                    let channels = audio.channels() as u32;
                    // channel_layout 可能没有 description() 方法
                    // 使用 channels 数量作为替代
                    let channel_layout = format!("{} channels", channels);
                    let sample_rate = audio.rate() as u32;
                    let sample_fmt = audio.format().name().to_string();

                    audio_stream_info = Some((
                        Some(codec),
                        Some(codec_long_name),
                        Some(channels.to_string()),
                        Some(channel_layout),
                        Some(sample_rate.to_string()),
                        None, // bitrate
                        Some(sample_fmt),
                    ));
                }
            }
            _ => {}
        }
    }

    let (
        width,
        height,
        codec,
        codec_long_name,
        fps,
        avg_frame_rate,
        nb_frames,
        pix_fmt,
        color_space,
        color_range,
    ) = video_stream_info.unwrap_or((
        0,
        0,
        String::new(),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    ));

    let (
        audio_codec,
        audio_codec_long_name,
        audio_channels,
        audio_channel_layout,
        audio_sample_rate,
        audio_bitrate,
        audio_sample_fmt,
    ) = audio_stream_info.unwrap_or((None, None, None, None, None, None, None));

    let resolution = format!("{}x{}", width, height);
    let output_dir = Path::new(&path)
        .parent()
        .unwrap_or(Path::new(""))
        .to_string_lossy()
        .to_string();

    Ok(FileInfo {
        path,
        size,
        format: format_name,
        format_long_name,
        codec,
        codec_long_name,
        resolution,
        width: width as u64,
        height: height as u64,
        duration,
        output_dir,
        bitrate: None, // 视频流码率需要从 stream 获取
        fps,
        avg_frame_rate,
        nb_frames,
        pix_fmt,
        color_space,
        color_range,
        audio_codec,
        audio_codec_long_name,
        audio_channels,
        audio_channel_layout,
        audio_sample_rate,
        audio_bitrate,
        audio_bits_per_sample: None,
        audio_sample_fmt,
        format_bitrate,
        format_tags: None, // ffmpeg-next 需要额外处理来获取 tags
    })
    })
    .await
}

// 全局播放器实例（使用 Mutex 保护）
pub type PlayerState = Mutex<Option<VideoPlayer<WindowEmitter>>>;
pub type AudioPlayerState = Mutex<Option<AudioPlayer<WindowEmitter>>>;
static AUDIO_OPEN_SEQ: AtomicU64 = AtomicU64::new(0);
pub type VideoMseStreamState = Mutex<Option<VideoMseStreamSession>>;

pub struct VideoMseStreamSession {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl VideoMseStreamSession {
    fn stop(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

fn resolve_ffmpeg_executable(app: &AppHandle) -> String {
    if cfg!(target_os = "windows") {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let candidate = exe_dir.join("ffmpeg.exe");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(resource_dir) = app.path().resource_dir() {
            let candidates = [
                resource_dir.join("ffmpeg.exe"),
                resource_dir.join("resources").join("ffmpeg.exe"),
                resource_dir.join("ffmpeg").join("windows").join("ffmpeg.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }
    }

    "ffmpeg".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebPlaybackPrepareResult {
    pub play_path: String,
    pub prepared: bool,
    pub reason: String,
}

fn sanitize_stem(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "video".to_string()
    } else {
        out
    }
}

fn normalize_codec(codec: &str) -> String {
    codec.trim().to_lowercase()
}

fn should_prepare_for_web_playback(probe: &MediaProbeResult) -> (bool, String) {
    let ext = probe.base.extension.trim().to_lowercase();
    let container_ok = matches!(ext.as_str(), "mp4" | "m4v" | "mov");

    let (video_codec, audio_codecs) = match &probe.details {
        MediaProbeDetails::Video(details) => {
            let mut video = details.video_codec.clone().unwrap_or_default();
            let mut audios: Vec<String> = Vec::new();
            for s in &details.streams {
                if s.codec_type == "video" && video.is_empty() {
                    video = s.codec_name.clone();
                } else if s.codec_type == "audio" {
                    audios.push(s.codec_name.clone());
                }
            }
            (video, audios)
        }
        _ => (String::new(), Vec::new()),
    };

    let video_codec_norm = normalize_codec(&video_codec);
    let video_ok = matches!(video_codec_norm.as_str(), "h264" | "avc1" | "libx264");

    let audio_ok = audio_codecs.is_empty()
        || audio_codecs.iter().all(|codec| {
            matches!(
                normalize_codec(codec).as_str(),
                "aac" | "mp3" | "opus" | "vorbis" | "mp4a" | "mp4a.40.2"
            )
        });

    let reason = format!(
        "container={} video_codec={} audio_codecs={}",
        ext,
        if video_codec.is_empty() {
            "unknown".to_string()
        } else {
            video_codec
        },
        if audio_codecs.is_empty() {
            "none".to_string()
        } else {
            audio_codecs.join(",")
        }
    );

    let need_prepare = !(container_ok && video_ok && audio_ok);
    (need_prepare, reason)
}

fn build_web_cache_output_path(input_path: &str) -> Result<PathBuf, String> {
    let source_path = Path::new(input_path);
    let metadata = fs::metadata(source_path)
        .map_err(|e| format!("[PLAYER_PREPARE] read source metadata failed: {}", e))?;
    let modified_secs = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let source_size = metadata.len();

    let stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(sanitize_stem)
        .unwrap_or_else(|| "video".to_string());

    let cache_dir = std::env::temp_dir().join("viko-web-playback-cache");
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("[PLAYER_PREPARE] create cache dir failed: {}", e))?;

    Ok(cache_dir.join(format!(
        "{}-{}-{}.mp4",
        stem, source_size, modified_secs
    )))
}

fn is_valid_web_cache_mp4(path: &Path) -> bool {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if meta.len() < 4096 {
        return false;
    }

    let path_str = path.to_string_lossy().to_string();
    let probe = match media_probe::probe_media_details(&path_str) {
        Ok(p) => p,
        Err(_) => return false,
    };
    let (need_prepare, _) = should_prepare_for_web_playback(&probe);
    !need_prepare
}

#[command]
pub async fn prepare_video_for_web_playback(path: String) -> Result<WebPlaybackPrepareResult, String> {
    run_blocking("prepare_video_for_web_playback", move || {
        let probe = media_probe::probe_media_details(&path)?;
        let (need_prepare, probe_reason) = should_prepare_for_web_playback(&probe);

        if !need_prepare {
            return Ok(WebPlaybackPrepareResult {
                play_path: path.clone(),
                prepared: false,
                reason: format!("native-compatible: {}", probe_reason),
            });
        }

        let out_path = build_web_cache_output_path(&path)?;
        let need_rebuild_cache = !is_valid_web_cache_mp4(&out_path);
        if need_rebuild_cache {
            if out_path.exists() {
                let _ = fs::remove_file(&out_path);
            }
            let params = VideoConversionParams {
                input_path: path.clone(),
                output_path: out_path.to_string_lossy().to_string(),
                format: Some("mp4".to_string()),
                video_encoder: Some("h264".to_string()),
                video_bitrate: Some(2200),
                min_bitrate: None,
                max_bitrate: None,
                rc_mode: Some("bitrate".to_string()),
                crf: None,
                resolution: Some("original".to_string()),
                frame_rate: Some("original".to_string()),
                aspect_ratio: None,
                scaling_mode: None,
                gop_size: Some(30),
                preset: Some("veryfast".to_string()),
                profile: None,
                tune: None,
                color_space: None,
                color_range: None,
                bit_depth: Some(8),
                crop: None,
                audio_tracks: None,
                default_audio_params: None,
                audio_filter_spec: None,
                audio_encoder: Some("aac".to_string()),
                use_hardware_acceleration: true,
                use_ultra_fast_speed: true,
                watermark: None,
                forced_watermark: None,
            };

            let emitter = MockEmitter::new();
            convert_video_service::convert_video(emitter, params)
                .map_err(|e| format!("[PLAYER_PREPARE] transcode to web mp4 failed: {}", e))?;
        }

        Ok(WebPlaybackPrepareResult {
            play_path: out_path.to_string_lossy().to_string(),
            prepared: true,
            reason: format!("prepared-web-mp4: {}", probe_reason),
        })
    })
    .await
}

#[command]
pub async fn video_mse_stream_open(
    app: AppHandle,
    path: String,
    start_seconds: Option<f64>,
    chunk_channel: JavaScriptChannelId,
    stream_state: State<'_, VideoMseStreamState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("[MSE_STREAM] main window not found")?;
    let channel = chunk_channel.channel_on(window.as_ref().clone());

    if let Ok(mut guard) = stream_state.lock() {
        if let Some(session) = guard.take() {
            session.stop();
        }
    }

    let stop = Arc::new(AtomicBool::new(false));
    let stop_clone = Arc::clone(&stop);
    let ffmpeg_path = resolve_ffmpeg_executable(&app);
    let seek_seconds = start_seconds.unwrap_or(0.0).max(0.0);

    let handle = std::thread::spawn(move || {
        let mut ffmpeg_args = vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
        ];
        if seek_seconds > 0.0 {
            ffmpeg_args.push("-ss".to_string());
            ffmpeg_args.push(format!("{seek_seconds:.3}"));
        }
        ffmpeg_args.extend([
            "-i".to_string(),
            path.clone(),
            "-fflags".to_string(),
            "+genpts".to_string(),
            "-avoid_negative_ts".to_string(),
            "make_zero".to_string(),
            "-c:v".to_string(),
            "libx264".to_string(),
            "-preset".to_string(),
            "ultrafast".to_string(),
            "-tune".to_string(),
            "zerolatency".to_string(),
            "-profile:v".to_string(),
            "baseline".to_string(),
            "-level:v".to_string(),
            "3.1".to_string(),
            "-g".to_string(),
            "30".to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "128k".to_string(),
            "-movflags".to_string(),
            "+frag_keyframe+empty_moov+default_base_moof".to_string(),
            "-f".to_string(),
            "mp4".to_string(),
            "-".to_string(),
        ]);

        let mut child = match Command::new(&ffmpeg_path)
            .args(&ffmpeg_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(err) => {
                let _ = window.emit(
                    "video-mse-stream-error",
                    format!("[MSE_STREAM] failed to start ffmpeg: {}", err),
                );
                return;
            }
        };

        let Some(mut stdout) = child.stdout.take() else {
            let _ = window.emit(
                "video-mse-stream-error",
                "[MSE_STREAM] ffmpeg stdout unavailable".to_string(),
            );
            let _ = child.kill();
            let _ = child.wait();
            return;
        };

        let stderr_text: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        if let Some(mut stderr) = child.stderr.take() {
            let stderr_text_clone = Arc::clone(&stderr_text);
            let _ = std::thread::spawn(move || {
                let mut s = String::new();
                let _ = stderr.read_to_string(&mut s);
                if let Ok(mut guard) = stderr_text_clone.lock() {
                    *guard = s;
                }
            });
        }

        let mut buf = vec![0_u8; 64 * 1024];
        loop {
            if stop_clone.load(Ordering::Relaxed) {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }

            match stdout.read(&mut buf) {
                Ok(0) => {
                    let _ = child.wait();
                    let _ = window.emit("video-mse-stream-end", "eos");
                    break;
                }
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    let _ = channel.send(InvokeResponseBody::Raw(chunk));
                }
                Err(err) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let stderr_buf = stderr_text
                        .lock()
                        .ok()
                        .map(|s| s.clone())
                        .unwrap_or_default();
                    let _ = window.emit(
                        "video-mse-stream-error",
                        format!(
                            "[MSE_STREAM] read stdout failed: {}{}",
                            err,
                            if stderr_buf.is_empty() {
                                String::new()
                            } else {
                                format!(" | ffmpeg: {}", stderr_buf)
                            }
                        ),
                    );
                    break;
                }
            }
        }
    });

    *stream_state.lock().unwrap() = Some(VideoMseStreamSession {
        stop,
        handle: Some(handle),
    });

    Ok(())
}

#[command]
pub async fn video_mse_stream_close(
    stream_state: State<'_, VideoMseStreamState>,
) -> Result<(), String> {
    let mut guard = stream_state.lock().unwrap();
    if let Some(session) = guard.take() {
        session.stop();
    }
    Ok(())
}

#[command]
pub async fn video_player_open(
    app: AppHandle,
    path: String,
    preview: Option<PreviewSize>,
    frame_channel: Option<JavaScriptChannelId>,
    player_state: State<'_, PlayerState>,
) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("[PLAYER] 未找到主窗口")?;
    let emitter = WindowEmitter::new(
        window.clone(),
        "video-player".to_string(),
        "play".to_string(),
        "video".to_string(),
    );

    // 关闭之前的播放器（如果存在）
    if let Ok(mut player) = player_state.lock() {
        if let Some(mut p) = player.take() {
            p.stop();
        }
    }

    let frame_channel: Option<FrameChannel> = frame_channel
        .map(|id| id.channel_on(window.as_ref().clone()));

    // 创建新的播放器（阻塞初始化放到 blocking 线程）
    let path_for_task = path.clone();
    let player = tauri::async_runtime::spawn_blocking(move || {
        VideoPlayer::new_with_channel(&path_for_task, emitter, preview, frame_channel)
            .map_err(|e| format!("[PLAYER] 打开视频文件失败: {}", e))
    })
    .await
    .map_err(|e| format!("[JOIN:video_player_open] {}", e))??;

    // 保存播放器实例
    *player_state.lock().unwrap() = Some(player);

    Ok(())
}

#[command]
pub async fn video_player_play(player_state: State<'_, PlayerState>) -> Result<(), String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.resume();
        Ok(())
    } else {
        Err("[PLAYER] 播放器未初始化".to_string())
    }
}

#[command]
pub async fn video_player_get_size(
    player_state: State<'_, PlayerState>,
) -> Result<(u32, u32), String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        Ok(p.size())
    } else {
        Err("[PLAYER] 播放器未初始化".to_string())
    }
}

#[command]
pub async fn video_player_pause(player_state: State<'_, PlayerState>) -> Result<(), String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.pause();
        Ok(())
    } else {
        Err("[PLAYER] 播放器未初始化".to_string())
    }
}

#[command]
pub async fn video_player_seek(
    position: f64,
    player_state: State<'_, PlayerState>,
) -> Result<(), String> {
    let mut player = player_state.lock().unwrap();
    if let Some(ref mut p) = *player {
        p.seek(position).map_err(|e| format!("[PLAYER] {}", e))
    } else {
        Err("[PLAYER] 播放器未初始化".to_string())
    }
}

#[command]
pub async fn video_player_get_position(player_state: State<'_, PlayerState>) -> Result<f64, String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        Ok(p.get_current_position())
    } else {
        Err("[PLAYER] 播放器未初始化".to_string())
    }
}

#[command]
pub async fn video_player_get_duration(player_state: State<'_, PlayerState>) -> Result<f64, String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        Ok(p.get_duration())
    } else {
        Err("[PLAYER] 播放器未初始化".to_string())
    }
}

#[command]
pub async fn video_player_close(player_state: State<'_, PlayerState>) -> Result<(), String> {
    let mut player = player_state.lock().unwrap();
    if let Some(mut p) = player.take() {
        p.stop();
        Ok(())
    } else {
        Err("[PLAYER] 播放器未初始化".to_string())
    }
}

#[command]
pub async fn video_player_set_volume(
    volume: f32,
    player_state: State<'_, PlayerState>,
) -> Result<(), String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        log::info!("设置音量: {}", volume);
        p.set_volume(volume);
        Ok(())
    } else {
        Err("[PLAYER] 播放器未初始化".to_string())
    }
}

// 音频播放器相关命令（用于独立测试）

#[command]
pub async fn audio_player_open(
    app: AppHandle,
    path: String,
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<String, String> {
    let seq = AUDIO_OPEN_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    log::info!("audio_player_open called: seq={} path={}", seq, path);
    // 关闭之前的播放器（如果存在）
    if let Ok(mut player) = audio_player_state.lock() {
        if let Some(p) = player.take() {
            log::warn!(
                "audio_player_open replacing existing player (issuing Stop): seq={}",
                seq
            );
            let _ = p.command(crate::services::player::video::PlayerCommand::Stop);
        } else {
            log::info!("audio_player_open no existing player: seq={}", seq);
        }
    }

    // 创建新的音频播放器
    let window = app.get_webview_window("main").ok_or("[PLAYER] 未找到主窗口")?;
    let emitter = WindowEmitter::new(
        window.clone(),
        "audio-player".to_string(),
        "play".to_string(),
        "audio".to_string(),
    );
    let instance_id = format!("audio-player-{}", seq);
    let instance_id_for_task = instance_id.clone();
    let player = tauri::async_runtime::spawn_blocking(move || {
        AudioPlayer::new(path, true, Some(emitter), Some(instance_id_for_task))
            .map_err(|e| format!("[PLAYER] 打开音频文件失败: {}", e))
    })
    .await
    .map_err(|e| format!("[JOIN:audio_player_open] {}", e))??;

    // 并发 open 防抖：仅保留最新一次 open 结果。
    let latest_seq = AUDIO_OPEN_SEQ.load(Ordering::SeqCst);
    if seq != latest_seq {
        log::warn!(
            "audio_player_open stale result dropped: seq={} latest_seq={}",
            seq,
            latest_seq
        );
        return Ok(instance_id);
    }

    // 保存播放器实例
    *audio_player_state.lock().unwrap() = Some(player);
    log::info!("audio_player_open success: seq={} player initialized", seq);

    Ok(instance_id)
}

#[command]
pub async fn audio_player_play(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    log::info!("audio_player_play called: initialized={}", player.is_some());
    if let Some(ref p) = *player {
        p.command(crate::services::player::video::PlayerCommand::Play)
            .map_err(|e| format!("[PLAYER] 播放失败: {}", e))
    } else {
        Err("[PLAYER] 音频播放器未初始化".to_string())
    }
}

#[command]
pub async fn audio_player_pause(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    log::info!("audio_player_pause called: initialized={}", player.is_some());
    if let Some(ref p) = *player {
        p.command(crate::services::player::video::PlayerCommand::Pause)
            .map_err(|e| format!("[PLAYER] 暂停失败: {}", e))
    } else {
        Err("[PLAYER] 音频播放器未初始化".to_string())
    }
}

#[command]
pub async fn audio_player_seek(
    position: f64,
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    log::info!(
        "audio_player_seek called: position={} initialized={}",
        position,
        player.is_some()
    );
    if let Some(ref p) = *player {
        p.command(crate::services::player::video::PlayerCommand::Seek(
            position,
        ))
        .map_err(|e| format!("[PLAYER] 跳转失败: {}", e))
    } else {
        Err("[PLAYER] 音频播放器未初始化".to_string())
    }
}

#[command]
pub async fn audio_player_stop(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let mut player = audio_player_state.lock().unwrap();
    log::info!("audio_player_stop called: initialized={}", player.is_some());
    if let Some(p) = player.take() {
        let _ = p.command(crate::services::player::video::PlayerCommand::Stop);
        log::info!("audio_player_stop success: player dropped");
        Ok(())
    } else {
        log::info!("audio_player_stop ignored: player not initialized (idempotent)");
        Ok(())
    }
}

#[command]
pub async fn audio_player_set_volume(
    volume: f32,
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.set_volume(volume);
        Ok(())
    } else {
        Err("[PLAYER] 音频播放器未初始化".to_string())
    }
}

#[command]
pub async fn audio_player_get_position(
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<f64, String> {
    let player = audio_player_state.lock().unwrap();
    log::debug!("audio_player_get_position called: initialized={}", player.is_some());
    if let Some(ref p) = *player {
        Ok(p.get_current_position())
    } else {
        Err("[PLAYER] 音频播放器未初始化".to_string())
    }
}

#[command]
pub async fn audio_player_get_duration(
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<f64, String> {
    let player = audio_player_state.lock().unwrap();
    log::debug!("audio_player_get_duration called: initialized={}", player.is_some());
    if let Some(ref p) = *player {
        let duration = p.get_duration();
        log::info!("audio_player_get_duration 返回: {} 秒", duration);
        Ok(duration)
    } else {
        log::warn!("audio_player_get_duration: 音频播放器未初始化");
        Err("[PLAYER] 音频播放器未初始化".to_string())
    }
}

// ==================== 音频转换相关命令 ====================

#[derive(Deserialize, Serialize, Clone, Debug)]

pub struct AudioConversionArgs {
    pub task_id: String,
    pub input_path: String,
    pub input_file_type: Option<String>,
    pub output_path: Option<String>, // 如果未提供，自动生成
    pub format: String,
    pub audio_tracks: Option<Vec<crate::services::convert::audio::AudioTrackConfig>>,
    // 兼容旧字段（可不传）
    pub codec: Option<String>,
    pub bitrate: Option<f32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub bit_depth: Option<u32>,
    pub quality: Option<u32>,
    pub use_hardware_acceleration: Option<bool>,
    pub use_ultra_fast_speed: Option<bool>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct DenoiseMediaArgs {
    pub task_id: String,
    pub input_path: String,
    pub input_file_type: Option<String>,
    pub output_path: Option<String>,
    pub format: Option<String>,
    pub engine: Option<String>,
    pub filter: Option<crate::services::convert::denoise::DenoiseFilterConfig>,
    pub use_hardware_acceleration: Option<bool>,
    pub use_ultra_fast_speed: Option<bool>,
    pub forced_watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

#[command]
pub async fn get_audio_file_info(path: String) -> Result<serde_json::Value, String> {
    run_blocking("get_audio_file_info", move || {
        use serde_json::json;

        let size = std::fs::metadata(&path)
            .map_err(|e| format!("无法读取文件信息: {}", e))?
            .len();

        let duration = media_common::get_audio_duration(&path)?;

        let format = Path::new(&path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| "unknown".to_string());

        Ok(json!({
            "path": path,
            "size": size,
            "duration": duration,
            "format": format,
        }))
    })
    .await
}

#[command]
pub async fn convert_audio_file(app: AppHandle, args: AudioConversionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;

    // 如果没有提供输出路径，自动生成
    let resolved_format = if args.format.trim().is_empty() {
        Path::new(&args.input_path)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| "mp3".to_string())
    } else {
        args.format.to_lowercase()
    };

    let output_path = if let Some(path) = args.output_path {
        path
    } else {
        audio::generate_output_path(&args.input_path, &resolved_format)?
    };

    // 构建转换参数
    let params = AudioConversionParams {
        input_path: args.input_path,
        output_path: output_path.clone(),
        format: Some(resolved_format),
        codec: args.codec,
        bitrate: args.bitrate,
        sample_rate: args.sample_rate,
        channels: args.channels,
        bit_depth: args.bit_depth,
        quality: args.quality,
        use_hardware_acceleration: args.use_hardware_acceleration,
        use_ultra_fast_speed: args.use_ultra_fast_speed,
        audio_tracks: args.audio_tracks,
        audio_filter_spec: None,
    };

    let window_clone = window.clone();
    let task_id = args.task_id.clone();
    tauri::async_runtime::spawn(async move {
        let emitter = WindowEmitter::new(
            window_clone,
            task_id,
            "convert-to-audio".to_string(),
            "audio".to_string(),
        );
        let emitter_for_task = emitter.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            audio::convert_audio(emitter_for_task, params)
        })
        .await;

        match outcome {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                emitter.emit("error", None, None, Some(e));
            }
            Err(e) => {
                emitter.emit(
                    "error",
                    None,
                    None,
                    Some(format!("convert_audio task join error: {}", e)),
                );
            }
        }
    });

    Ok(())
}

// ==================== 视频转换相关命令 ====================

#[derive(Deserialize, Serialize, Clone, Debug)]

pub struct VideoConversionArgs {
    pub task_id: String,
    pub input_path: String,
    pub input_file_type: Option<String>,
    pub output_path: Option<String>,
    pub format: Option<String>,
    pub video_encoder: Option<String>,
    pub video_bitrate: Option<u32>,
    pub min_bitrate: Option<u32>,
    pub max_bitrate: Option<u32>,
    pub rc_mode: Option<String>,
    pub crf: Option<u32>,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<String>,
    pub scaling_mode: Option<String>,
    pub frame_rate: Option<String>,
    pub gop_size: Option<u32>,
    pub preset: Option<String>,
    pub profile: Option<String>,
    pub tune: Option<String>,
    pub color_space: Option<String>,
    pub color_range: Option<String>,
    pub bit_depth: Option<u32>,
    pub crop: Option<String>,
    pub audio_encoder: Option<String>,
    pub audio_bitrate: Option<u32>,
    pub audio_sample_rate: Option<u32>,
    pub audio_channels: Option<u32>,
    pub audio_bit_depth: Option<u32>,
    pub audio_quality: Option<u32>,
    pub audio_tracks: Option<Vec<crate::services::convert::video::AudioTrackConfig>>,
    pub default_audio_params:
        Option<crate::media_common::audio_transcode::AudioEncodingParams>,
    pub use_hardware_acceleration: Option<bool>,
    pub use_ultra_fast_speed: Option<bool>,
    pub watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
    pub forced_watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

// ==================== GIF 转换相关命令 ====================

#[derive(Deserialize, Serialize, Clone, Debug)]

pub struct GifConversionArgs {
    pub task_id: String,
    pub input_path: String,
    pub input_file_type: Option<String>,
    #[serde(default)]
    pub output_path: Option<String>,
    pub format: String, // 应该是 "gif"
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub frame_rate: Option<String>,
    #[serde(default)]
    pub quality: Option<u32>,
    #[serde(default)]
    pub preserve_transparency: Option<bool>,
    #[serde(default)]
    pub color_mode: Option<String>,
    #[serde(default)]
    pub dpi: Option<f64>,
    #[serde(default)]
    pub loop_count: Option<i32>,
    #[serde(default)]
    pub frame_delay: Option<u32>,
    #[serde(default)]
    pub colors: Option<u32>,
    #[serde(default)]
    pub preserve_extensions: Option<bool>,
    #[serde(default)]
    pub sharpen: Option<bool>,
    #[serde(default)]
    pub denoise: Option<bool>,
    #[serde(default)]
    pub watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
    #[serde(default)]
    pub forced_watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

// ==================== 媒体缩略图相关命令 ====================

#[command]
pub async fn generate_media_thumbnail(
    window: tauri::Window,
    request_id: String,
    path: String,
    options: Option<crate::services::media_tools::thumbnail::ThumbnailOptions>,
) -> Result<(), String> {
    #[derive(Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct MediaThumbnailEventPayload {
        request_id: String,
        result: Option<crate::services::media_tools::thumbnail::ThumbnailResult>,
        error: Option<String>,
    }

    let window_for_task = window.clone();
    tauri::async_runtime::spawn(async move {
        let task_path = path.clone();
        let task_options = options.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            crate::services::media_tools::thumbnail::generate_thumbnail(&task_path, task_options)
        })
        .await;

        let payload = match outcome {
            Ok(Ok(result)) => MediaThumbnailEventPayload {
                request_id,
                result,
                error: None,
            },
            Ok(Err(err)) => MediaThumbnailEventPayload {
                request_id,
                result: None,
                error: Some(format!("[THUMBNAIL] {}", err)),
            },
            Err(err) => MediaThumbnailEventPayload {
                request_id,
                result: None,
                error: Some(format!("[JOIN:generate_media_thumbnail] {}", err)),
            },
        };

        let _ = window_for_task.emit("media_thumbnail", payload);
    });

    Ok(())
}

// ==================== 压缩相关命令 ====================

#[derive(Deserialize, Serialize, Clone, Debug)]

pub struct VideoCompressionArgs {
    pub task_id: String,
    pub input_path: String,
    pub input_file_type: Option<String>,
    pub output_path: String,
    pub compression_ratio: Option<u32>, // 0-100
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub bitrate: Option<u32>,                    // 视频码率 kbps
    pub frame_rate: Option<String>,              // 目标帧率
    pub codec: Option<String>,                   // h264/h265/vp9/av1
    pub keyframe_interval: Option<u32>,          // GOP 间隔
    pub color_depth: Option<u32>,                // 8/10/12 bit
    pub aspect_ratio: Option<String>,            // 16:9 等
    pub remove_audio: Option<bool>,              // 去除音轨
    pub audio_tracks: Option<Vec<crate::services::compress::video::AudioTrackConfig>>,
    pub preset: Option<String>,                  // ultrafast/fast/medium/slow
    pub use_hardware_acceleration: Option<bool>, // 硬件编码
    pub use_ultra_fast_speed: Option<bool>,      // 极速模式（优先 ultrafast）
    pub forced_watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

#[command]
pub async fn compress_video_file(app: AppHandle, args: VideoCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone();

    tauri::async_runtime::spawn(async move {
        let params = crate::services::compress::video::VideoCompressionParams {
            input_path: args.input_path,
            output_path: args.output_path.clone(),
            width: args.width,
            height: args.height,
            bitrate: args.bitrate,
            frame_rate: args.frame_rate,
            codec: args.codec,
            keyframe_interval: args.keyframe_interval,
            color_depth: args.color_depth,
            aspect_ratio: args.aspect_ratio,
            remove_audio: args.remove_audio,
            audio_tracks: args.audio_tracks,
            preset: args.preset,
            use_hardware_acceleration: args.use_hardware_acceleration,
            use_ultra_fast_speed: args.use_ultra_fast_speed,
            forced_watermark: args.forced_watermark,
        };

        let emitter = WindowEmitter::new(window, task_id, "compress-video".to_string(), "video".to_string());
        let emitter_for_task = emitter.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            crate::services::compress::video::compress_video_file(emitter_for_task, params)
                .map(|_| ())
        })
        .await;

        match outcome {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                emitter.emit("error", None, None, Some(e));
            }
            Err(e) => {
                emitter.emit(
                    "error",
                    None,
                    None,
                    Some(format!("compress_video task join error: {}", e)),
                );
            }
        }
    });

    Ok(())
}

#[derive(Deserialize, Serialize, Clone, Debug)]

pub struct AudioCompressionArgs {
    pub task_id: String,
    pub input_path: String,
    pub input_file_type: Option<String>,
    pub output_path: String,
    #[serde(flatten)]
    pub encoding: crate::media_common::audio_transcode::AudioEncodingParams,
    /// 输出容器格式（用于修正输出扩展名与选择输出 muxer）
    pub format: Option<String>,
    pub remove_silence: Option<bool>,
    pub silence_threshold: Option<f32>,
    pub volume_gain: Option<f32>,
}

#[command]
pub async fn compress_audio_file(app: AppHandle, args: AudioCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone();

    tauri::async_runtime::spawn(async move {
        let params = crate::services::compress::audio::AudioCompressionParams {
            input_path: args.input_path,
            output_path: args.output_path.clone(),
            format: args.format,
            encoding: args.encoding,
            remove_silence: args.remove_silence,
            silence_threshold: args.silence_threshold,
            volume_gain: args.volume_gain,
        };

        let emitter = WindowEmitter::new(window, task_id, "compress-audio".to_string(), "audio".to_string());
        let emitter_for_task = emitter.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            crate::services::compress::audio::compress_audio_file(emitter_for_task, params)
                .map(|_| ())
        })
        .await;

        match outcome {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                emitter.emit("error", None, None, Some(e));
            }
            Err(e) => {
                emitter.emit(
                    "error",
                    None,
                    None,
                    Some(format!("compress_audio task join error: {}", e)),
                );
            }
        }
    });

    Ok(())
}

#[derive(Deserialize, Serialize, Clone, Debug)]

pub struct ImageCompressionArgs {
    pub task_id: String,
    pub input_path: String,
    pub input_file_type: Option<String>,
    pub output_path: String,
    pub quality: Option<u32>,            // 0-100
    pub format: Option<String>,          // "jpg", "png", "webp" ...
    pub width: Option<u32>,              // 目标宽度
    pub height: Option<u32>,             // 目标高度
    pub color_mode: Option<String>,      // "RGB", "RGBA", "Gray", "CMYK"
    pub colors: Option<u32>,           // GIF/APNG 调色板颜色数
    pub strip_metadata: Option<bool>,    // 是否去除元数据
    pub keep_transparency: Option<bool>, // 是否保留透明通道
    pub dpi: Option<f64>,                // DPI
    pub crop_whitespace: Option<bool>,   // 自动裁剪
    pub forced_watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
}

#[command]
pub async fn compress_image_file(app: AppHandle, args: ImageCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone();

    tauri::async_runtime::spawn(async move {
        let params = crate::services::animated_image::ImageCompressionParams {
            input_path: args.input_path,
            output_path: args.output_path.clone(),
            quality: args.quality,
            format: args.format,
            width: args.width,
            height: args.height,
            color_mode: args.color_mode,
            colors: args.colors,
            strip_metadata: args.strip_metadata,
            keep_transparency: args.keep_transparency,
            dpi: args.dpi,
            crop_whitespace: args.crop_whitespace,
            forced_watermark: args.forced_watermark,
        };

        let emitter = WindowEmitter::new(window, task_id, "compress-image".to_string(), "image".to_string());
        let emitter_for_task = emitter.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            crate::services::compress::image::compress_image_file(emitter_for_task, params)
                .map(|_| ())
        })
        .await;

        match outcome {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                emitter.emit("error", None, None, Some(e));
            }
            Err(e) => {
                emitter.emit(
                    "error",
                    None,
                    None,
                    Some(format!("compress_image task join error: {}", e)),
                );
            }
        }
    });

    Ok(())
}

// ==================== Metadata Editor Commands ====================

#[derive(Debug, Deserialize)]
pub struct WriteMetadataArgs {
    pub input_path: String,
    pub output_path: String,
    pub metadata: std::collections::HashMap<String, String>,
}

#[command]
pub async fn write_media_metadata(args: WriteMetadataArgs) -> Result<(), String> {
    run_blocking("write_media_metadata", move || {
        crate::services::media_tools::metadata::write_metadata(
            &args.input_path,
            &args.output_path,
            args.metadata,
        )
    })
    .await
}

// ==================== Task History Commands ====================

#[command]
pub async fn get_task_history(
    limit: Option<u32>,
    offset: Option<u32>,
    task_type: Option<String>,
    keyword: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<crate::storage::task_history::TaskHistoryItem>, String> {
    crate::storage::task_history::get_history(
        limit.unwrap_or(50) as usize,
        offset.unwrap_or(0) as usize,
        task_type,
        keyword,
        sort_by,
        sort_order,
    )
    .await
    .map_err(|e| e.to_string())
}

#[command]
pub async fn get_my_files(
    limit: Option<u32>,
    offset: Option<u32>,
    keyword: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    media_type: Option<String>,
) -> Result<Vec<crate::storage::task_history::MyFileItem>, String> {
    crate::storage::task_history::get_my_files(
        limit.unwrap_or(50) as usize,
        offset.unwrap_or(0) as usize,
        keyword,
        sort_by,
        sort_order,
        media_type,
    )
    .await
    .map_err(|e| e.to_string())
}

#[command]
pub async fn delete_task_history(id: String) -> Result<(), String> {
    crate::storage::task_history::delete_history(&id)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn clear_task_history(task_type: Option<String>) -> Result<(), String> {
    crate::storage::task_history::clear_history(task_type)
        .await
        .map_err(|e| e.to_string())
}

