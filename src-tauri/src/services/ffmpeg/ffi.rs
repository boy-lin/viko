// FFmpeg FFI 缁戝畾
// 瀹氫箟 FFmpeg C API 鐨勭粨鏋勪綋鍜屽嚱鏁扮鍚?

use libloading::{Library, Symbol};
use std::ffi::CStr;
use std::os::raw::{c_char, c_int, c_void};

use crate::services::ffmpeg::loader::{get_loaded_ffmpeg_path, is_ffmpeg_loaded, FFmpegLoadError};

// FFmpeg 缁撴瀯浣撳畾涔夛紙绠€鍖栫増锛?
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

// FFmpeg 鍑芥暟鎸囬拡绫诲瀷
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

// 鏇村 FFmpeg API 鍑芥暟绫诲瀷
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

// FFmpeg 鍑芥暟鍔犺浇鍣?
// 浣跨敤鍏ㄥ眬闈欐€佸彉閲忓瓨鍌?Library锛岀劧鍚庢寜闇€鑾峰彇 Symbol
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref FFMPEG_FFI_LIB: Mutex<Option<Library>> = Mutex::new(None);
}

pub struct FFmpegFFI;

impl FFmpegFFI {
    /// 鍒濆鍖?FFmpeg FFI锛堝姞杞藉簱骞堕獙璇侊級
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

        // 楠岃瘉搴撴槸鍚﹀彲鐢?
        let _: Symbol<AvVersionInfoFn> = library
            .get(b"av_version_info\0")
            .map_err(|e| FFmpegLoadError::SymbolNotFound(format!("av_version_info: {}", e)))?;

        let mut lib_guard = FFMPEG_FFI_LIB.lock().unwrap();
        *lib_guard = Some(library);
        Ok(())
    }

    /// 鑾峰彇鐗堟湰淇℃伅
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

/// 鎵ц闇€瑕?FFmpeg 绗﹀彿鐨勬搷浣?
/// 杩欎釜鍑芥暟纭繚 Library 鍦ㄤ娇鐢ㄦ湡闂翠繚鎸佹湁鏁?
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

// 娉ㄦ剰锛氬疄闄呯殑 FFmpeg API 璋冪敤闇€瑕佹洿澶嶆潅鐨勫疄鐜?
// 杩欓噷鍙槸瀹氫箟浜嗗熀鏈殑 FFI 缁撴瀯
// 瀹屾暣鐨勫疄鐜伴渶瑕佸鐞嗗唴瀛樼鐞嗐€侀敊璇鐞嗙瓑

// 娉ㄦ剰锛氳幏鍙?FFmpeg 鍑芥暟绗﹀彿闇€瑕佸湪 with_ffmpeg_lib 鍥炶皟鍐呴儴杩涜
// 鍥犱负 Library 鐨勭敓鍛藉懆鏈熼渶瑕佽姝ｇ‘绠＄悊

