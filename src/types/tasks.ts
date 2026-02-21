import { ConvertAudioTaskArgs, ConvertImageTaskArgs, ConvertVideoTaskArgs, } from "@/lib/mediaTaskEvent";

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
  size: number;
  streams: StreamDetails[];
  format_long_name?: string;
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


export enum FileType {
  Video = "video",
  Audio = "audio",
  Image = "image",
  Gif = "gif",
}

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface FFmpegTask {
  id: string;
  status: "idle" | "processing" | "finished" | "error" | "cancelled";
  progress: number;
  errorMessage?: string;
  outputTitle?: string;
  args: any;
  fileType: FileType;
  taskType: MediaTaskType;
}

export interface ConverterTask extends FFmpegTask {
  mediaDetails?: MediaDetails;
  activeCategory?: FileType | ActiveCategoryEnum;
}

export interface CompressingTask extends FFmpegTask {
  mediaDetails?: MediaDetails;
  activeCategory?: FileType | ActiveCategoryEnum;
}
