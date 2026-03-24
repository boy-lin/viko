import {
  ConvertAudioTaskArgs,
  ConvertImageTaskArgs,
  ConvertVideoTaskArgs,
} from "@/lib/mediaTaskEvent";

export enum MediaTaskType {
  ConvertToVideo = "convert-to-video",
  ConvertToAudio = "convert-to-audio",
  ConvertToImage = "convert-to-image",
  ConvertToAnimatedImage = "convert-to-animated-image",
  ConvertDenoise = "convert-denoise",
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
  bit_depth?: number;
  bits_per_sample?: number;
}

export interface MediaDetails {
  path: string;
  extension: string;
  format_names: string;
  title: string;
  size: number;
  streams: StreamDetails[];
  format_long_name?: string;
  duration?: number;
  tags?: Record<string, string>;
  stream_tags?: Record<string, string>[];
}

export interface MediaDetailsWithResolve extends MediaDetails {
  format: string;
  resolution: string;
}

export interface TextWatermark {
  content: string;
  font_path: string;
  rotation?: number;
  font_size: number;
  color: string;
  opacity: number;
  x: string;
  y: string;
}

export interface ImageWatermark {
  path: string;
  rotation?: number;
  scale: number;
  opacity: number;
  x: string;
  y: string;
}

// 联合类型
export type ConversionConfig =
  | ConvertVideoTaskArgs
  | ConvertAudioTaskArgs
  | ConvertImageTaskArgs;

export enum FileType {
  Video = "video",
  Audio = "audio",
  Image = "image",
  Gif = "gif",
}

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface FFmpegTask<TArgs = any> {
  id: string;
  status: "idle" | "queued" | "processing" | "finished" | "error" | "cancelled";
  progress: number;
  errorMessage?: string;
  outputTitle?: string;
  thumbnailPath?: string;
  fileType: FileType;
  taskType: MediaTaskType;
  mediaDetails?: MediaDetailsWithResolve;
  activeCategory?: FileType | ActiveCategoryEnum;
  args: TArgs;
}
