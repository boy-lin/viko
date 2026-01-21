/**
 * 通用选择项接口
 */
export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * 编码器选项接口
 */
export interface EncoderOption extends SelectOption {
  formats?: string[]; // 支持的容器格式
  sampleRateOptions?: SelectOption[]; // 支持的采样率
  channelsOptions?: SelectOption[]; // 支持的声道数
  bitrateOptions?: SelectOption[]; // 支持的码率
}

/**
 * 颜色空间选项接口
 */
export interface ColorSpaceOption extends SelectOption {
  supportedEncoders?: string[]; // 支持的编码器
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
 * 格式选项接口
 */
export interface FormatOption {
  id: string;
  label: string;
  category: string;
  group: string;
  description?: string;
  extension?: string;
  quality?: string;
  tags?: string[];
}

/**
 * 支持的容器格式枚举
 */
export enum FormatEnum {
  // Audio
  MP3 = "mp3",
  M4A = "m4a",
  WAV = "wav",
  M4R = "m4r",
  AIFF = "aiff",
  FLAC = "flac",
  OGG = "ogg",
  AAC = "aac",
  AC3 = "ac3",
  EAC3 = "eac3",
  AMR = "amr",
  MP2 = "mp2",
  M4B = "m4b",
  APE = "ape",
  CAF = "caf",

  // Video
  MP4 = "mp4",
  MOV = "mov",
  MKV = "mkv",
  AVI = "avi",
  WMV = "wmv",
  WEBM = "webm",
  FLV = "flv",
  GP3 = "3gp",
  MPG = "mpg",
  VOB = "vob",
  OGV = "ogv",

  // Image
  JPG = "jpg",
  PNG = "png",
  WEBP = "webp",
  HEIC = "heic",
  GIF = "gif",
  TIFF = "tiff"
}

/**
 * 编码器枚举
 */
export enum EncoderEnum {
  // Special
  AUTO = "auto",
  COPY = "copy",

  // Audio
  AAC = "aac",
  MP3 = "libmp3lame",
  OPUS = "libopus",
  FLAC = "flac",
  ALAC = "alac",
  VORBIS = "libvorbis",
  AC3 = "ac3",
  EAC3 = "eac3",
  PCM_S16LE = "pcm_s16le",
  PCM_S24LE = "pcm_s24le",
  MP2 = "libmp2lame",
  AMR_NB = "libopencore_amrnb",
  APE = "ape",
  // AMR_WB = "libopencore_amrwb",
  // Video
  H264 = "libx264",
  H265 = "libx265",
  H264_HARDWARE = "h264_videotoolbox",
  HEVC_HARDWARE = "hevc_videotoolbox",
  PRORES = "prores_ks",
  VP9 = "libvpx-vp9",
  AV1 = "libaom-av1",

  // Image
  JPEG = "mjpeg",
  PNG = "png",
  WEBP = "webp",
  HEIC = "heic",
  GIF = "gif",
  TIFF = "tiff",
  BMP = "bmp",
  JPEG2000 = "jpeg2000",
  AVIF = "av1",
}
