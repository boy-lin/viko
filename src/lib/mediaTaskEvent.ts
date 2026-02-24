import { FileType, MediaTaskType } from "@/types/tasks";

export type MediaTaskEvent = {
  task_id: string;
  task_type: MediaTaskType;
  file_type: FileType;
  event_type: "progress" | "complete" | "error";
  progress?: number;
  output_path?: string;
  output_size?: number;
  error_message?: string;
};



/** 与 Rust AudioEncodingParams 对应 */
export interface AudioEncodingParams {
  codec?: string;
  bitrate?: number;
  sample_rate?: number;
  channels?: number;
  bit_depth?: number;
  quality?: number;
}

/** 与 Rust AudioTrackConfig 对应 */
export interface AudioTrackConfig {
  source_stream_index?: number;
  /** flatten: 与 AudioEncodingParams 字段一致 */
  codec?: string;
  bitrate?: number;
  sample_rate?: number;
  channels?: number;
  bit_depth?: number;
  quality?: number;
}


/** 与 Rust TextWatermark 对应 */
export interface TextWatermark {
  content: string;
  font_path: string;
  font_size: number;
  color: string;
  opacity: number;
  x: string;
  y: string;
  anchor?: "tl" | "tm" | "tr" | "ml" | "c" | "mr" | "bl" | "bm" | "br";
  offset_x?: number;
  offset_y?: number;
  offset_unit?: "px" | "percent";
}

/** 与 Rust ImageWatermark 对应 */
export interface ImageWatermark {
  path: string;
  scale: number;
  opacity: number;
  x: string;
  y: string;
  anchor?: "tl" | "tm" | "tr" | "ml" | "c" | "mr" | "bl" | "bm" | "br";
  offset_x?: number;
  offset_y?: number;
  offset_unit?: "px" | "percent";
  size_mode?: "video_width_ratio" | "scale";
  size_value?: number;
}


/** 与 Rust WatermarkConfig 对应 */
export interface WatermarkConfig {
  text?: TextWatermark;
  image?: ImageWatermark;
}

/** 与 Rust VideoConversionArgs 对应，用于 convert_video_file */
export interface ConvertVideoTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  output_path?: string;
  format?: string;
  video_encoder?: string;
  video_bitrate?: number;
  min_bitrate?: number;
  max_bitrate?: number;
  rc_mode?: string;
  crf?: number;
  resolution?: string;
  aspect_ratio?: string;
  scaling_mode?: string;
  frame_rate?: string;
  gop_size?: number;
  preset?: string;
  profile?: string;
  tune?: string;
  color_space?: string;
  bit_depth?: number;
  crop?: string;
  audio_tracks?: AudioTrackConfig[];
  default_audio_params?: AudioEncodingParams;
  use_hardware_acceleration?: boolean;
  use_ultra_fast_speed?: boolean;
  watermark?: WatermarkConfig;
}

export interface ConvertAudioTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  format: string;
  // 扩展待同步到rust
  output_path?: string;
  audio_tracks?: AudioTrackConfig[];
  use_hardware_acceleration?: boolean;
  use_ultra_fast_speed?: boolean;
}

export interface ConvertGifTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  format: string;
  output_path?: string;
  width?: number;
  height?: number;
  frame_rate?: number;
  quality?: number;
  preserve_transparency?: boolean;
  color_mode?: string;
  dpi?: number;
  loop_count?: number;
  frame_delay?: number;
  colors?: number;
  preserve_extensions?: boolean;
  sharpen?: boolean;
  denoise?: boolean;
}

export interface ConvertImageTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  format: string;
  width?: number;
  height?: number;
  quality?: number;
  image_encoder?: string;
  output_path?: string;
  watermark?: WatermarkConfig;
}

export interface CompressVideoTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  format: string;
  codec: string;
  resolution: string;
  bitrate: number;
  frame_rate: number;
  output_path?: string;
  keyframe_interval?: number;
  color_depth?: number;
  remove_audio?: boolean;
  audio_bitrate?: number;
  preset?: string;
  use_hardware_acceleration?: boolean;
  /** 扩展待同步到rust */
  ratio: number;// only display 0-100，表示压缩到原文件的百分比
}

export interface CompressAudioTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  format: string;
  codec: string;
  sample_rate?: number
  bitrate?: number
  remove_silence?: boolean;
  volume_gain?: number;
  silence_threshold?: number;
  channels?: number;
  bit_depth?: number;
  output_path: string;
  /** only display */
  ratio: number
}

export interface CompressImageTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  format: string;
  width?: number;
  height?: number;
  quality: number;
  /** 扩展待同步到rust */
  output_path?: string;
  color_mode?: string;
  strip_metadata?: boolean;
  keep_transparency?: boolean;
  dpi?: number;
  crop_whitespace?: boolean;
}
