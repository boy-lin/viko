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
use tauri::command;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

use ffmpeg_next as ffmpeg;

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
