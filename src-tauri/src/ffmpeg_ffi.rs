// FFmpeg FFI 绑定
// 定义 FFmpeg C API 的结构体和函数签名

use libloading::{Library, Symbol};
use std::ffi::CStr;
use std::os::raw::{c_char, c_int, c_void};

use crate::ffmpeg_loader::{get_loaded_ffmpeg_path, is_ffmpeg_loaded, FFmpegLoadError};

// FFmpeg 结构体定义（简化版）
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

// FFmpeg 函数指针类型
type AvFormatOpenInputFn = unsafe extern "C" fn(
    ps: *mut *mut AVFormatContext,
    url: *const c_char,
    fmt: *const AVFormatContext,
    options: *mut *mut AVDictionary,
) -> c_int;

type AvFormatCloseInputFn = unsafe extern "C" fn(s: *mut *mut AVFormatContext);

type AvFormatFindStreamInfoFn =
    unsafe extern "C" fn(ic: *mut AVFormatContext, options: *mut *mut AVDictionary) -> c_int;

type AvDumpFormatFn = unsafe extern "C" fn(
    ic: *mut AVFormatContext,
    index: c_int,
    url: *const c_char,
    is_output: c_int,
);

type AvCodecFindDecoderFn = unsafe extern "C" fn(id: u32) -> *const AVCodec;

type AvCodecAllocContext3Fn = unsafe extern "C" fn(codec: *const AVCodec) -> *mut AVCodecContext;

type AvCodecParametersToContextFn =
    unsafe extern "C" fn(avctx: *mut AVCodecContext, par: *const c_void) -> c_int;

type AvCodecOpen2Fn = unsafe extern "C" fn(
    avctx: *mut AVCodecContext,
    codec: *const AVCodec,
    options: *mut *mut AVDictionary,
) -> c_int;

type AvReadFrameFn = unsafe extern "C" fn(s: *mut AVFormatContext, pkt: *mut c_void) -> c_int;

type AvPacketUnrefFn = unsafe extern "C" fn(pkt: *mut c_void);

type AvCodecSendPacketFn =
    unsafe extern "C" fn(avctx: *mut AVCodecContext, pkt: *const c_void) -> c_int;

type AvCodecReceiveFrameFn =
    unsafe extern "C" fn(avctx: *mut AVCodecContext, frame: *mut c_void) -> c_int;

type AvFrameUnrefFn = unsafe extern "C" fn(frame: *mut c_void);

type AvCodecFreeContextFn = unsafe extern "C" fn(avctx: *mut *mut AVCodecContext);

type AvFormatAllocContextFn = unsafe extern "C" fn() -> *mut AVFormatContext;

type AvFormatFreeContextFn = unsafe extern "C" fn(s: *mut AVFormatContext);

type AvDictSetFn = unsafe extern "C" fn(
    pm: *mut *mut AVDictionary,
    key: *const c_char,
    value: *const c_char,
    flags: c_int,
) -> c_int;

type AvDictFreeFn = unsafe extern "C" fn(m: *mut *mut AVDictionary);

type AvVersionInfoFn = unsafe extern "C" fn() -> *const c_char;

// 更多 FFmpeg API 函数类型
type AvStrerrorFn =
    unsafe extern "C" fn(errnum: c_int, errbuf: *mut c_char, errbuf_size: usize) -> usize;

type AvFormatAllocOutputContext2Fn = unsafe extern "C" fn(
    ctx: *mut *mut AVFormatContext,
    oformat: *const c_void,
    format_name: *const c_char,
    filename: *const c_char,
) -> c_int;

type AvIOOpenFn =
    unsafe extern "C" fn(s: *mut *mut c_void, url: *const c_char, flags: c_int) -> c_int;

type AvIOCloseFn = unsafe extern "C" fn(s: *mut *mut c_void) -> c_int;

type AvWriteHeaderFn = unsafe extern "C" fn(s: *mut AVFormatContext) -> c_int;

type AvWriteFrameFn = unsafe extern "C" fn(s: *mut AVFormatContext, pkt: *const c_void) -> c_int;

type AvWriteTrailerFn = unsafe extern "C" fn(s: *mut AVFormatContext) -> c_int;

type AvFormatNewStreamFn =
    unsafe extern "C" fn(s: *mut AVFormatContext, c: *const AVCodec) -> *mut AVStream;

type AvCodecParametersCopyFn = unsafe extern "C" fn(dst: *mut c_void, src: *const c_void) -> c_int;

type AvCodecParametersFromContextFn =
    unsafe extern "C" fn(par: *mut c_void, codec: *const AVCodecContext) -> c_int;

// FFmpeg 函数加载器
// 使用全局静态变量存储 Library，然后按需获取 Symbol
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref FFMPEG_FFI_LIB: Mutex<Option<Library>> = Mutex::new(None);
}

pub struct FFmpegFFI;

impl FFmpegFFI {
    /// 初始化 FFmpeg FFI（加载库并验证）
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

        // 验证库是否可用
        let _: Symbol<AvVersionInfoFn> = library
            .get(b"av_version_info\0")
            .map_err(|e| FFmpegLoadError::SymbolNotFound(format!("av_version_info: {}", e)))?;

        let mut lib_guard = FFMPEG_FFI_LIB.lock().unwrap();
        *lib_guard = Some(library);
        Ok(())
    }

    /// 获取版本信息
    pub unsafe fn get_version() -> Result<String, FFmpegLoadError> {
        with_ffmpeg_lib(|lib| {
            let version_fn: Symbol<AvVersionInfoFn> = lib
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
        })
    }
}

/// 执行需要 FFmpeg 符号的操作
/// 这个函数确保 Library 在使用期间保持有效
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

// 注意：实际的 FFmpeg API 调用需要更复杂的实现
// 这里只是定义了基本的 FFI 结构
// 完整的实现需要处理内存管理、错误处理等

// 注意：获取 FFmpeg 函数符号需要在 with_ffmpeg_lib 回调内部进行
// 因为 Library 的生命周期需要被正确管理
