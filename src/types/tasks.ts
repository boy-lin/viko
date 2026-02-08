import { ConvertAudioTaskArgs, ConvertGifTaskArgs, ConvertImageTaskArgs, ConvertVideoTaskArgs } from "@/lib/bridge";

export enum MediaTaskType {
  ConvertVideo = "convert-video",
  ConvertAudio = "convert-audio",
  ConvertGif = "convert-gif",
  ConvertImage = "convert-image",
  CompressVideo = "compress-video",
  CompressAudio = "compress-audio",
  CompressImage = "compress-image",
  Metadata = "metadata",
  Watermark = "watermark",
}

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
  title: string;
  format_long_name?: string;
  size: number;
  streams: StreamDetails[];

  duration?: number;
  tags?: Record<string, string>;
  stream_tags?: Record<string, string>[];
}

export interface TextWatermark {
  content: string;
  font_path: string;
  font_size: number;
  color: string;
  opacity: number;
  x: string;
  y: string;
}

export interface ImageWatermark {
  path: string;
  scale: number;
  opacity: number;
  x: string;
  y: string;
}

// 联合类型
export type ConversionConfig = ConvertVideoTaskArgs | ConvertAudioTaskArgs | ConvertImageTaskArgs;

// 压缩配置类型
export interface VideoCompressionConfig {
  type: "video";
  compressionRatio: number; // 0-100，表示压缩到原文件的百分比
  format?: string;
  width?: number;
  height?: number;
  bitrate?: number; // kbps
  frameRate?: number;
  codec?: string;
  keyframeInterval?: number;
  colorDepth?: number;
  removeAudio?: boolean;
  audioBitrate?: number; // kbps
  preset?: string;
  useHardwareAcceleration?: boolean;
}

export interface AudioCompressionConfig {
  type: "audio";
  compressionRatio: number; // 0-100
  format?: string;
  sampleRate?: number;
  bitrate?: number; // kbps
  codec?: string;
  channels?: number;
  bitDepth?: number;
  removeSilence?: boolean;
  silenceThreshold?: number;
  volumeGain?: number;
}

export interface ImageCompressionConfig {
  type: "image";
  quality: number; // 0-100，质量百分比
  format?: string;
  width?: number;
  height?: number;
  colorMode?: string;
  stripMetadata?: boolean;
  keepTransparency?: boolean;
  dpi?: number;
  cropWhitespace?: boolean;
}

export type CompressionConfig =
  | VideoCompressionConfig
  | AudioCompressionConfig
  | ImageCompressionConfig;

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

export enum FileType {
  Video = "video",
  Audio = "audio",
  Image = "image",
}

export interface ConverterTask extends MediaDetails {
  id: string;
  status: "idle" | "converting" | "finished" | "error";
  progress: number;
  fileType?: FileType;
  errorMessage?: string;
  taskType: MediaTaskType.ConvertVideo | MediaTaskType.ConvertAudio | MediaTaskType.ConvertImage;
  args: ConvertVideoTaskArgs | ConvertAudioTaskArgs | ConvertImageTaskArgs;
  outputPath?: string;
  outputSize?: number;
}

export interface CompressingTask extends MediaDetails {
  id: string;
  status: "idle" | "converting" | "finished" | "error";
  progress: number;
  fileType: FileType;
  outputPath?: string;
  outputSize?: number;
  compressionConfig?: CompressionConfig; // 压缩配置
  taskType?: "convert" | "compress"; // 任务类型：转码或压缩
  errorMessage?: string;
  // Helper fields for UI
  title: string;
  displayFormat: string;
  displayResolution: string;
  displaySize: string;
}

