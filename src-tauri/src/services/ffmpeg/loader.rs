use libloading::{Library, Symbol};
use std::os::raw::c_uint;
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

/// FFmpeg 
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

        let _: Symbol<unsafe extern "C" fn() -> c_uint> = library
            .get(b"avformat_version\0")
            .map_err(|e| FFmpegLoadError::SymbolNotFound(format!("avformat_version: {}", e)))?;

        let mut lib_guard = FFMPEG_LIB.lock().unwrap();
        *lib_guard = Some(library);
        drop(lib_guard);

        let mut path_guard = FFMPEG_LIB_PATH.lock().unwrap();
        *path_guard = Some(lib_dir.to_path_buf());
        drop(path_guard);
    }

    Ok(())
}

pub fn bundled_ffmpeg_dir(resource_dir: &Path) -> PathBuf {
    let base = if resource_dir.join("resources").is_dir() {
        resource_dir.join("resources")
    } else {
        resource_dir.to_path_buf()
    };

    let mut dir = base;
    if cfg!(target_os = "macos") {
        dir = dir.join("ffmpeg");
        dir = dir.join("macos");
        if cfg!(target_arch = "aarch64") {
            dir = dir.join("aarch64");
        } else if cfg!(target_arch = "x86_64") {
            dir = dir.join("x86_64");
        }
    } else if cfg!(target_os = "windows") {
        // dir = dir.join("windows");
    } else {
        dir = dir.join("ffmpeg");
        dir = dir.join("linux");
    }
    dir
}

pub fn load_bundled_ffmpeg(resource_dir: &Path) -> Result<(), FFmpegLoadError> {
    #[cfg(target_os = "windows")]
    {
        // 1) Prefer DLLs next to viko.exe
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                match load_ffmpeg_library(exe_dir) {
                    Ok(()) => return Ok(()),
                    Err(e) => {
                        log::warn!(
                            "Failed to load FFmpeg from exe dir {}: {}",
                            exe_dir.display(),
                            e
                        );
                    }
                }
            }
        }

        // 2) Fallback to Tauri resource root
        match load_ffmpeg_library(resource_dir) {
            Ok(()) => return Ok(()),
            Err(e) => {
                log::warn!(
                    "Failed to load FFmpeg from resource root {}: {}",
                    resource_dir.display(),
                    e
                );
            }
        }

        // 3) Legacy fallback: resource_dir/ffmpeg/windows
        let bundled_dir = bundled_ffmpeg_dir(resource_dir);
        return load_ffmpeg_library(&bundled_dir).map_err(|e| {
            FFmpegLoadError::LoadError(format!(
                "FFmpeg load attempts exhausted. Tried exe dir, resource root, and {}. Last error: {}",
                bundled_dir.display(),
                e
            ))
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        // macOS/Linux: load from resource_dir/ffmpeg/*
        let dir = bundled_ffmpeg_dir(resource_dir);
        load_ffmpeg_library(&dir)
    }
}

pub fn load_ffprobe_library(lib_dir: &Path) -> Result<(), FFmpegLoadError> {
    load_ffmpeg_library(lib_dir)
}

pub fn get_loaded_ffmpeg_path() -> Option<PathBuf> {
    FFMPEG_LIB_PATH.lock().unwrap().clone()
}

pub fn is_ffmpeg_loaded() -> bool {
    FFMPEG_LIB.lock().unwrap().is_some()
}

pub fn unload_ffmpeg_library() {
    let mut lib_guard = FFMPEG_LIB.lock().unwrap();
    *lib_guard = None;
    drop(lib_guard);

    let mut path_guard = FFMPEG_LIB_PATH.lock().unwrap();
    *path_guard = None;
    drop(path_guard);
}

pub fn infer_lib_dir_from_executable(executable_path: &Path) -> PathBuf {
    if let Some(parent) = executable_path.parent() {
        let lib_dir = parent.join("lib");
        if lib_dir.exists() {
            return lib_dir;
        }
        // 鍚﹀垯杩斿洖鐖剁洰锟?
        return parent.to_path_buf();
    }
    executable_path.to_path_buf()
}

pub fn get_ffmpeg_version() -> Result<String, FFmpegLoadError> {
    unsafe {
        let lib_guard = FFMPEG_LIB.lock().unwrap();
        let lib = lib_guard
            .as_ref()
            .ok_or_else(|| FFmpegLoadError::InitError("FFmpeg library not loaded".to_string()))?;

        let version_fn: Symbol<unsafe extern "C" fn() -> c_uint> = lib
            .get(b"avformat_version\0")
            .map_err(|e| FFmpegLoadError::SymbolNotFound(format!("avformat_version: {}", e)))?;

        let v = version_fn() as u32;
        let major = (v >> 16) & 0xff;
        let minor = (v >> 8) & 0xff;
        let patch = v & 0xff;
        Ok(format!("{}.{}.{}", major, minor, patch))
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



