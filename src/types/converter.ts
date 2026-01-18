export interface StreamDetails {
  index: number;
  codec_type: string;
  codec_name: string;
  codec_long_name?: string;
  width?: number;
  height?: number;
  frame_rate?: string;
  channels?: number;
  sample_rate?: number;
  bit_rate?: number;
}

export interface MediaDetails {
  path: string;
  extension: string;
  format_names: string;
  duration: number;
  size: number;
  streams: StreamDetails[];
}

export interface AudioTrackConfig {
  trackIndex: number;
  encoder: string;
  channels: string;
  sampleRate: string;
  bitrate: string;
}

export interface VideoTrackConfig {
  encoder: string;
  resolution: string;
  frameRate: string;
  bitrate: string;
}

export interface ImageConfig {
  quality?: string;
  resolution?: string;
}

// 基础配置（所有类型共享）
interface BaseConversionConfig {
  outputFormat: string;
  outputTitle: string;
}

// Video 配置
export interface VideoConversionConfig extends BaseConversionConfig {
  type: "video";
  video: VideoTrackConfig;
  audioTracks?: AudioTrackConfig[]; // 视频可能包含音频轨道
  image?: never; // 明确禁止
}

// Audio 配置
export interface AudioConversionConfig extends BaseConversionConfig {
  type: "audio";
  audioTracks: AudioTrackConfig[]; // 必需
  video?: never; // 明确禁止
  image?: never;
}

// Image 配置
export interface ImageConversionConfig extends BaseConversionConfig {
  type: "image";
  image: ImageConfig;
  video?: never; // 明确禁止
  audioTracks?: never;
}

// 联合类型
export type ConversionConfig =
  | VideoConversionConfig
  | AudioConversionConfig
  | ImageConversionConfig;

// 压缩配置类型
export interface VideoCompressionConfig {
  type: "video";
  compressionRatio: number; // 0-100，表示压缩到原文件的百分比
}

export interface AudioCompressionConfig {
  type: "audio";
  compressionRatio: number; // 0-100
}

export interface ImageCompressionConfig {
  type: "image";
  quality: number; // 0-100，质量百分比
}

export type CompressionConfig =
  | VideoCompressionConfig
  | AudioCompressionConfig
  | ImageCompressionConfig;

// 类型守卫函数
export function isVideoConfig(
  config: ConversionConfig
): config is VideoConversionConfig {
  return config.type === "video";
}

export function isAudioConfig(
  config: ConversionConfig
): config is AudioConversionConfig {
  return config.type === "audio";
}

export function isImageConfig(
  config: ConversionConfig
): config is ImageConversionConfig {
  return config.type === "image";
}

export function isVideoCompressionConfig(
  config: CompressionConfig
): config is VideoCompressionConfig {
  return config.type === "video";
}

export function isAudioCompressionConfig(
  config: CompressionConfig
): config is AudioCompressionConfig {
  return config.type === "audio";
}

export function isImageCompressionConfig(
  config: CompressionConfig
): config is ImageCompressionConfig {
  return config.type === "image";
}

export type FileType = "video" | "audio" | "image";
export interface ConverterTask extends MediaDetails {
  id: string;
  status: "idle" | "converting" | "finished" | "error";
  progress: number;
  fileType: FileType;
  outputPath?: string;
  config?: ConversionConfig;
  compressionConfig?: CompressionConfig; // 压缩配置
  taskType?: "convert" | "compress"; // 任务类型：转码或压缩
  errorMessage?: string;
  // Helper fields for UI
  title: string;
  displayFormat: string;
  displayResolution: string;
  displaySize: string;
}
