// Tauri 后端命令定义 - 使用 ffmpeg-next
// 注意：ffmpeg-next 需要在编译时链接 FFmpeg 库
// 如果需要在运行时使用动态加载的 FFmpeg，需要：
// 1. 设置环境变量指向 FFmpeg 库路径
// 2. 或者使用系统安装的 FFmpeg
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use tauri::command;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri::State;

use ffmpeg_next as ffmpeg;

use crate::events::{TaskEmitter, WindowEmitter};
use crate::media_common;
use crate::services::convert::audio::{self, AudioConversionParams};
use crate::services::convert::gif;
use crate::services::ffmpeg::media_info::{self, MediaDetails};
use crate::services::player::audio::AudioPlayer;
use crate::services::player::video::{PreviewSize, VideoPlayer};
use crate::task::queue;
use crate::task::queue::MediaTaskRequest;

#[command]
pub fn get_detailed_media_info(path: String) -> Result<MediaDetails, String> {
    media_info::get_media_details(&path)
}

#[command]
pub async fn media_task_submit(
    app: AppHandle,
    tasks: Vec<MediaTaskRequest>,
    _priority: Option<String>,
) -> Result<usize, String> {
    queue::submit_tasks(app, tasks).await
}

#[command]
pub async fn media_task_has_running_by_type(task_type: Option<String>) -> Result<bool, String> {
    Ok(queue::has_running(task_type).await)
}

#[command]
pub async fn media_task_clear_by_type(task_type: Option<String>) -> Result<usize, String> {
    queue::clear_pending(task_type).await
}

#[command]
pub async fn media_task_clear_by_type_with_stop(
    taskType: Option<String>,
    stopRunning: Option<bool>,
) -> Result<usize, String> {
    queue::clear_pending_with_cancel(taskType, stopRunning.unwrap_or(false)).await
}

#[command]
pub async fn media_task_cancel_task(id: String) -> Result<(), String> {
    queue::cancel_task(id).await
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
pub fn run_self_check() -> Result<SelfCheckResult, String> {
    let (fs_permission, fs_error) = check_fs_permission();

    Ok(SelfCheckResult {
        fs_permission,
        fs_error,
    })
}

#[command]
pub fn get_device_id() -> Result<String, String> {
    machine_uid::get().map_err(|e| e.to_string())
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
pub fn auth_exchange_code(input: AuthExchangeCodeInput) -> Result<AuthTokenResponse, String> {
    if input.token_endpoint.trim().is_empty() {
        return Err("token_endpoint is required".to_string());
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
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_else(|_| String::new());
        return Err(format!("Token exchange failed with status {}: {}", status, text));
    }

    let text = response
        .text()
        .map_err(|e| format!("Read token response failed: {}", e))?;
    serde_json::from_str::<AuthTokenResponse>(&text)
        .map_err(|e| format!("Parse token response failed: {}", e))
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
pub fn check_hardware_acceleration() -> Result<HardwareSupport, String> {
    // Check for hardware encoders on various platforms

    // H.264 Encoders
    let h264_encoders = vec![
        "h264_videotoolbox", // macOS
        "h264_nvenc",        // NVIDIA
        "h264_qsv",          // Intel QuickSync
        "h264_amf",          // AMD AMF
        "h264_mf",           // Windows Media Foundation
    ];
    let h264_hardware = h264_encoders
        .iter()
        .any(|name| ffmpeg::encoder::find_by_name(name).is_some());

    // HEVC Encoders
    let hevc_encoders = vec![
        "hevc_videotoolbox", // macOS
        "hevc_nvenc",        // NVIDIA
        "hevc_qsv",          // Intel QuickSync
        "hevc_amf",          // AMD AMF
        "hevc_mf",           // Windows Media Foundation
    ];
    let hevc_hardware = hevc_encoders
        .iter()
        .any(|name| ffmpeg::encoder::find_by_name(name).is_some());

    // ProRes Encoders (Mainly macOS)
    let prores_encoders = vec!["prores_videotoolbox"];
    let prores_hardware = prores_encoders
        .iter()
        .any(|name| ffmpeg::encoder::find_by_name(name).is_some());

    log::info!(
        "Hardware Acceleration Check: H.264={}, HEVC={}, ProRes={}",
        h264_hardware,
        hevc_hardware,
        prores_hardware
    );

    Ok(HardwareSupport {
        h264_hardware,
        hevc_hardware,
        prores_hardware,
    })
}

// 注意：本项目使用 ffmpeg-next 8.x 并链接系统 FFmpeg 库
#[command]
pub fn get_media_info(path: String) -> Result<FileInfo, String> {
    // 初始化 FFmpeg
    ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;

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
}

// 从输出文件路径推断格式
fn detect_format_from_path(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
}

// 根据格式获取推荐的视频编码器
fn get_video_codec_for_format(format: &str, user_codec: Option<&str>) -> String {
    // 如果用户指定了编码器，优先使用
    if let Some(codec) = user_codec {
        return codec.to_string();
    }

    // 根据格式推荐编码器
    match format.to_lowercase().as_str() {
        "mp4" | "m4v" => "libx264".to_string(),
        "webm" => "libvpx-vp9".to_string(),
        "avi" => "libx264".to_string(),
        "mov" => "libx264".to_string(),
        "mkv" => "libx264".to_string(),
        "flv" => "libx264".to_string(),
        "ts" | "mts" => "libx264".to_string(),
        _ => "libx264".to_string(), // 默认使用 H.264
    }
}

// 根据格式获取推荐的音频编码器
fn get_audio_codec_for_format(format: &str) -> String {
    match format.to_lowercase().as_str() {
        "mp4" | "m4v" | "mov" => "aac".to_string(),
        "webm" => "libopus".to_string(),
        "avi" => "aac".to_string(),
        "mkv" => "aac".to_string(),
        "flv" => "aac".to_string(),
        "ts" | "mts" => "aac".to_string(),
        _ => "aac".to_string(), // 默认使用 AAC
    }
}

// 解析 FFmpeg 参数数组
fn parse_ffmpeg_args(
    args: &[String],
) -> Result<
    (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>, // 添加格式参数
    ),
    String,
> {
    let mut input_path = None;
    let mut output_path = None;
    let mut resolution = None;
    let mut bitrate = None;
    let mut codec = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-i" => {
                if i + 1 < args.len() {
                    input_path = Some(args[i + 1].clone());
                    i += 2;
                } else {
                    return Err("缺少输入文件路径".to_string());
                }
            }
            "-s" => {
                if i + 1 < args.len() {
                    resolution = Some(args[i + 1].clone());
                    i += 2;
                } else {
                    return Err("缺少分辨率参数".to_string());
                }
            }
            "-b:v" => {
                if i + 1 < args.len() {
                    bitrate = Some(args[i + 1].clone());
                    i += 2;
                } else {
                    return Err("缺少码率参数".to_string());
                }
            }
            "-c:v" => {
                if i + 1 < args.len() {
                    codec = Some(args[i + 1].clone());
                    i += 2;
                } else {
                    return Err("缺少编码器参数".to_string());
                }
            }
            _ => {
                // 可能是输出文件路径（最后一个参数）
                if i == args.len() - 1 && output_path.is_none() {
                    output_path = Some(args[i].clone());
                }
                i += 1;
            }
        }
    }

    let input = input_path.ok_or("未找到输入文件路径".to_string())?;
    let output = output_path.ok_or("未找到输出文件路径".to_string())?;

    // 从输出路径推断格式
    let format = detect_format_from_path(&output);

    Ok((input, output, resolution, bitrate, codec, format))
}

// 全局播放器实例（使用 Mutex 保护）
pub type PlayerState = Mutex<Option<VideoPlayer<WindowEmitter>>>;
pub type AudioPlayerState = Mutex<Option<AudioPlayer<WindowEmitter>>>;

#[command]
pub fn video_player_open(
    app: AppHandle,
    path: String,
    preview: Option<PreviewSize>,
    player_state: State<'_, PlayerState>,
) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
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

    // 创建新的播放器
    let player = VideoPlayer::new(&path, emitter, preview)
        .map_err(|e| format!("打开视频文件失败: {}", e))?;

    // 保存播放器实例
    *player_state.lock().unwrap() = Some(player);

    Ok(())
}

#[command]
pub fn video_player_play(player_state: State<'_, PlayerState>) -> Result<(), String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.resume();
        Ok(())
    } else {
        Err("播放器未初始化".to_string())
    }
}

#[command]
pub fn video_player_pause(player_state: State<'_, PlayerState>) -> Result<(), String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.pause();
        Ok(())
    } else {
        Err("播放器未初始化".to_string())
    }
}

#[command]
pub fn video_player_seek(
    position: f64,
    player_state: State<'_, PlayerState>,
) -> Result<(), String> {
    let mut player = player_state.lock().unwrap();
    if let Some(ref mut p) = *player {
        p.seek(position)
    } else {
        Err("播放器未初始化".to_string())
    }
}

#[command]
pub fn video_player_get_position(player_state: State<'_, PlayerState>) -> Result<f64, String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        Ok(p.get_current_position())
    } else {
        Err("播放器未初始化".to_string())
    }
}

#[command]
pub fn video_player_get_duration(player_state: State<'_, PlayerState>) -> Result<f64, String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        Ok(p.get_duration())
    } else {
        Err("播放器未初始化".to_string())
    }
}

#[command]
pub fn video_player_close(player_state: State<'_, PlayerState>) -> Result<(), String> {
    let mut player = player_state.lock().unwrap();
    if let Some(mut p) = player.take() {
        p.stop();
        Ok(())
    } else {
        Err("播放器未初始化".to_string())
    }
}

#[command]
pub fn video_player_set_volume(
    volume: f32,
    player_state: State<'_, PlayerState>,
) -> Result<(), String> {
    let player = player_state.lock().unwrap();
    if let Some(ref p) = *player {
        log::info!("设置音量: {}", volume);
        p.set_volume(volume);
        Ok(())
    } else {
        Err("播放器未初始化".to_string())
    }
}

// 音频播放器相关命令（用于独立测试）

#[command]
pub fn audio_player_open(
    app: AppHandle,
    path: String,
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<(), String> {
    // 关闭之前的播放器（如果存在）
    if let Ok(mut player) = audio_player_state.lock() {
        if let Some(p) = player.take() {
            let _ = p.command(crate::services::player::video::PlayerCommand::Stop);
        }
    }

    // 创建新的音频播放器
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let emitter = WindowEmitter::new(
        window.clone(),
        "audio-player".to_string(),
        "play".to_string(),
        "audio".to_string(),
    );
    let player = AudioPlayer::new(path, true, Some(emitter))
        .map_err(|e| format!("打开音频文件失败: {}", e))?;

    // 保存播放器实例
    *audio_player_state.lock().unwrap() = Some(player);

    Ok(())
}

#[command]
pub fn audio_player_play(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.command(crate::services::player::video::PlayerCommand::Play)
            .map_err(|e| format!("播放失败: {}", e))
    } else {
        Err("音频播放器未初始化".to_string())
    }
}

#[command]
pub fn audio_player_pause(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.command(crate::services::player::video::PlayerCommand::Pause)
            .map_err(|e| format!("暂停失败: {}", e))
    } else {
        Err("音频播放器未初始化".to_string())
    }
}

#[command]
pub fn audio_player_seek(
    position: f64,
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.command(crate::services::player::video::PlayerCommand::Seek(
            position,
        ))
        .map_err(|e| format!("跳转失败: {}", e))
    } else {
        Err("音频播放器未初始化".to_string())
    }
}

#[command]
pub fn audio_player_stop(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let mut player = audio_player_state.lock().unwrap();
    if let Some(p) = player.take() {
        let _ = p.command(crate::services::player::video::PlayerCommand::Stop);
        Ok(())
    } else {
        Err("音频播放器未初始化".to_string())
    }
}

#[command]
pub fn audio_player_set_volume(
    volume: f32,
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.set_volume(volume);
        Ok(())
    } else {
        Err("音频播放器未初始化".to_string())
    }
}

#[command]
pub fn audio_player_get_position(
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<f64, String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        Ok(p.get_current_position())
    } else {
        Err("音频播放器未初始化".to_string())
    }
}

#[command]
pub fn audio_player_get_duration(
    audio_player_state: State<'_, AudioPlayerState>,
) -> Result<f64, String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        let duration = p.get_duration();
        log::debug!("audio_player_get_duration 返回: {} 秒", duration);
        Ok(duration)
    } else {
        log::warn!("audio_player_get_duration: 音频播放器未初始化");
        Err("音频播放器未初始化".to_string())
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

#[command]
pub fn get_audio_file_info(path: String) -> Result<serde_json::Value, String> {
    use serde_json::json;

    // 获取文件大小
    let size = std::fs::metadata(&path)
        .map_err(|e| format!("无法读取文件信息: {}", e))?
        .len();

    // 获取音频时长
    let duration = media_common::get_audio_duration(&path)?;

    // 获取文件扩展名
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
}

#[command]
pub fn convert_audio_file(app: AppHandle, args: AudioConversionArgs) -> Result<(), String> {
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
    };

    // 在新线程中执行转换
    let window_clone = window.clone();
    let task_id = args.task_id.clone();
    std::thread::spawn(move || {
        let emitter = WindowEmitter::new(
            window_clone,
            task_id.clone(),
            "convert-audio".to_string(),
            "audio".to_string(),
        );

        if let Err(e) = audio::convert_audio(emitter.clone(), params) {
            emitter.emit("error", None, None, Some(e));
        } else {
            // It returns Result. The error handling was OUTSIDE.
            // So if Err(e), I must emit error here.
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
        Option<crate::services::convert::audio_transcode::AudioEncodingParams>,
    pub use_hardware_acceleration: Option<bool>,
    pub use_ultra_fast_speed: Option<bool>,
    pub watermark: Option<crate::services::media_tools::watermark::WatermarkConfig>,
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
    pub frame_rate: Option<f32>,
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
}

#[command]
pub fn convert_gif_file(app: AppHandle, args: GifConversionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;

    // 如果没有提供输出路径，自动生成
    let output_path = if let Some(path) = args.output_path {
        path
    } else {
        let path = Path::new(&args.input_path);
        let stem = path.file_stem().unwrap().to_str().unwrap();
        let parent = path.parent().unwrap();
        parent
            .join(format!("{}.gif", stem))
            .to_str()
            .unwrap()
            .to_string()
    };

    let window = window.clone();
    let task_id = args.task_id.clone();

    std::thread::spawn(move || {
        let params = gif::GifConversionParams {
            input_path: args.input_path,
            output_path: output_path.clone(),
            width: args.width,
            height: args.height,
            frame_rate: args.frame_rate,
            quality: args.quality,
            preserve_transparency: args.preserve_transparency,
            color_mode: args.color_mode,
            dpi: args.dpi,
            loop_count: args.loop_count,
            frame_delay: args.frame_delay,
            colors: args.colors,
            preserve_extensions: args.preserve_extensions,
            sharpen: args.sharpen,
            denoise: args.denoise,
        };

        let emitter =
            WindowEmitter::new(window, task_id, "convert-gif".to_string(), "image".to_string());

        if let Err(e) = gif::convert_video_to_gif(emitter.clone(), params).map(|_| ()) {
            emitter.emit("error", None, None, Some(e));
        }
    });

    Ok(())
}

// ==================== 媒体缩略图相关命令 ====================

#[command]
pub fn generate_media_thumbnail(
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
                error: Some(err),
            },
            Err(err) => MediaThumbnailEventPayload {
                request_id,
                result: None,
                error: Some(format!("Thumbnail task failed: {}", err)),
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
    pub frame_rate: Option<f32>,                 // 目标帧率
    pub codec: Option<String>,                   // h264/h265/vp9/av1
    pub keyframe_interval: Option<u32>,          // GOP 间隔
    pub color_depth: Option<u32>,                // 8/10/12 bit
    pub aspect_ratio: Option<String>,            // 16:9 等
    pub remove_audio: Option<bool>,              // 去除音轨
    pub audio_bitrate: Option<u32>,              // 音频码率 kbps
    pub preset: Option<String>,                  // ultrafast/fast/medium/slow
    pub use_hardware_acceleration: Option<bool>, // 硬件编码
}

#[command]
pub fn compress_video_file(app: AppHandle, args: VideoCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone();

    std::thread::spawn(move || {
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
            audio_bitrate: args.audio_bitrate,
            preset: args.preset,
            use_hardware_acceleration: args.use_hardware_acceleration,
        };

        let emitter =
            WindowEmitter::new(window, task_id, "compress-video".to_string(), "video".to_string());

        if let Err(e) =
            crate::services::compress::video::compress_video_file(emitter.clone(), params)
                .map(|_| ())
        {
            emitter.emit("error", None, None, Some(e));
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
    pub sample_rate: Option<u32>,
    pub bitrate: Option<u32>,
    pub codec: Option<String>,
    pub channels: Option<u32>,
    pub bit_depth: Option<u32>,
    pub remove_silence: Option<bool>,
    pub silence_threshold: Option<f32>,
    pub volume_gain: Option<f32>,
}

#[command]
pub fn compress_audio_file(app: AppHandle, args: AudioCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone();

    std::thread::spawn(move || {
        let params = crate::services::compress::audio::AudioCompressionParams {
            input_path: args.input_path,
            output_path: args.output_path.clone(),
            sample_rate: args.sample_rate,
            bitrate: args.bitrate,
            codec: args.codec,
            channels: args.channels,
            bit_depth: args.bit_depth,
            remove_silence: args.remove_silence,
            silence_threshold: args.silence_threshold,
            volume_gain: args.volume_gain,
        };

        let emitter =
            WindowEmitter::new(window, task_id, "compress-audio".to_string(), "audio".to_string());

        if let Err(e) =
            crate::services::compress::audio::compress_audio_file(emitter.clone(), params)
                .map(|_| ())
        {
            emitter.emit("error", None, None, Some(e));
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
    pub strip_metadata: Option<bool>,    // 是否去除元数据
    pub keep_transparency: Option<bool>, // 是否保留透明通道
    pub dpi: Option<f64>,                // DPI
    pub crop_whitespace: Option<bool>,   // 自动裁剪
}

#[command]
pub fn compress_image_file(app: AppHandle, args: ImageCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone();

    std::thread::spawn(move || {
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

        let emitter =
            WindowEmitter::new(window, task_id, "compress-image".to_string(), "image".to_string());

        if let Err(e) =
            crate::services::compress::image::compress_image_file(emitter.clone(), params)
                .map(|_| ())
        {
            emitter.emit("error", None, None, Some(e));
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
pub fn write_media_metadata(args: WriteMetadataArgs) -> Result<(), String> {
    println!("write_media_metadata: {:?}", args);
    crate::services::media_tools::metadata::write_metadata(
        &args.input_path,
        &args.output_path,
        args.metadata,
    )
}

// ==================== Task History Commands ====================

#[command]
pub async fn get_task_history(
    limit: Option<u32>,
    offset: Option<u32>,
    task_type: Option<String>,
    keyword: Option<String>,
) -> Result<Vec<crate::storage::task_history::TaskHistoryItem>, String> {
    crate::storage::task_history::get_history(
        limit.unwrap_or(50) as usize,
        offset.unwrap_or(0) as usize,
        task_type,
        keyword,
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
pub async fn set_my_file_favorite(id: String, favorite: bool) -> Result<(), String> {
    crate::storage::favorites::set_favorite(&id, favorite)
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
