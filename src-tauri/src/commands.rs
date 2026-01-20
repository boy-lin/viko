// src-tauri/src/lib/commands.rs
// Tauri 后端命令定义 - 使用 ffmpeg-next
//
// 注意：ffmpeg-next 需要在编译时链接 FFmpeg 库
// 如果需要在运行时使用动态加载的 FFmpeg，需要：
// 1. 设置环境变量指向 FFmpeg 库路径
// 2. 或者使用系统安装的 FFmpeg
//
// 模块下载功能保留，但实际使用需要系统 FFmpeg 支持
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

use crate::audio::AudioPlayer;
use crate::audio_converter::{self, AudioConversionParams};
use crate::media_common;
use crate::ffmpeg_media_info::{self, MediaDetails};
use crate::gif_converter;
use crate::video_player::{PreviewSize, VideoPlayer};

#[command]
pub fn get_detailed_media_info(path: String) -> Result<MediaDetails, String> {
    ffmpeg_media_info::get_media_details(&path)
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
    let test_path = download_dir.join("audio_video_kit_permission_probe.tmp");
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
pub fn check_hardware_acceleration() -> Result<HardwareSupport, String> {
    // Check for macOS VideoToolbox encoders using ffmpeg-next library
    // This avoids dependency on external ffmpeg CLI and PATH issues
    let h264_hardware = ffmpeg::encoder::find_by_name("h264_videotoolbox").is_some();
    let hevc_hardware = ffmpeg::encoder::find_by_name("hevc_videotoolbox").is_some();
    let prores_hardware = ffmpeg::encoder::find_by_name("prores_videotoolbox").is_some();

    log::info!(
        "Hardware Acceleration Check (Library): H.264={}, HEVC={}, ProRes={}",
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

// 注意：使用 ffmpeg-next 8.0.0 后，不再需要下载和管理 FFmpeg 二进制文件
// 所有 FFmpeg 功能都通过编译时链接的系统库提供
// 以下函数保留简化版本，仅用于兼容前端代码

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
    // ffmpeg-next 8.0.0 中 long_name() 方法可能已移除
    let format_long_name = Some(format_name.clone());
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;
    // ffmpeg-next 8.0.0: bit_rate() 返回 i64 而不是 Option
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
                    // ffmpeg-next 8.0.0 中 codec_params.id() 可能不提供 long_name
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
                    // ffmpeg-next 8.0.0 API 变化：Rational 使用 numerator() 和 denominator()
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

                    // ffmpeg-next 8.0.0: frames() 返回 i64 而不是 Option
                    let nb_frames = {
                        let frames = stream.frames();
                        if frames > 0 {
                            Some(frames as u64)
                        } else {
                            None
                        }
                    };

                    // ffmpeg-next 8.0.0: format() 返回 Pixel 枚举，使用 Debug 格式化
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
                    // ffmpeg-next 8.0.0 中 channel_layout 可能没有 description() 方法
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

#[command]
pub fn ffmpeg_exec(app: AppHandle, ffmpeg_args: Vec<String>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;

    // 初始化 FFmpeg
    ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;

    // 解析参数
    let (input_path, output_path, resolution, bitrate, codec, format) =
        parse_ffmpeg_args(&ffmpeg_args)?;

    // 在新线程中执行转码
    let window = window.clone();
    std::thread::spawn(move || {
        if let Err(e) = transcode_video(
            &window,
            &input_path,
            &output_path,
            resolution.as_deref(),
            bitrate.as_deref(),
            codec.as_deref(),
            format.as_deref(),
        ) {
            let _ = window.emit("ffmpeg-complete", format!("error: {}", e));
        } else {
            let _ = window.emit("ffmpeg-complete", "ok");
        }
    });

    Ok(())
}

// 使用 FFmpeg 命令行工具进行视频转码（通过 FFI 调用系统 FFmpeg）
// 注意：这里使用命令行 FFmpeg，它内部使用 FFI 调用 FFmpeg 库
fn transcode_video(
    window: &tauri::WebviewWindow,
    input_path: &str,
    output_path: &str,
    resolution: Option<&str>,
    bitrate: Option<&str>,
    codec: Option<&str>,
    format: Option<&str>,
) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    // 首先获取输入文件的时长（用于计算进度）
    let duration = get_video_duration(input_path)?;

    // 确定输出格式（从路径推断或使用默认值）
    let output_format = format.unwrap_or("mp4");

    // 根据格式选择合适的编码器
    let video_codec = get_video_codec_for_format(output_format, codec);
    let audio_codec = get_audio_codec_for_format(output_format);

    // 记录转码参数（用于调试）
    let debug_info = format!(
        "转码参数: 输入={}, 输出={}, 格式={}, 视频编码器={}, 音频编码器={}, 分辨率={:?}, 码率={:?}",
        input_path, output_path, output_format, video_codec, audio_codec, resolution, bitrate
    );
    log::info!("{}", debug_info);
    // 发送调试信息到前端
    let _ = window.emit("ffmpeg-progress", format!("调试: {}", debug_info));

    // 构建 FFmpeg 命令
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-i").arg(input_path);
    cmd.arg("-y"); // 覆盖输出文件
    cmd.arg("-progress").arg("pipe:1"); // 将进度输出到 stdout
    cmd.arg("-loglevel").arg("info"); // 使用 info 级别以便调试

    // 明确指定输出格式
    cmd.arg("-f").arg(output_format);

    // 设置视频编码器
    cmd.arg("-c:v").arg(&video_codec);

    // 为 H.264 编码器添加兼容性参数
    if video_codec == "libx264" {
        cmd.arg("-preset").arg("medium"); // 编码速度与质量平衡
        cmd.arg("-profile:v").arg("high"); // 使用 high profile 提高兼容性
        cmd.arg("-level").arg("4.0"); // 设置 level 提高兼容性
        cmd.arg("-pix_fmt").arg("yuv420p"); // 使用 yuv420p 像素格式（最兼容）
    }

    // 为 VP9 编码器添加参数
    if video_codec == "libvpx-vp9" {
        cmd.arg("-b:v").arg(bitrate.unwrap_or("0")); // VP9 需要码率
        cmd.arg("-crf").arg("30"); // 质量参数
    }

    // 设置分辨率
    if let Some(res) = resolution {
        cmd.arg("-s").arg(res);
    }

    // 设置码率（如果未在编码器参数中设置）
    if video_codec != "libvpx-vp9" {
        if let Some(bitrate_str) = bitrate {
            cmd.arg("-b:v").arg(bitrate_str);
        }
    }

    // 设置音频编码器
    cmd.arg("-c:a").arg(&audio_codec);

    // 为音频编码器添加参数
    if audio_codec == "aac" {
        cmd.arg("-b:a").arg("128k"); // AAC 码率
        cmd.arg("-ar").arg("44100"); // 采样率
    } else if audio_codec == "libopus" {
        cmd.arg("-b:a").arg("128k"); // Opus 码率
    }

    // 输出文件
    cmd.arg(output_path);

    // 启动进程并捕获输出
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 FFmpeg 进程失败: {}", e))?;

    // 读取进度输出
    let mut last_progress = 0.0;
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                // 解析进度信息
                // FFmpeg 进度格式: out_time_ms=12345678
                if line.starts_with("out_time_ms=") {
                    if let Some(time_str) = line.strip_prefix("out_time_ms=") {
                        if let Ok(time_ms) = time_str.parse::<u64>() {
                            // 计算进度百分比
                            if duration > 0.0 {
                                let time_sec = time_ms as f64 / 1000.0;
                                let progress = (time_sec / duration * 100.0).min(100.0);

                                // 只在进度变化超过 1% 时发送更新
                                if (progress - last_progress).abs() >= 1.0 {
                                    last_progress = progress;
                                    let _ =
                                        window.emit("ffmpeg-progress", format!("{:.1}%", progress));
                                }
                            }
                        }
                    }
                } else if line.starts_with("progress=") {
                    // progress=end 表示完成
                    if line.contains("end") {
                        let _ = window.emit("ffmpeg-progress", "100.0%");
                        break;
                    }
                }
            }
        }
    }

    // 等待进程完成
    let status = child
        .wait()
        .map_err(|e| format!("等待 FFmpeg 进程失败: {}", e))?;

    if !status.success() {
        // 读取错误信息
        if let Some(mut stderr) = child.stderr {
            use std::io::Read;
            let mut error_msg = String::new();
            let _ = stderr.read_to_string(&mut error_msg);

            // 记录详细错误信息
            log::error!("FFmpeg 转码失败: {}", error_msg);

            // 提取关键错误信息
            let error_summary = if error_msg.contains("Invalid data found") {
                "无效的数据格式，可能是编码器与容器格式不兼容"
            } else if error_msg.contains("codec") {
                "编码器错误，请检查编码器是否支持该格式"
            } else if error_msg.contains("format") {
                "格式错误，请检查输出格式是否正确"
            } else {
                "转码失败"
            };

            return Err(format!("{}: {}", error_summary, error_msg));
        }
        return Err("FFmpeg 转码失败（无法读取错误信息）".to_string());
    }

    // 验证输出文件是否存在
    if !Path::new(output_path).exists() {
        return Err(format!("转码完成但输出文件不存在: {}", output_path));
    }

    log::info!("转码成功完成: {}", output_path);
    Ok(())
}

// 获取视频文件的时长（秒）
fn get_video_duration(input_path: &str) -> Result<f64, String> {
    // 初始化 FFmpeg
    ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;

    // 打开输入文件
    let ictx = ffmpeg::format::input(input_path).map_err(|e| format!("打开文件失败: {}", e))?;

    // 获取时长
    let duration = ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;
    Ok(duration)
}

// 解析分辨率字符串 "1920x1080" -> (1920, 1080)
fn parse_resolution(res: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = res.split('x').collect();
    if parts.len() == 2 {
        if let (Ok(w), Ok(h)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
            return Some((w, h));
        }
    }
    None
}

// 解析码率字符串 "2000k" -> 2000000
fn parse_bitrate(bitrate: &str) -> Result<i64, String> {
    let bitrate = bitrate.trim().to_lowercase();
    let multiplier = if bitrate.ends_with('k') {
        1000
    } else if bitrate.ends_with('m') {
        1000000
    } else {
        1
    };

    let num_str = if bitrate.ends_with('k') || bitrate.ends_with('m') {
        &bitrate[..bitrate.len() - 1]
    } else {
        &bitrate
    };

    num_str
        .parse::<i64>()
        .map(|n| n * multiplier)
        .map_err(|_| format!("无效的码率格式: {}", bitrate))
}

// 视频播放器相关命令

// 全局播放器实例（使用 Mutex 保护）
pub type PlayerState = Mutex<Option<VideoPlayer>>;
pub type AudioPlayerState = Mutex<Option<AudioPlayer>>;

#[command]
pub fn video_player_open(
    app: AppHandle,
    path: String,
    preview: Option<PreviewSize>,
    player_state: State<'_, PlayerState>,
) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;

    // 关闭之前的播放器（如果存在）
    if let Ok(mut player) = player_state.lock() {
        if let Some(mut p) = player.take() {
            p.stop();
        }
    }

    // 创建新的播放器
    let player =
        VideoPlayer::new(&path, window, preview).map_err(|e| format!("打开视频文件失败: {}", e))?;

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
            let _ = p.command(crate::video_player::PlayerCommand::Stop);
        }
    }

    // 创建新的音频播放器
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let player = AudioPlayer::new(path, true, Some(window))
        .map_err(|e| format!("打开音频文件失败: {}", e))?;

    // 保存播放器实例
    *audio_player_state.lock().unwrap() = Some(player);

    Ok(())
}

#[command]
pub fn audio_player_play(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.command(crate::video_player::PlayerCommand::Play)
            .map_err(|e| format!("播放失败: {}", e))
    } else {
        Err("音频播放器未初始化".to_string())
    }
}

#[command]
pub fn audio_player_pause(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let player = audio_player_state.lock().unwrap();
    if let Some(ref p) = *player {
        p.command(crate::video_player::PlayerCommand::Pause)
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
        p.command(crate::video_player::PlayerCommand::Seek(position))
            .map_err(|e| format!("跳转失败: {}", e))
    } else {
        Err("音频播放器未初始化".to_string())
    }
}

#[command]
pub fn audio_player_stop(audio_player_state: State<'_, AudioPlayerState>) -> Result<(), String> {
    let mut player = audio_player_state.lock().unwrap();
    if let Some(p) = player.take() {
        let _ = p.command(crate::video_player::PlayerCommand::Stop);
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

#[derive(Deserialize)]
pub struct AudioConversionArgs {
    pub task_id: String,
    pub input_path: String,
    pub output_path: Option<String>, // 如果未提供，自动生成
    pub format: Option<String>,
    pub codec: Option<String>,
    pub bitrate: Option<u32>,
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
        audio_converter::generate_output_path(&args.input_path, &resolved_format)?
    };

    // 构建转换参数
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

    // 在新线程中执行转换
    let window_clone = window.clone();
    let output_path_clone = output_path.clone();
    let task_id = args.task_id.clone();
    std::thread::spawn(move || {
        if let Err(e) = audio_converter::convert_audio(&window_clone, params, task_id.clone()) {
            crate::events::emit_media_task_event(
                &window_clone,
                &task_id,
                "convert",
                "audio",
                "error",
                None,
                None,
                Some(e),
            );
        } else {
            crate::events::emit_media_task_event(
                &window_clone,
                &task_id,
                "convert",
                "audio",
                "complete",
                Some(100.0),
                Some(output_path_clone),
                None,
            );
        }
    });

    Ok(())
}

// ==================== 视频转换相关命令 ====================

#[derive(Deserialize)]
pub struct VideoConversionArgs {
    pub task_id: String,
    pub input_path: String,
    pub output_path: Option<String>,
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
    pub audio_encoder: Option<String>,
    pub audio_bitrate: Option<u32>,
    pub audio_sample_rate: Option<u32>,
    pub audio_channels: Option<u32>,
    pub audio_bit_depth: Option<u32>,
    pub audio_quality: Option<u32>,
    pub audio_tracks: Option<Vec<crate::video_converter::AudioTrackConfig>>,
    pub default_audio_params: Option<crate::audio_converter::AudioEncodingParams>,
    pub use_hardware_acceleration: Option<bool>,
    pub use_ultra_fast_speed: Option<bool>,
}

#[command]
pub fn convert_video_file(app: AppHandle, args: VideoConversionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;

    // 如果没有提供输出路径，自动生成
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
        let stem = path.file_stem().unwrap().to_str().unwrap();
        let parent = path.parent().unwrap();
        parent
            .join(format!("{}.{}", stem, resolved_format))
            .to_str()
            .unwrap()
            .to_string()
    };

    let window = window.clone();
    let task_id = args.task_id.clone();

    std::thread::spawn(move || {
        let params = crate::video_converter::VideoConversionParams {
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
        };

        if let Err(e) = crate::video_converter::convert_video(&window, params, task_id.clone()) {
            crate::events::emit_media_task_event(
                &window,
                &task_id,
                "convert",
                "video",
                "error",
                None,
                None,
                Some(e),
            );
        } else {
            crate::events::emit_media_task_event(
                &window,
                &task_id,
                "convert",
                "video",
                "complete",
                Some(100.0),
                Some(output_path),
                None,
            );
        }
    });

    Ok(())
}

// ==================== GIF 转换相关命令 ====================

#[derive(Deserialize)]
pub struct GifConversionArgs {
    pub task_id: String,
    pub input_path: String,
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
        let params = gif_converter::GifConversionParams {
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

        if let Err(e) = gif_converter::convert_video_to_gif(&window, params, task_id.clone()) {
            crate::events::emit_media_task_event(
                &window,
                &task_id,
                "convert",
                "image",
                "error",
                None,
                None,
                Some(e),
            );
        } else {
            crate::events::emit_media_task_event(
                &window,
                &task_id,
                "convert",
                "image",
                "complete",
                Some(100.0),
                Some(output_path),
                None,
            );
        }
    });

    Ok(())
}

// ==================== 媒体缩略图相关命令 ====================

#[command]
pub fn generate_media_thumbnail(path: String) -> Result<Option<String>, String> {
    crate::thumbnail::generate_thumbnail(&path)
}

// ==================== 压缩相关命令 ====================

#[derive(Deserialize)]
pub struct VideoCompressionArgs {
    pub task_id: String,
    pub input_path: String,
    pub output_path: String,
    pub compression_ratio: Option<u32>,  // 0-100
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub bitrate: Option<u32>,            // 视频码率 kbps
    pub frame_rate: Option<f32>,         // 目标帧率
    pub codec: Option<String>,           // h264/h265/vp9/av1
    pub keyframe_interval: Option<u32>,  // GOP 间隔
    pub color_depth: Option<u32>,        // 8/10/12 bit
    pub aspect_ratio: Option<String>,    // 16:9 等
    pub remove_audio: Option<bool>,      // 去除音轨
    pub audio_bitrate: Option<u32>,      // 音频码率 kbps
    pub preset: Option<String>,          // ultrafast/fast/medium/slow
    pub use_hardware_acceleration: Option<bool>, // 硬件编码
}

#[command]
pub fn compress_video_file(app: AppHandle, args: VideoCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone();

    std::thread::spawn(move || {
        let params = crate::video_compressor::VideoCompressionParams {
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

        if let Err(e) =
            crate::video_compressor::compress_video_file(&window, params, task_id.clone())
        {
            crate::events::emit_media_task_event(
                &window,
                &task_id,
                "compress",
                "video",
                "error",
                None,
                None,
                Some(e),
            );
        }
    });

    Ok(())
}

#[derive(Deserialize)]
pub struct AudioCompressionArgs {
    pub task_id: String,
    pub input_path: String,
    pub output_path: String,
    pub compression_ratio: u32, // 0-100
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
        let params = crate::audio_compressor::AudioCompressionParams {
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

        if let Err(e) =
            crate::audio_compressor::compress_audio_file(&window, params, task_id.clone())
        {
            crate::events::emit_media_task_event(
                &window,
                &task_id,
                "compress",
                "audio",
                "error",
                None,
                None,
                Some(e),
            );
        }
    });

    Ok(())
}

#[derive(Deserialize)]
pub struct ImageCompressionArgs {
    pub task_id: String,
    pub input_path: String,
    pub output_path: String,
    pub quality: Option<u32>,        // 0-100
    pub format: Option<String>,      // "jpg", "png", "webp" ...
    pub width: Option<u32>,          // 目标宽度
    pub height: Option<u32>,         // 目标高度
    pub color_mode: Option<String>,  // "RGB", "RGBA", "Gray", "CMYK"
    pub strip_metadata: Option<bool>,// 是否去除元数据
    pub keep_transparency: Option<bool>, // 是否保留透明通道
    pub dpi: Option<f64>,            // DPI
    pub crop_whitespace: Option<bool>, // 自动裁剪
}

#[command]
pub fn compress_image_file(app: AppHandle, args: ImageCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone();

    std::thread::spawn(move || {
        let params = crate::image_compressor::ImageCompressionParams {
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

        if let Err(e) =
            crate::image_compressor::compress_image_file(&window, params, task_id.clone())
        {
            crate::events::emit_media_task_event(
                &window,
                &task_id,
                "compress",
                "image",
                "error",
                None,
                None,
                Some(e),
            );
        }
    });

    Ok(())
}
