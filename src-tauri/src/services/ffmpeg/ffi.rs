// FFmpeg FFI
use libloading::{Library, Symbol};
use std::os::raw::{c_uint};
use crate::services::ffmpeg::loader::{get_loaded_ffmpeg_path, is_ffmpeg_loaded, FFmpegLoadError};

#[repr(C)]
pub struct AVFormatContext {
    _private: [u8; 0],
}

#[repr(C)]
pub struct AVCodecContext {
    _private: [u8; 0],
}

#[repr(C)]
pub struct AVCodec {
    _private: [u8; 0],
}

#[repr(C)]
pub struct AVStream {
    _private: [u8; 0],
}

#[repr(C)]
pub struct AVDictionary {
    _private: [u8; 0],
}

type AvFormatVersionFn = unsafe extern "C" fn() -> c_uint;

use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref FFMPEG_FFI_LIB: Mutex<Option<Library>> = Mutex::new(None);
}

pub struct FFmpegFFI;

impl FFmpegFFI {
    pub unsafe fn init() -> Result<(), FFmpegLoadError> {
        if !is_ffmpeg_loaded() {
            return Err(FFmpegLoadError::InitError(
                "FFmpeg library not loaded. Call load_ffmpeg_library first.".to_string(),
            ));
        }

        let lib_path = get_loaded_ffmpeg_path()
            .ok_or_else(|| FFmpegLoadError::InitError("FFmpeg library path not set".to_string()))?;

        let lib_name = if cfg!(target_os = "windows") {
            "avformat.dll"
        } else if cfg!(target_os = "macos") {
            "libavformat.dylib"
        } else {
            "libavformat.so"
        };

        let library = Library::new(lib_path.join(lib_name))
            .map_err(|e| FFmpegLoadError::LoadError(format!("Failed to load library: {}", e)))?;

        let _: Symbol<AvFormatVersionFn> = library
            .get(b"avformat_version\0")
            .map_err(|e| FFmpegLoadError::SymbolNotFound(format!("avformat_version: {}", e)))?;

        let mut lib_guard = FFMPEG_FFI_LIB.lock().unwrap();
        *lib_guard = Some(library);
        Ok(())
    }

    pub unsafe fn get_version() -> Result<String, FFmpegLoadError> {
        with_ffmpeg_lib(|lib| {
            let version_fn: Symbol<AvFormatVersionFn> = lib
                .get(b"avformat_version\0")
                .map_err(|e| FFmpegLoadError::SymbolNotFound(format!("avformat_version: {}", e)))?;

            let v = version_fn() as u32;
            let major = (v >> 16) & 0xff;
            let minor = (v >> 8) & 0xff;
            let patch = v & 0xff;
            Ok(format!("{}.{}.{}", major, minor, patch))
        })
    }
}

pub unsafe fn with_ffmpeg_lib<F, R>(f: F) -> Result<R, FFmpegLoadError>
where
    F: FnOnce(&Library) -> Result<R, FFmpegLoadError>,
{
    let lib_guard = FFMPEG_FFI_LIB.lock().unwrap();
    let lib = lib_guard
        .as_ref()
        .ok_or_else(|| FFmpegLoadError::InitError("FFmpeg FFI not initialized".to_string()))?;
    f(lib)
}
