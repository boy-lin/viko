// src-tauri/src/lib/commands.rs
// Tauri 后端命令定义X

use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::Read;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::command;
use tauri::Emitter; // 允许 WebviewWindow 使用 emit 方法 Cursor Write It
use tauri::Manager; // 允许使用 get_webview_window 方法 Cursor Write It // 导入日志模块 Cursor Write It
use tauri::WebviewWindow;
use serde_json::json;

lazy_static! {
    static ref FFMPEG_PATH_CACHE: Mutex<Option<String>> = Mutex::new(None);
    static ref FFPROBE_PATH_CACHE: Mutex<Option<String>> = Mutex::new(None);
}

#[derive(Serialize)]
pub struct FileInfo {
    pub path: String,
    pub size: u64,
    pub format: String,
    pub codec: String,
    pub resolution: String,
    pub duration: f64,
    pub output_dir: String,
    pub bitrate: Option<String>,
    pub fps: Option<String>,
    pub audio_codec: Option<String>,
    pub audio_channels: Option<String>,
    pub audio_sample_rate: Option<String>,
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
    pub ffmpeg_installed: bool,
    pub ffprobe_installed: bool,
    pub ffmpeg_path: Option<String>,
    pub ffmpeg_version: Option<String>,
    pub ffprobe_path: Option<String>,
    pub ffprobe_version: Option<String>,
    pub fs_permission: bool,
    pub fs_error: Option<String>,
}

#[derive(Serialize)]
pub struct ModuleInfo {
    pub id: String,
    pub name: String,
    pub ffmpeg_path: String,
    pub ffprobe_path: String,
    pub ffmpeg_version: Option<String>,
    pub ffprobe_version: Option<String>,
    pub source: String,
    pub is_active: bool,
}

#[derive(Serialize, Clone)]
pub struct DownloadProgress {
    pub stage: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn try_ffmpeg_from_system() -> (bool, Option<String>, Option<String>) {
    if let Ok(output) = Command::new("ffmpeg").arg("-version").output() {
        if output.status.success() {
            let version_line = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(|s| s.to_string());
            let which_path = Command::new("which")
                .arg("ffmpeg")
                .output()
                .ok()
                .and_then(|out| {
                    if out.status.success() {
                        Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
                    } else {
                        None
                    }
                });
            return (true, which_path, version_line);
        }
    }
    (false, None, None)
}

fn try_ffmpeg_from_bundle() -> (bool, Option<String>, Option<String>) {
    if let Ok(path) = get_ffmpeg_path() {
        if Path::new(&path).exists() {
            if let Ok(output) = Command::new(&path).arg("-version").output() {
                if output.status.success() {
                    let version_line = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .map(|s| s.to_string());
                    return (true, Some(path), version_line);
                }
            }
        }
    }
    (false, None, None)
}

fn try_ffprobe_from_system() -> (bool, Option<String>, Option<String>) {
    if let Ok(output) = Command::new("ffprobe").arg("-version").output() {
        if output.status.success() {
            let version_line = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(|s| s.to_string());
            let which_path = Command::new("which")
                .arg("ffprobe")
                .output()
                .ok()
                .and_then(|out| {
                    if out.status.success() {
                        Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
                    } else {
                        None
                    }
                });
            return (true, which_path, version_line);
        }
    }
    (false, None, None)
}

fn try_ffprobe_from_bundle() -> (bool, Option<String>, Option<String>) {
    if let Ok(path) = get_ffprobe_bundle_path() {
        if Path::new(&path).exists() {
            if let Ok(output) = Command::new(&path).arg("-version").output() {
                if output.status.success() {
                    let version_line = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .map(|s| s.to_string());
                    return (true, Some(path), version_line);
                }
            }
        }
    }
    (false, None, None)
}

fn probe_version_from_path(path: &str) -> Option<String> {
    if !Path::new(path).exists() {
        return None;
    }
    Command::new(path)
        .arg("-version")
        .output()
        .ok()
        .and_then(|out| {
            if out.status.success() {
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .map(|s| s.to_string())
            } else {
                None
            }
        })
}

fn module_entry(
    id: &str,
    name: &str,
    ffmpeg_path: &str,
    ffprobe_path: &str,
    source: &str,
    active_paths: Option<(String, String)>,
) -> Option<ModuleInfo> {
    if !(Path::new(ffmpeg_path).exists() && Path::new(ffprobe_path).exists()) {
        return None;
    }
    let ffmpeg_version = probe_version_from_path(ffmpeg_path);
    let ffprobe_version = probe_version_from_path(ffprobe_path);
    if ffmpeg_version.is_none() || ffprobe_version.is_none() {
        return None;
    }
    let is_active = if let Some((a_ffmpeg, a_ffprobe)) = active_paths {
        a_ffmpeg == ffmpeg_path && a_ffprobe == ffprobe_path
    } else {
        false
    };
    Some(ModuleInfo {
        id: id.to_string(),
        name: name.to_string(),
        ffmpeg_path: ffmpeg_path.to_string(),
        ffprobe_path: ffprobe_path.to_string(),
        ffmpeg_version,
        ffprobe_version,
        source: source.to_string(),
        is_active,
    })
}

fn set_cached_ffmpeg(path: Option<String>) {
    if let Some(p) = path {
        if let Ok(mut cache) = FFMPEG_PATH_CACHE.lock() {
            *cache = Some(p);
        }
    }
}

fn set_cached_ffprobe(path: Option<String>) {
    if let Some(p) = path {
        if let Ok(mut cache) = FFPROBE_PATH_CACHE.lock() {
            *cache = Some(p);
        }
    }
}

fn clear_cached_ffmpeg() {
    if let Ok(mut cache) = FFMPEG_PATH_CACHE.lock() {
        *cache = None;
    }
}

fn clear_cached_ffprobe() {
    if let Ok(mut cache) = FFPROBE_PATH_CACHE.lock() {
        *cache = None;
    }
}

fn check_fs_permission() -> (bool, Option<String>) {
    let download_dir = match dirs::download_dir() {
        Some(path) => path,
        None => return (false, Some("未找到下载目录".to_string())),
    };
    let test_path = download_dir.join("figurex_permission_probe.tmp");
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
// 获取缓存的 ffmpeg 路径
fn get_ffmpeg_path() -> Result<String, String> {
    if let Ok(cache) = FFMPEG_PATH_CACHE.lock() {
        if let Some(path) = cache.clone() {
            return Ok(path);
        }
    }
    get_ffmpeg_bundle_path()
}
// 获取安装包的 ffmpeg 路径
fn get_ffmpeg_bundle_path() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        Ok("resources/ffmpeg/darwin/ffmpeg".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Ok("resources/ffmpeg/linux/ffmpeg".to_string())
    }
    #[cfg(target_os = "windows")]
    {
        Ok("resources/ffmpeg/windows/ffmpeg.exe".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("不支持的操作系统".to_string())
    }
}

// 获取缓存的 ffprobe 路径
fn get_ffprobe_path() -> Result<String, String> {
    if let Ok(cache) = FFPROBE_PATH_CACHE.lock() {
        if let Some(path) = cache.clone() {
            return Ok(path);
        }
    }
    get_ffprobe_bundle_path()
}
// 获取安装包的 ffprobe 路径
fn get_ffprobe_bundle_path() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        Ok("resources/ffmpeg/darwin/ffprobe".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Ok("resources/ffmpeg/linux/ffprobe".to_string())
    }
    #[cfg(target_os = "windows")]
    {
        Ok("resources/ffmpeg/windows/ffprobe.exe".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("不支持的操作系统".to_string())
    }
}

fn ffmpeg_output_paths() -> Result<(PathBuf, PathBuf), String> {
    Ok((
        PathBuf::from(get_ffmpeg_bundle_path()?),
        PathBuf::from(get_ffprobe_bundle_path()?),
    ))
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败 {}: {}", parent.display(), e))?;
    }
    Ok(())
}

fn download_file(url: &str) -> Result<Vec<u8>, String> {
    download_file_with_progress(url, None, "")
}

fn emit_download_progress(
    window: Option<&WebviewWindow>,
    stage: &str,
    downloaded: u64,
    total: Option<u64>,
) {
    if let Some(win) = window {
        let _ = win.emit(
            "ffmpeg-download-progress",
            DownloadProgress {
                stage: stage.to_string(),
                downloaded,
                total,
            },
        );
    }
}

fn download_file_with_progress(
    url: &str,
    window: Option<&WebviewWindow>,
    stage: &str,
) -> Result<Vec<u8>, String> {
    let mut response =
        reqwest::blocking::get(url).map_err(|e| format!("下载失败 ({})：{}", url, e))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("下载失败 ({})：HTTP {}", url, status));
    }
    let total = response.content_length();
    let mut buf: Vec<u8> = Vec::new();
    let mut downloaded = 0u64;
    let mut chunk = [0u8; 16 * 1024];
    loop {
        let n = response
            .read(&mut chunk)
            .map_err(|e| format!("读取下载内容失败: {}", e))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        downloaded += n as u64;
        emit_download_progress(window, stage, downloaded, total);
    }
    emit_download_progress(window, stage, downloaded, total);
    Ok(buf)
}

fn mark_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path)
            .map_err(|e| format!("读取文件权限失败 {}: {}", path.display(), e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms)
            .map_err(|e| format!("设置执行权限失败 {}: {}", path.display(), e))?;
    }
    Ok(())
}

fn extract_from_zip(bytes: &[u8], target_suffixes: &[&str], dest: &Path) -> Result<(), String> {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("解析压缩包失败: {}", e))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().to_string();
        if target_suffixes.iter().any(|suffix| name.ends_with(suffix)) {
            ensure_parent_dir(dest)?;
            let mut out = fs::File::create(dest)
                .map_err(|e| format!("创建文件失败 {}: {}", dest.display(), e))?;
            std::io::copy(&mut file, &mut out)
                .map_err(|e| format!("写入文件失败 {}: {}", dest.display(), e))?;
            mark_executable(dest)?;
            return Ok(());
        }
    }
    Err("压缩包中未找到目标文件".to_string())
}

fn extract_from_tar_xz(bytes: &[u8], target_name: &str, dest: &Path) -> Result<(), String> {
    let cursor = Cursor::new(bytes);
    let decoder = xz2::read::XzDecoder::new(cursor);
    let mut archive = tar::Archive::new(decoder);
    let entries = archive
        .entries()
        .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
    for entry in entries {
        let mut entry = entry.map_err(|e| format!("解析压缩包条目失败: {}", e))?;
        let path = entry
            .path()
            .map_err(|e| format!("读取压缩包路径失败: {}", e))?;
        if path.file_name().map(|f| f == target_name).unwrap_or(false) {
            ensure_parent_dir(dest)?;
            let mut out = fs::File::create(dest)
                .map_err(|e| format!("创建文件失败 {}: {}", dest.display(), e))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("写入文件失败 {}: {}", dest.display(), e))?;
            mark_executable(dest)?;
            return Ok(());
        }
    }
    Err(format!("压缩包中未找到 {}", target_name))
}

fn resources_root() -> PathBuf {
    PathBuf::from("resources")
}

fn platform_ffmpeg_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "ffmpeg.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "ffmpeg"
    }
}

fn platform_ffprobe_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "ffprobe.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "ffprobe"
    }
}

fn config_store_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("figurex").join("ffmpeg_active.json")
}

fn load_active_module() -> Option<(String, String)> {
    let path = config_store_path();
    if !path.exists() {
        return None;
    }
    let data = fs::read(&path).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&data).ok()?;
    let ffmpeg = value.get("ffmpeg_path")?.as_str()?.to_string();
    let ffprobe = value.get("ffprobe_path")?.as_str()?.to_string();
    if Path::new(&ffmpeg).exists() && Path::new(&ffprobe).exists() {
        Some((ffmpeg, ffprobe))
    } else {
        None
    }
}

fn save_active_module(ffmpeg: &str, ffprobe: &str) -> Result<(), String> {
    let path = config_store_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    let data = json!({
        "ffmpeg_path": ffmpeg,
        "ffprobe_path": ffprobe,
    });
    fs::write(&path, serde_json::to_vec(&data).unwrap())
        .map_err(|e| format!("写入配置失败: {}", e))?;
    Ok(())
}

fn dir_size(path: &Path) -> u64 {
    if let Ok(meta) = fs::metadata(path) {
        if meta.is_file() {
            return meta.len();
        }
    }

    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let child = entry.path();
            total = total.saturating_add(dir_size(&child));
        }
    }
    total
}

use std::thread;
use tauri::AppHandle;

#[command]
pub fn run_self_check() -> Result<SelfCheckResult, String> {
    if let Some((cfg_ffmpeg, cfg_ffprobe)) = load_active_module() {
        if let (Some(ffmpeg_version), Some(ffprobe_version)) = (
            probe_version_from_path(&cfg_ffmpeg),
            probe_version_from_path(&cfg_ffprobe),
        ) {
            set_cached_ffmpeg(Some(cfg_ffmpeg.clone()));
            set_cached_ffprobe(Some(cfg_ffprobe.clone()));
            let (fs_permission, fs_error) = check_fs_permission();
            return Ok(SelfCheckResult {
                ffmpeg_installed: true,
                ffprobe_installed: true,
                ffmpeg_path: Some(cfg_ffmpeg),
                ffmpeg_version: Some(ffmpeg_version),
                ffprobe_path: Some(cfg_ffprobe),
                ffprobe_version: Some(ffprobe_version),
                fs_permission,
                fs_error,
            });
        }
    }

    let (sys_ok, sys_path, sys_version) = try_ffmpeg_from_system();
    let (bundle_ok, bundle_path, bundle_version) = if sys_ok {
        (false, None, None)
    } else {
        try_ffmpeg_from_bundle()
    };

    let (sys_probe_ok, sys_probe_path, sys_probe_version) = try_ffprobe_from_system();
    let (bundle_probe_ok, bundle_probe_path, bundle_probe_version) = if sys_probe_ok {
        (false, None, None)
    } else {
        try_ffprobe_from_bundle()
    };

    let ffmpeg_installed = sys_ok || bundle_ok;
    let ffmpeg_path = sys_path.or(bundle_path);
    let ffmpeg_version = sys_version.or(bundle_version);
    let ffprobe_installed = sys_probe_ok || bundle_probe_ok;
    let ffprobe_path = sys_probe_path.or(bundle_probe_path);
    let ffprobe_version = sys_probe_version.or(bundle_probe_version);

    // 缓存路径供后续 get_media_info / ffmpeg_exec 使用
    set_cached_ffmpeg(ffmpeg_path.clone());
    set_cached_ffprobe(ffprobe_path.clone());

    let (fs_permission, fs_error) = check_fs_permission();

    Ok(SelfCheckResult {
        ffmpeg_installed,
        ffmpeg_path,
        ffmpeg_version,
        ffprobe_installed,
        ffprobe_path,
        ffprobe_version,
        fs_permission,
        fs_error,
    })
}

#[cfg(target_os = "macos")]
const FFMPEG_DOWNLOAD_URL: &str = "https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip";
#[cfg(target_os = "macos")]
const FFPROBE_DOWNLOAD_URL: &str = "https://evermeet.cx/ffmpeg/ffprobe-6.1.1.zip";

#[cfg(target_os = "windows")]
const FFMPEG_DOWNLOAD_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

#[cfg(target_os = "linux")]
const FFMPEG_DOWNLOAD_URL: &str =
    "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";

fn download_ffmpeg_for_platform(
    ffmpeg_path: &Path,
    ffprobe_path: &Path,
    window: Option<&WebviewWindow>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let ffmpeg_zip = download_file_with_progress(FFMPEG_DOWNLOAD_URL, window, "ffmpeg")?;
        println!("ffmpeg download ok");
        let ffprobe_zip = download_file_with_progress(FFPROBE_DOWNLOAD_URL, window, "ffprobe")?;
        println!("ffprobe download ok");

        extract_from_zip(&ffmpeg_zip, &["ffmpeg"], ffmpeg_path)?;
        println!("ffmpeg extract ok");
        extract_from_zip(&ffprobe_zip, &["ffprobe"], ffprobe_path)?;
        println!("ffprobe extract ok");

        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let archive = download_file_with_progress(FFMPEG_DOWNLOAD_URL, window, "ffmpeg")?;
        extract_from_zip(&archive, &["ffmpeg.exe"], ffmpeg_path)?;
        extract_from_zip(&archive, &["ffprobe.exe"], ffprobe_path)?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let archive = download_file_with_progress(FFMPEG_DOWNLOAD_URL, window, "ffmpeg")?;
        extract_from_tar_xz(&archive, "ffmpeg", ffmpeg_path)?;
        extract_from_tar_xz(&archive, "ffprobe", ffprobe_path)?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("当前平台暂不支持自动下载 ffmpeg".to_string())
}

#[command]
pub fn download_ffmpeg_ffprobe(app: AppHandle) -> Result<SelfCheckResult, String> {
    let window = app.get_webview_window("main");
    let window_ref = window.as_ref();

    let (ffmpeg_path, ffprobe_path) = ffmpeg_output_paths()?;
    println!(
        "download_ffmpeg_ffprobe -> ffmpeg_path: {}, ffprobe_path: {}",
        ffmpeg_path.display(),
        ffprobe_path.display()
    );

    if ffmpeg_path.exists() && ffprobe_path.exists() {
        return run_self_check();
    }

    download_ffmpeg_for_platform(&ffmpeg_path, &ffprobe_path, window_ref)?;

    set_cached_ffmpeg(Some(ffmpeg_path.to_string_lossy().to_string()));
    set_cached_ffprobe(Some(ffprobe_path.to_string_lossy().to_string()));

    run_self_check()
}

fn list_modules_internal() -> Result<Vec<ModuleInfo>, String> {
    let active_paths = load_active_module();
    let mut modules: Vec<ModuleInfo> = Vec::new();

    // system
    let (sys_ok, sys_ffmpeg, sys_ffmpeg_ver) = try_ffmpeg_from_system();
    let (sys_probe_ok, sys_probe_path, sys_probe_ver) = try_ffprobe_from_system();
    if sys_ok && sys_probe_ok {
        if let Some(entry) = module_entry(
            "system",
            "系统环境",
            sys_ffmpeg.as_deref().unwrap_or("ffmpeg"),
            sys_probe_path.as_deref().unwrap_or("ffprobe"),
            "system",
            active_paths.clone(),
        ) {
            modules.push(entry);
        } else if let (Some(ffmpeg_path), Some(ffprobe_path)) =
            (sys_ffmpeg, sys_probe_path)
        {
            modules.push(ModuleInfo {
                id: "system".to_string(),
                name: "系统环境".to_string(),
                ffmpeg_path,
                ffprobe_path,
                ffmpeg_version: sys_ffmpeg_ver,
                ffprobe_version: sys_probe_ver,
                source: "system".to_string(),
                is_active: active_paths
                    .as_ref()
                    .map(|(a, b)| a == &ffmpeg_path && b == &ffprobe_path)
                    .unwrap_or(false),
            });
        }
    }

    // bundle default
    if let (Ok(ffmpeg_path), Ok(ffprobe_path)) =
        (get_ffmpeg_bundle_path(), get_ffprobe_bundle_path())
    {
        if let Some(entry) = module_entry(
            "bundle",
            "内置模块",
            &ffmpeg_path,
            &ffprobe_path,
            "bundle",
            active_paths.clone(),
        ) {
            modules.push(entry);
        }
    }

    // custom modules under resources/ffmpeg/*
    let ffmpeg_root = resources_root().join("ffmpeg");
    if ffmpeg_root.exists() {
        if let Ok(dir_entries) = fs::read_dir(&ffmpeg_root) {
            for entry in dir_entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                // 跳过默认平台目录
                if name == "darwin" || name == "linux" || name == "windows" {
                    continue;
                }
                let ffmpeg_path = path.join(platform_ffmpeg_name());
                let ffprobe_path = path.join(platform_ffprobe_name());
                if let Some(entry) = module_entry(
                    &name,
                    &format!("自定义 · {}", name),
                    ffmpeg_path.to_string_lossy().as_ref(),
                    ffprobe_path.to_string_lossy().as_ref(),
                    "custom",
                    active_paths.clone(),
                ) {
                    modules.push(entry);
                }
            }
        }
    }

    Ok(modules)
}

#[command]
pub fn list_modules() -> Result<Vec<ModuleInfo>, String> {
    list_modules_internal()
}

#[command]
pub fn set_active_module(ffmpeg_path: String, ffprobe_path: String) -> Result<SelfCheckResult, String> {
    if probe_version_from_path(&ffmpeg_path).is_none() {
        return Err("指定的 FFmpeg 无法执行".to_string());
    }
    if probe_version_from_path(&ffprobe_path).is_none() {
        return Err("指定的 FFprobe 无法执行".to_string());
    }
    save_active_module(&ffmpeg_path, &ffprobe_path)?;
    set_cached_ffmpeg(Some(ffmpeg_path));
    set_cached_ffprobe(Some(ffprobe_path));
    run_self_check()
}

#[command]
pub fn delete_module(name: String) -> Result<Vec<ModuleInfo>, String> {
    if name.trim().is_empty() {
        return Err("模块名称不能为空".to_string());
    }

    if name == "system" || name == "bundle" {
        return Err("系统和内置模块不可删除".to_string());
    }
    if name == "darwin" || name == "linux" || name == "windows" {
        return Err("平台默认目录不可删除".to_string());
    }

    let root = resources_root().join("ffmpeg");
    let target = root.join(&name);
    if !target.exists() {
        return list_modules_internal();
    }

    let canonical_root = fs::canonicalize(&root).unwrap_or(root.clone());
    let canonical_target =
        fs::canonicalize(&target).map_err(|e| format!("无法定位模块路径: {}", e))?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err("非法模块路径".to_string());
    }

    if canonical_target.is_file() {
        fs::remove_file(&canonical_target).map_err(|e| format!("删除失败: {}", e))?;
    } else {
        fs::remove_dir_all(&canonical_target).map_err(|e| format!("删除失败: {}", e))?;
    }

    if let Some((a_ffmpeg, a_ffprobe)) = load_active_module() {
        if a_ffmpeg.starts_with(target.to_string_lossy().as_ref())
            || a_ffprobe.starts_with(target.to_string_lossy().as_ref())
        {
            clear_cached_ffmpeg();
            clear_cached_ffprobe();
        }
    }

    list_modules_internal()
}

#[command]
pub fn download_custom_module(
    name: String,
    ffmpeg_url: String,
    ffprobe_url: String,
) -> Result<Vec<ModuleInfo>, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("模块名称不能为空".to_string());
    }
    let forbidden = ["system", "bundle", "darwin", "linux", "windows"];
    if forbidden.contains(&trimmed) {
        return Err("该名称为保留字，请更换名称".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("模块名称包含非法字符".to_string());
    }
    let target_dir = resources_root().join("ffmpeg").join(trimmed);
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("创建模块目录失败: {}", e))?;

    let ffmpeg_bytes = download_file_with_progress(&ffmpeg_url, None, "ffmpeg")?;
    let ffprobe_bytes = download_file_with_progress(&ffprobe_url, None, "ffprobe")?;

    let ffmpeg_dest = target_dir.join(platform_ffmpeg_name());
    let ffprobe_dest = target_dir.join(platform_ffprobe_name());

    // 猜测后缀进行解压；若失败则直接写文件
    let ffmpeg_result = if ffmpeg_url.ends_with(".zip") {
        extract_from_zip(&ffmpeg_bytes, &[platform_ffmpeg_name()], &ffmpeg_dest)
    } else if ffmpeg_url.ends_with(".tar.xz") {
        extract_from_tar_xz(&ffmpeg_bytes, platform_ffmpeg_name(), &ffmpeg_dest)
    } else {
        ensure_parent_dir(&ffmpeg_dest)?;
        fs::write(&ffmpeg_dest, ffmpeg_bytes)
            .map_err(|e| format!("写入 FFmpeg 失败: {}", e))?;
        mark_executable(&ffmpeg_dest)
    };

    if let Err(e) = ffmpeg_result {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(e);
    }

    let ffprobe_result = if ffprobe_url.ends_with(".zip") {
        extract_from_zip(&ffprobe_bytes, &[platform_ffprobe_name()], &ffprobe_dest)
    } else if ffprobe_url.ends_with(".tar.xz") {
        extract_from_tar_xz(&ffprobe_bytes, platform_ffprobe_name(), &ffprobe_dest)
    } else {
        ensure_parent_dir(&ffprobe_dest)?;
        fs::write(&ffprobe_dest, ffprobe_bytes)
            .map_err(|e| format!("写入 FFprobe 失败: {}", e))?;
        mark_executable(&ffprobe_dest)
    };

    if let Err(e) = ffprobe_result {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(e);
    }

    list_modules_internal()
}

#[command]
pub fn get_media_info(path: String) -> Result<FileInfo, String> {
    // 获取文件大小 Cursor Write It
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();

    // 获取嵌入的 ffprobe 路径 Cursor Write It
    let ffprobe_path = get_ffprobe_path()?;

    // 使用嵌入的 ffprobe 获取详细的视频音频信息 Cursor Write It
    let output = Command::new(&ffprobe_path)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,width,height,duration,r_frame_rate,bit_rate",
            "-show_format",
            "-of",
            "json",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe 执行失败: {}, path: {}", e, path))?;

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("解析 ffprobe 输出失败: {}", e))?;

    let width = json["streams"][0]["width"].as_u64().unwrap_or(0);
    let height = json["streams"][0]["height"].as_u64().unwrap_or(0);
    let duration = json["streams"][0]["duration"].as_f64().unwrap_or(0.0);
    let bitrate = json["streams"][0]["bit_rate"]
        .as_u64()
        .map(|b| format!("{}", b));
    let fps = json["streams"][0]["r_frame_rate"]
        .as_str()
        .map(|s| s.to_string());
    let audio_codec = json["streams"][1]["codec_name"]
        .as_str()
        .map(|s| s.to_string());

    // 计算缺失的字段 Cursor Write It
    let format = json["format"]["format_name"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let codec = json["streams"][0]["codec_name"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let resolution = format!("{}x{}", width, height);
    let output_dir = Path::new(&path)
        .parent()
        .unwrap_or(Path::new(""))
        .to_string_lossy()
        .to_string();
    let audio_channels = json["streams"][1]["channels"]
        .as_str()
        .map(|s| s.to_string());
    let audio_sample_rate = json["streams"][1]["sample_rate"]
        .as_str()
        .map(|s| s.to_string());

    Ok(FileInfo {
        path,
        size,
        format,
        codec,
        resolution,
        duration,
        output_dir,
        bitrate,
        fps,
        audio_codec,
        audio_channels,
        audio_sample_rate,
    })
}

#[command]
pub fn ffmpeg_exec(app: AppHandle, ffmpeg_args: Vec<String>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    // 获取嵌入的 ffmpeg 路径 Cursor Write It
    let ffmpeg_path = get_ffmpeg_path()?;
    // 新线程执行转码，推送进度 Cursor Write It
    let window = window.clone();
    thread::spawn(move || {
        let mut child = Command::new(&ffmpeg_path)
            .args(ffmpeg_args)
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("无法启动 ffmpeg");

        let stderr = child.stderr.take().unwrap();
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stderr);

        // 简单解析 ffmpeg 输出中的进度信息 Cursor Write It
        for line in reader.lines() {
            if let Ok(l) = line {
                println!("ffmpeg stderr: {}", l); // 打印所有输出 Cursor Write It
                if l.contains("time=") {
                    // 解析当前时间戳，推送到前端
                    let time_str = l
                        .split("time=")
                        .nth(1)
                        .and_then(|s| s.split_whitespace().next());
                    if let Some(time) = time_str {
                        let _ = window.emit("ffmpeg-progress", time);
                    }
                }
            }
        }

        let status = child.wait().expect("等待 ffmpeg 进程失败");
        println!("ffmpeg exit status: {:?}", status); // 打印退出码 Cursor Write It
        let _ = window.emit("ffmpeg-complete", "ok");
    });

    Ok(())
}
