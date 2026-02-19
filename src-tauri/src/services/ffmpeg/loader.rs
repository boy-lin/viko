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
        self.lib_path.join(&self.lib_name)
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
pub fn bundled_ffmpeg_dir(resource_dir: &Path) -> PathBuf {
    let mut dir = resource_dir.join("ffmpeg");
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
