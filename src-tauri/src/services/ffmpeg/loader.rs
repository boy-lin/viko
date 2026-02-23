// FFmpeg 动态库加载器
// 使用 libloading 在运行时加载 FFmpeg 动态库

use libloading::{Library, Symbol};
use std::ffi::CStr;
use std::os::raw::{c_char, c_int};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref FFMPEG_LIB: Mutex<Option<Library>> = Mutex::new(None);
    static ref FFPROBE_LIB: Mutex<Option<Library>> = Mutex::new(None);
    static ref FFMPEG_LIB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
    static ref FFPROBE_LIB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
}

#[derive(Debug)]
pub enum FFmpegLoadError {
    LibraryNotFound(String),
    SymbolNotFound(String),
    LoadError(String),
    InitError(String),
}

impl std::fmt::Display for FFmpegLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            FFmpegLoadError::LibraryNotFound(msg) => write!(f, "Library not found: {}", msg),
            FFmpegLoadError::SymbolNotFound(msg) => write!(f, "Symbol not found: {}", msg),
            FFmpegLoadError::LoadError(msg) => write!(f, "Load error: {}", msg),
            FFmpegLoadError::InitError(msg) => write!(f, "Init error: {}", msg),
        }
    }
}

impl std::error::Error for FFmpegLoadError {}

/// FFmpeg 库路径配置
pub struct FFmpegConfig {
    pub lib_path: PathBuf,
    pub lib_name: String,
}

impl FFmpegConfig {
    pub fn new(lib_path: PathBuf) -> Self {
        let lib_name = if cfg!(target_os = "windows") {
            "avformat.dll".to_string()
        } else if cfg!(target_os = "macos") {
            "libavformat.dylib".to_string()
        } else {
            "libavformat.so".to_string()
        };
        Self { lib_path, lib_name }
    }

    pub fn get_library_path(&self) -> PathBuf {
        let exact = self.lib_path.join(&self.lib_name);
        if exact.exists() {
            return exact;
        }

        // Homebrew 安装的 FFmpeg 使用带主版本号的文件名
        // 例如：libavformat.61.dylib 而非 libavformat.dylib
        // 尝试在目录中查找匹配的文件（取文件名前缀进行匹配）
        let stem = self.lib_name.split('.').next().unwrap_or(&self.lib_name);
        let ext = if cfg!(target_os = "macos") {
            "dylib"
        } else if cfg!(target_os = "windows") {
            "dll"
        } else {
            "so"
        };

        if let Ok(entries) = std::fs::read_dir(&self.lib_path) {
            let mut candidates: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.extension().and_then(|e| e.to_str()) == Some(ext)
                        && p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n.starts_with(stem))
                            .unwrap_or(false)
                })
                .collect();
            // 排序后取第一个（版本号最小，通常是主版本库）
            candidates.sort();
            if let Some(found) = candidates.into_iter().next() {
                log::debug!(
                    "FFmpeg lib '{}' not found, using fallback: {}",
                    self.lib_name,
                    found.display()
                );
                return found;
            }
        }

        exact
    }
}

/// 加载 FFmpeg 动态库
pub fn load_ffmpeg_library(lib_dir: &Path) -> Result<(), FFmpegLoadError> {
    let config = FFmpegConfig::new(lib_dir.to_path_buf());
    let lib_path = config.get_library_path();

    if !lib_path.exists() {
        return Err(FFmpegLoadError::LibraryNotFound(format!(
            "FFmpeg library not found at: {}",
            lib_path.display()
        )));
    }

    unsafe {
        let library = Library::new(&lib_path)
            .map_err(|e| FFmpegLoadError::LoadError(format!("Failed to load library: {}", e)))?;

        // 尝试获取一个符号来验证库是否可用
        let _: Symbol<unsafe extern "C" fn() -> c_int> = library
            .get(b"av_version_info\0")
            .map_err(|e| FFmpegLoadError::SymbolNotFound(format!("av_version_info: {}", e)))?;

        let mut lib_guard = FFMPEG_LIB.lock().unwrap();
        *lib_guard = Some(library);
        drop(lib_guard);

        let mut path_guard = FFMPEG_LIB_PATH.lock().unwrap();
        *path_guard = Some(lib_dir.to_path_buf());
        drop(path_guard);
    }

    Ok(())
}

/// 获取打包资源中的 FFmpeg 目录
///
/// Tauri 在不同模式下 `resource_dir` 指向不同位置：
/// - 开发模式 (`tauri dev`)：`target/debug/`，资源实际在 `target/debug/resources/`
/// - 生产模式（打包后）：`AppName.app/Contents/Resources/`，资源直接在此目录下
///
/// 通过检测 `resources/` 子目录是否存在来自动适配，无需手动区分构建模式。
pub fn bundled_ffmpeg_dir(resource_dir: &Path) -> PathBuf {
    // 开发模式下 resource_dir 是 target/debug/，实际资源在其 resources/ 子目录
    // 生产模式下 resource_dir 本身就是 Resources/，不存在 resources/ 子目录
    let base = if resource_dir.join("resources").is_dir() {
        resource_dir.join("resources")
    } else {
        resource_dir.to_path_buf()
    };

    let mut dir = base.join("ffmpeg");
    if cfg!(target_os = "macos") {
        dir = dir.join("macos");
        if cfg!(target_arch = "aarch64") {
            dir = dir.join("aarch64");
        } else if cfg!(target_arch = "x86_64") {
            dir = dir.join("x86_64");
        }
    } else if cfg!(target_os = "windows") {
        dir = dir.join("windows");
    } else {
        dir = dir.join("linux");
    }
    dir
}

/// 优先从打包资源目录加载 FFmpeg
pub fn load_bundled_ffmpeg(resource_dir: &Path) -> Result<(), FFmpegLoadError> {
    // Windows: build.rs 将 DLL 复制到可执行文件旁边（exe_dir），优先在此查找
    #[cfg(target_os = "windows")]
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if load_ffmpeg_library(exe_dir).is_ok() {
                return Ok(());
            }
        }
    }

    // macOS/Linux 或 Windows fallback：从 resource_dir 下的 ffmpeg/ 子目录加载
    let dir = bundled_ffmpeg_dir(resource_dir);
    load_ffmpeg_library(&dir)
}

/// 加载 FFprobe 动态库（通常与 FFmpeg 在同一目录）
pub fn load_ffprobe_library(lib_dir: &Path) -> Result<(), FFmpegLoadError> {
    // FFprobe 通常使用相同的库，但我们可以单独加载
    // 这里我们假设使用相同的库目录
    load_ffmpeg_library(lib_dir)
}

/// 获取已加载的 FFmpeg 库路径
pub fn get_loaded_ffmpeg_path() -> Option<PathBuf> {
    FFMPEG_LIB_PATH.lock().unwrap().clone()
}

/// 检查 FFmpeg 库是否已加载
pub fn is_ffmpeg_loaded() -> bool {
    FFMPEG_LIB.lock().unwrap().is_some()
}

/// 卸载 FFmpeg 库
pub fn unload_ffmpeg_library() {
    let mut lib_guard = FFMPEG_LIB.lock().unwrap();
    *lib_guard = None;
    drop(lib_guard);

    let mut path_guard = FFMPEG_LIB_PATH.lock().unwrap();
    *path_guard = None;
    drop(path_guard);
}

/// 从 FFmpeg 可执行文件路径推断库目录
pub fn infer_lib_dir_from_executable(executable_path: &Path) -> PathBuf {
    // 假设库文件在可执行文件的同一目录或父目录的 lib 子目录
    if let Some(parent) = executable_path.parent() {
        // 尝试 lib 子目录
        let lib_dir = parent.join("lib");
        if lib_dir.exists() {
            return lib_dir;
        }
        // 否则返回父目录
        return parent.to_path_buf();
    }
    executable_path.to_path_buf()
}

/// 获取 FFmpeg 版本信息（用于验证库是否正常工作）
pub fn get_ffmpeg_version() -> Result<String, FFmpegLoadError> {
    unsafe {
        let lib_guard = FFMPEG_LIB.lock().unwrap();
        let lib = lib_guard
            .as_ref()
            .ok_or_else(|| FFmpegLoadError::InitError("FFmpeg library not loaded".to_string()))?;

        let version_fn: Symbol<unsafe extern "C" fn() -> *const c_char> = lib
            .get(b"av_version_info\0")
            .map_err(|e| FFmpegLoadError::SymbolNotFound(format!("av_version_info: {}", e)))?;

        let version_ptr = version_fn();
        if version_ptr.is_null() {
            return Err(FFmpegLoadError::InitError(
                "av_version_info returned null".to_string(),
            ));
        }

        let version_cstr = CStr::from_ptr(version_ptr);
        Ok(version_cstr.to_string_lossy().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_infer_lib_dir() {
        let path = Path::new("/usr/local/bin/ffmpeg");
        let lib_dir = infer_lib_dir_from_executable(path);
        assert_eq!(lib_dir, PathBuf::from("/usr/local/lib"));
    }
}
