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
  format: string;
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

export interface ConverterTask extends MediaDetails {
  id: string;
  status: "idle" | "converting" | "finished" | "error";
  progress: number;
  outputPath?: string;
  config?: ConversionConfig;
  errorMessage?: string;
  // Helper fields for UI
  title: string;
  displayFormat: string;
  displayResolution: string;
  displaySize: string;
}
