import { FileType } from "./tasks";

/**
 * 通用选择项接口
 */
export interface SelectOption {
  value: any;
  label: string;
  description?: string;
}

/**
 * 编码器选项接口
 */
export interface EncoderOption extends SelectOption {
  sampleRateOptions?: SelectOption[]; // 支持的采样率
  channelsOptions?: SelectOption[]; // 支持的声道数
  bitrateOptions?: SelectOption[]; // 支持的码率
}

/**
 * 颜色空间选项接口
 */
export interface ColorSpaceOption extends SelectOption {
}

/**
 * 格式分类接口
 */
export interface FormatCategory {
  id: string;
  label: string;
  icon: any;
}

/**
 * 格式组接口
 */
export interface FormatGroup {
  id: string;
  label: string;
  icon?: any;
  category: FileType;
}

/**
 * 支持的容器格式枚举
 */
export enum FormatEnum {
  // Audio Container / File Formats
  MP3 = "mp3",
  M4A = "m4a",
  WAV = "wav",
  M4R = "m4r",
  AIFF = "aiff",
  FLAC = "flac",
  OGG = "ogg",
  OPUS = "opus",
  AAC = "aac",
  AC3 = "ac3",
  EAC3 = "eac3",
  AMR = "amr",
  MP2 = "mp2",
  M4B = "m4b",
  APE = "ape",
  CAF = "caf",
  WMA = "wma",

  // Video Container Formats
  MP4 = "mp4",
  M4V = "m4v",
  MOV = "mov",
  MKV = "mkv",
  AVI = "avi",
  WMV = "wmv",
  ASF = "asf",
  WEBM = "webm",
  FLV = "flv",
  TS = "ts",
  M2TS = "m2ts",
  // Keep both names for backward compatibility (historical typo: GP3)
  THREE_GP = "3gp",
  GP3 = "3gp",
  MPG = "mpg",
  VOB = "vob",
  OGV = "ogv",

  // Image
  JPG = "jpg",
  PNG = "png",
  WEBP = "webp",
  AVIF = "avif",
  GIF = "gif",
  HEIC = "heic",
  TIFF = "tiff",
  BMP = "bmp",
  ICO = "ico"
}

/**
 * 音频编码器枚举（ffmpeg-next 8.0.0 支持的音频编码器）
 */
export enum AudioEncoderEnum {
  // Lossy codecs
  AAC = "aac",                    // Advanced Audio Coding
  AAC_AT = "aac_at",              // AAC (macOS hardware acceleration)
  MP3 = "libmp3lame",             // MP3 (LAME encoder)
  OPUS = "libopus",               // Opus audio codec
  VORBIS = "libvorbis",           // Vorbis audio codec
  AC3 = "ac3",                    // Dolby Digital (AC-3)
  EAC3 = "eac3",                  // Dolby Digital Plus (E-AC-3)
  MP2 = "mp2",             // MP2 audio codec
  WMAV2 = "wmav2",                // Windows Media Audio 2
  // AMR_NB = "libopencore_amrnb",   // AMR Narrowband
  // AMR_WB = "libopencore_amrwb",   // AMR Wideband

  // Lossless codecs
  FLAC = "flac",                  // Free Lossless Audio Codec
  ALAC = "alac",                  // Apple Lossless Audio Codec
  APE = "ape",                    // Monkey's Audio

  // PCM formats
  PCM_S16LE = "pcm_s16le",        // PCM signed 16-bit little-endian
  PCM_S24LE = "pcm_s24le",        // PCM signed 24-bit little-endian
  PCM_S32LE = "pcm_s32le",        // PCM signed 32-bit little-endian
  PCM_U8 = "pcm_u8",              // PCM unsigned 8-bit
  PCM_S8 = "pcm_s8",              // PCM signed 8-bit
  PCM_S16BE = "pcm_s16be",        // PCM signed 16-bit big-endian
  PCM_S24BE = "pcm_s24be",        // PCM signed 24-bit big-endian
  PCM_S32BE = "pcm_s32be",        // PCM signed 32-bit big-endian
  PCM_F32LE = "pcm_f32le",        // PCM 32-bit floating point little-endian
  PCM_F64LE = "pcm_f64le",        // PCM 64-bit floating point little-endian
  PCM_F32BE = "pcm_f32be",        // PCM 32-bit floating point big-endian
  PCM_F64BE = "pcm_f64be",        // PCM 64-bit floating point big-endian
  PCM_ALAW = "pcm_alaw",          // PCM A-law
  PCM_MULAW = "pcm_mulaw",          // PCM μ-law

  ADPCM_MS = "adpcm_ms",          // ADPCM Microsoft
  ADPCM_IMA_WAV = "adpcm_ima_wav",  // ADPCM IMA WAV
  GSM_MS = "gsm_ms",              // GSM Microsoft
}

/**
 * 视频编码器枚举（ffmpeg-next 7.1.0 支持的视频编码器）
 */
export enum VideoEncoderEnum {
  // H.264 / AVC
  H264 = "h264",                       // H.264 (generic)

  // H.265 / HEVC
  H265 = "h265",                       // H.265/HEVC (generic)

  // VP8/VP9
  VP8 = "libvpx",                      // VP8 video codec
  VP9 = "libvpx-vp9",                  // VP9 video codec

  // AV1
  AV1 = "libaom-av1",                  // AV1 (libaom encoder)
  AV1_SVTAV1 = "libsvtav1",            // AV1 (SVT-AV1 encoder)
  AV1_RAV1E = "librav1e",              // AV1 (rav1e encoder)

  // Apple ProRes
  PRORES = "prores_ks",                // Apple ProRes (software)

  // MPEG
  MPEG4 = "mpeg4",                     // MPEG-4 Part 2
  MPEG2VIDEO = "mpeg2video",           // MPEG-2 video
  MJPEG = "mjpeg",                     // Motion JPEG

  // Other
  THEORA = "libtheora",                // Theora video codec
  XVID = "libxvid",                    // Xvid MPEG-4 Part 2
  H263 = "h263",                       // H.263 video codec
  H261 = "h261",                       // H.261 video codec

  PRORES_LT = "prores_lt",
  PRORES_422 = "prores_422",
  PRORES_HQ = "prores_hq",
  PRORES_4444 = "prores_4444",
  PRORES_4444_XQ = "prores_4444_xq",
  DNXHD = "dnxhd",
  DNXHR_LB = "dnxhr_lb",
  DNXHR_SQ = "dnxhr_sq",
  DNXHR_HQ = "dnxhr_hq",
  DNXHR_444 = "dnxhr_444",
}

/**
 * 图片编码器枚举（ffmpeg-next 7.1.0 支持的图片编码器）
 * 注意：FFmpeg 中的图片编码器通常通过 muxer 处理，这里列出的是编码器名称
 */
export enum ImageEncoderEnum {
  JPEG = "mjpeg",                     // Motion JPEG (also used for still images)
  PNG = "png",                        // PNG image encoder
  WEBP = "webp",                      // WebP image encoder
  HEIC = "heic",                      // HEIC/HEIF image encoder
  GIF = "gif",                        // GIF image encoder
  TIFF = "tiff",                      // TIFF image encoder
  BMP = "bmp",                        // BMP image encoder
  JPEG2000 = "jpeg2000",              // JPEG 2000 image encoder
  AVIF = "avif",                      // AVIF image encoder (注意：不是 "av1")
  PCX = "pcx",                        // PCX image encoder
  SGI = "sgi",                        // SGI image encoder
  SUNRAST = "sunrast",                // Sun Raster image encoder
  XBM = "xbm",                        // XBM image encoder
  XWD = "xwd",                        // XWD image encoder
  ICO = ""
}

/**
 * 编码器枚举（组合所有编码器类型）
 */
export enum EncoderEnum {
  // Special
  AUTO = "auto",
  COPY = "copy",

  // Audio
  AAC = AudioEncoderEnum.AAC,
  AAC_AT = AudioEncoderEnum.AAC_AT,
  MP3 = AudioEncoderEnum.MP3,
  OPUS = AudioEncoderEnum.OPUS,
  FLAC = AudioEncoderEnum.FLAC,
  ALAC = AudioEncoderEnum.ALAC,
  VORBIS = AudioEncoderEnum.VORBIS,
  AC3 = AudioEncoderEnum.AC3,
  EAC3 = AudioEncoderEnum.EAC3,
  PCM_S16LE = AudioEncoderEnum.PCM_S16LE,
  PCM_S24LE = AudioEncoderEnum.PCM_S24LE,
  PCM_S32LE = AudioEncoderEnum.PCM_S32LE,
  PCM_U8 = AudioEncoderEnum.PCM_U8,
  PCM_S8 = AudioEncoderEnum.PCM_S8,
  PCM_S16BE = AudioEncoderEnum.PCM_S16BE,
  PCM_S24BE = AudioEncoderEnum.PCM_S24BE,
  PCM_S32BE = AudioEncoderEnum.PCM_S32BE,
  PCM_F32LE = AudioEncoderEnum.PCM_F32LE,
  PCM_F64LE = AudioEncoderEnum.PCM_F64LE,
  PCM_F32BE = AudioEncoderEnum.PCM_F32BE,
  PCM_F64BE = AudioEncoderEnum.PCM_F64BE,
  PCM_ALAW = AudioEncoderEnum.PCM_ALAW,
  PCM_MULAW = AudioEncoderEnum.PCM_MULAW,
  ADPCM_MS = AudioEncoderEnum.ADPCM_MS,
  ADPCM_IMA_WAV = AudioEncoderEnum.ADPCM_IMA_WAV,
  GSM_MS = AudioEncoderEnum.GSM_MS,
  MP2 = AudioEncoderEnum.MP2,
  WMAV2 = AudioEncoderEnum.WMAV2,
  // AMR_NB = AudioEncoderEnum.AMR_NB,
  // AMR_WB = AudioEncoderEnum.AMR_WB,
  APE = AudioEncoderEnum.APE,


  // Video
  H264 = VideoEncoderEnum.H264,
  H265 = VideoEncoderEnum.H265,
  VP8 = VideoEncoderEnum.VP8,
  VP9 = VideoEncoderEnum.VP9,
  AV1 = VideoEncoderEnum.AV1,
  AV1_SVTAV1 = VideoEncoderEnum.AV1_SVTAV1,
  AV1_RAV1E = VideoEncoderEnum.AV1_RAV1E,
  PRORES = VideoEncoderEnum.PRORES,
  PRORES_LT = VideoEncoderEnum.PRORES_LT,
  PRORES_422 = VideoEncoderEnum.PRORES_422,
  PRORES_HQ = VideoEncoderEnum.PRORES_HQ,
  PRORES_4444 = VideoEncoderEnum.PRORES_4444,
  PRORES_4444_XQ = VideoEncoderEnum.PRORES_4444_XQ,
  DNXHD = VideoEncoderEnum.DNXHD,
  DNXHR_LB = VideoEncoderEnum.DNXHR_LB,
  DNXHR_SQ = VideoEncoderEnum.DNXHR_SQ,
  DNXHR_HQ = VideoEncoderEnum.DNXHR_HQ,
  DNXHR_444 = VideoEncoderEnum.DNXHR_444,
  MPEG4 = VideoEncoderEnum.MPEG4,
  MPEG2VIDEO = VideoEncoderEnum.MPEG2VIDEO,
  MJPEG = VideoEncoderEnum.MJPEG,
  THEORA = VideoEncoderEnum.THEORA,
  XVID = VideoEncoderEnum.XVID,
  H263 = VideoEncoderEnum.H263,
  H261 = VideoEncoderEnum.H261,

  // Image
  JPEG = ImageEncoderEnum.JPEG,
  PNG = ImageEncoderEnum.PNG,
  WEBP = ImageEncoderEnum.WEBP,
  HEIC = ImageEncoderEnum.HEIC,
  GIF = ImageEncoderEnum.GIF,
  TIFF = ImageEncoderEnum.TIFF,
  BMP = ImageEncoderEnum.BMP,
  JPEG2000 = ImageEncoderEnum.JPEG2000,
  AVIF = ImageEncoderEnum.AVIF,
  PCX = ImageEncoderEnum.PCX,
  SGI = ImageEncoderEnum.SGI,
  SUNRAST = ImageEncoderEnum.SUNRAST,
  XBM = ImageEncoderEnum.XBM,
  XWD = ImageEncoderEnum.XWD,
  ICO = ImageEncoderEnum.ICO
}
