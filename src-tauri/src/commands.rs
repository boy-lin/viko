// src-tauri/src/lib/commands.rs
// Tauri 后端命令定义X

use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::fs::OpenOptions;
use std::io::Read;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::async_runtime::spawn_blocking;
use tauri::command;
use tauri::Emitter; // 允许 WebviewWindow 使用 emit 方法 Cursor Write It
use tauri::Manager; // 允许使用 get_webview_window 方法 Cursor Write It // 导入日志模块 Cursor Write It

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
    pub ffmpeg_path: String,
    pub ffmpeg_version: String,
    pub ffprobe_path: String,
    pub ffprobe_version: String,
    pub fs_permission: bool,
    pub fs_error: String,
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
    version_hint: &str,
    source: &str,
) -> Option<ModuleInfo> {
    if !(Path::new(ffmpeg_path).exists() && Path::new(ffprobe_path).exists()) {
        return None;
    }
    let ffmpeg_version = probe_version_from_path(ffmpeg_path);
    let ffprobe_version = probe_version_from_path(ffprobe_path);
    if ffmpeg_version.is_none() || ffprobe_version.is_none() {
        return None;
    }
    let version = if !version_hint.is_empty() {
        Some(version_hint.to_string())
    } else {
        ffmpeg_version.clone().or(ffprobe_version.clone())
    };
    let is_active = load_active_module()
        .map(|(v, _, _)| version.as_deref() == Some(v.as_str()))
        .unwrap_or(false);
    Some(ModuleInfo {
        id: Some(id.to_string()),
        name: Some(name.to_string()),
        ffmpeg_path: Some(ffmpeg_path.to_string()),
        ffprobe_path: Some(ffprobe_path.to_string()),
        version,
        source: Some(source.to_string()),
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
    Err("未找到 ffmpeg 路径".to_string())
}

// 获取缓存的 ffprobe 路径
fn get_ffprobe_path() -> Result<String, String> {
    if let Ok(cache) = FFPROBE_PATH_CACHE.lock() {
        if let Some(path) = cache.clone() {
            return Ok(path);
        }
    }
    Err("未找到 ffprobe 路径".to_string())
}

fn ffmpeg_output_paths() -> Result<(PathBuf, PathBuf), String> {
    Err("未配置 ffmpeg 资源目录".to_string())
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败 {}: {}", parent.display(), e))?;
    }
    Ok(())
}

fn emit_download_progress_app(app: &AppHandle, stage: &str, downloaded: u64, total: Option<u64>) {
    if let Some(win) = app.get_webview_window("main") {
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

fn download_file_with_progress_blocking(
    app: &AppHandle,
    url: &str,
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
        emit_download_progress_app(app, stage, downloaded, total);
    }
    emit_download_progress_app(app, stage, downloaded, total);
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
    // 使用应用数据目录，确保在生产环境中可写
    // macOS: ~/Library/Application Support/figurex/resources
    // Windows: %APPDATA%\figurex\resources
    // Linux: ~/.local/share/figurex/resources
    let base = dirs::data_local_dir()
        .or_else(|| dirs::data_dir())
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("figurex").join("resources")
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

fn load_active_module() -> Option<(String, String, String)> {
    let path = config_store_path();
    if !path.exists() {
        return None;
    }
    let data = fs::read(&path).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&data).ok()?;
    let version = value.get("version")?.as_str()?.to_string();
    let ffmpeg_path = value.get("ffmpeg_path")?.as_str()?.to_string();
    let ffprobe_path = value.get("ffprobe_path")?.as_str()?.to_string();
    Some((version, ffmpeg_path, ffprobe_path))
}

fn save_active_module(version: &str, ffmpeg_path: &str, ffprobe_path: &str) -> Result<(), String> {
    let path = config_store_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    let data = json!({
        "version": version,
        "ffmpeg_path": ffmpeg_path.to_string(),
        "ffprobe_path": ffprobe_path.to_string(),
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
    let (fs_permission, fs_error) = check_fs_permission();

    let mut ffmpeg_installed = false;
    let mut ffprobe_installed = false;
    let mut ffmpeg_path: Option<String> = None;
    let mut ffprobe_path: Option<String> = None;
    let mut ffmpeg_version: Option<String> = None;
    let mut ffprobe_version: Option<String> = None;

    if let Some((version, active_ffmpeg, active_ffprobe)) = load_active_module() {
        let fv = probe_version_from_path(&active_ffmpeg);
        let pv = probe_version_from_path(&active_ffprobe);
        if fv.is_some() && pv.is_some() {
            ffmpeg_installed = true;
            ffprobe_installed = true;
            ffmpeg_path = Some(active_ffmpeg.clone());
            ffprobe_path = Some(active_ffprobe.clone());
            ffmpeg_version = fv.or_else(|| Some(version.clone()));
            ffprobe_version = pv.or_else(|| Some(version.clone()));
            set_cached_ffmpeg(Some(active_ffmpeg));
            set_cached_ffprobe(Some(active_ffprobe));
        }
    }

    if !(ffmpeg_installed && ffprobe_installed) {
        let (sys_ok, sys_path, sys_version) = try_ffmpeg_from_system();
        let (probe_ok, probe_path, probe_version) = try_ffprobe_from_system();
        ffmpeg_installed = sys_ok;
        ffprobe_installed = probe_ok;
        ffmpeg_path = sys_path;
        ffprobe_path = probe_path;
        ffmpeg_version = sys_version;
        ffprobe_version = probe_version;
        if ffmpeg_path.is_some() {
            set_cached_ffmpeg(ffmpeg_path.clone());
        }
        if ffprobe_path.is_some() {
            set_cached_ffprobe(ffprobe_path.clone());
        }
    }

    Ok(SelfCheckResult {
        ffmpeg_installed,
        ffprobe_installed,
        ffmpeg_path: ffmpeg_path.unwrap_or_default(),
        ffmpeg_version: ffmpeg_version.unwrap_or_default(),
        ffprobe_path: ffprobe_path.unwrap_or_default(),
        ffprobe_version: ffprobe_version.unwrap_or_default(),
        fs_permission,
        fs_error: fs_error.unwrap_or_default(),
    })
}

fn list_modules_internal() -> Result<Vec<ModuleInfo>, String> {
    let mut modules: Vec<ModuleInfo> = Vec::new();

    // system
    let (sys_ok, sys_ffmpeg, sys_ffmpeg_ver) = try_ffmpeg_from_system();
    let (sys_probe_ok, sys_probe_path, _sys_probe_ver) = try_ffprobe_from_system();
    if sys_ok && sys_probe_ok {
        if let Some(entry) = module_entry(
            "system",
            "系统环境",
            sys_ffmpeg.as_deref().unwrap_or("ffmpeg"),
            sys_probe_path.as_deref().unwrap_or("ffprobe"),
            sys_ffmpeg_ver.as_deref().unwrap_or(""),
            "system",
        ) {
            modules.push(entry);
        }
    }

    // enumerate resources/ffmpeg/* as modules (目录名视为版本/名称)
    let ffmpeg_root = resources_root().join("ffmpeg");
    if ffmpeg_root.exists() {
        if let Ok(dir_entries) = fs::read_dir(&ffmpeg_root) {
            for entry in dir_entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                let ffmpeg_path = path.join(platform_ffmpeg_name());
                let ffprobe_path = path.join(platform_ffprobe_name());
                if let Some(entry) = module_entry(
                    &name,
                    &format!("内置 · {}", name),
                    ffmpeg_path.to_string_lossy().as_ref(),
                    ffprobe_path.to_string_lossy().as_ref(),
                    &name,
                    "bundle",
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
pub fn set_active_module(version: String) -> Result<SelfCheckResult, String> {
    if version.trim().is_empty() {
        return Err("版本号不能为空".to_string());
    }
    let root = resources_root().join("ffmpeg");
    let target = root.join(&version);
    let ffmpeg_path = target.join(platform_ffmpeg_name());
    let ffprobe_path = target.join(platform_ffprobe_name());

    if !target.exists() || !ffmpeg_path.exists() || !ffprobe_path.exists() {
        return Err("指定的版本不存在".to_string());
    }
    save_active_module(
        &version,
        &ffmpeg_path.to_string_lossy().as_ref().to_string(),
        &ffprobe_path.to_string_lossy().as_ref().to_string(),
    )?;

    set_cached_ffmpeg(Some(ffmpeg_path.to_string_lossy().as_ref().to_string()));
    set_cached_ffprobe(Some(ffprobe_path.to_string_lossy().as_ref().to_string()));

    run_self_check()
}

#[command]
pub fn delete_module(version: String) -> Result<(), String> {
    if version.trim().is_empty() {
        return Err("模块名称不能为空".to_string());
    }
    let target = resources_root().join("ffmpeg").join(&version);
    if !target.exists() {
        return Err("指定的版本不存在".to_string());
    }

    fs::remove_dir_all(&target).map_err(|e| format!("删除失败: {}", e))?;

    clear_cached_ffmpeg();
    clear_cached_ffprobe();
    Ok(())
}

fn download_module_blocking(
    app: AppHandle,
    version: String,
    ffmpeg_url: String,
    ffprobe_url: String,
) -> Result<Vec<ModuleInfo>, String> {
    if version.trim().is_empty() {
        return Err("版本号不能为空".to_string());
    }
    let resources_dir = resources_root();
    // 确保 resources 目录存在
    fs::create_dir_all(&resources_dir).map_err(|e| format!("创建资源目录失败: {}", e))?;

    let target_dir = resources_dir.join("ffmpeg").join(&version);
    fs::create_dir_all(&target_dir).map_err(|e| format!("创建模块目录失败: {}", e))?;

    let ffmpeg_bytes = download_file_with_progress_blocking(&app, &ffmpeg_url, "ffmpeg")?;
    let ffprobe_bytes = download_file_with_progress_blocking(&app, &ffprobe_url, "ffprobe")?;

    let ffmpeg_dest = target_dir.join(platform_ffmpeg_name());
    let ffprobe_dest = target_dir.join(platform_ffprobe_name());

    // 猜测后缀进行解压；若失败则直接写文件
    let ffmpeg_result = if ffmpeg_url.ends_with(".zip") {
        extract_from_zip(&ffmpeg_bytes, &[platform_ffmpeg_name()], &ffmpeg_dest)
    } else if ffmpeg_url.ends_with(".tar.xz") {
        extract_from_tar_xz(&ffmpeg_bytes, platform_ffmpeg_name(), &ffmpeg_dest)
    } else {
        ensure_parent_dir(&ffmpeg_dest)?;
        fs::write(&ffmpeg_dest, ffmpeg_bytes).map_err(|e| format!("写入 FFmpeg 失败: {}", e))?;
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
        fs::write(&ffprobe_dest, ffprobe_bytes).map_err(|e| format!("写入 FFprobe 失败: {}", e))?;
        mark_executable(&ffprobe_dest)
    };

    if let Err(e) = ffprobe_result {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(e);
    }

    list_modules_internal()
}

#[command]
pub async fn download_custom_module(
    app: AppHandle,
    version: String,
    ffmpeg_url: String,
    ffprobe_url: String,
) -> Result<Vec<ModuleInfo>, String> {
    let task_app = app.clone();
    spawn_blocking(move || download_module_blocking(task_app, version, ffmpeg_url, ffprobe_url))
        .await
        .map_err(|e| e.to_string())?
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
