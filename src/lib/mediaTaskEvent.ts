import {
  AudioEncoderEnum,
  FormatEnum,
  VideoEncoderEnum,
} from "@/types/options";
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
  codec?: AudioEncoderEnum;
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
  codec?: AudioEncoderEnum;
  bitrate?: number;
  sample_rate?: number;
  channels?: number;
  bit_depth?: number;
  quality?: number;
  filter_spec?: string;
}

export interface DenoiseFilterConfig {
  remove_low?: boolean;
  remove_high?: boolean;
  fft_denoise?: boolean;
  noise_gate?: boolean;
  low_cutoff_hz?: number;
  high_cutoff_hz?: number;
  fft_nr?: number;
  fft_nf?: number;
  gate_threshold?: number;
  gate_ratio?: number;
  gate_attack_ms?: number;
  gate_release_ms?: number;
}

/** 与 Rust TextWatermark 对应 */
export interface TextWatermark {
  content: string;
  font_path?: string;
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
  color_range?: string;
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
  /** Required task id for queue/event tracking. */
  task_id: string;
  /** Source image path. */
  input_path: string;
  input_file_type?: FileType;
  /** Output image format/container: jpg/png/webp/gif/bmp/tiff/ico. */
  format: string;
  /** Optional target width (keep aspect ratio with height if only one side is provided). */
  width?: number;
  /** Optional target height (keep aspect ratio with width if only one side is provided). */
  height?: number;
  /** Optional image encoder/codec name. Falls back to format if omitted. */
  image_encoder?: string;
  /** Optional output file path. Backend auto-generates one if omitted. */
  output_path?: string;
  /** Optional watermark (text/image). */
  watermark?: WatermarkConfig;
}

export interface WatermarkTaskArgs extends ConvertVideoTaskArgs {
  /** Optional hint for backend dispatch. */
  input_file_type?: FileType;
}

export interface DenoiseTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  output_path?: string;
  format?: FormatEnum | string;
  engine?: "ffmpeg" | "ai";
  filter?: DenoiseFilterConfig;
  use_hardware_acceleration?: boolean;
  use_ultra_fast_speed?: boolean;
}

export interface CompressVideoTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  codec?: VideoEncoderEnum;
  resolution?: string;
  bitrate?: number;
  quality?: number;
  frame_rate?: number;
  output_path?: string;
  keyframe_interval?: number;
  color_depth?: number;
  remove_audio?: boolean;
  preset?: string;
  use_hardware_acceleration?: boolean;
  use_ultra_fast_speed?: boolean;
  /** 与 Rust AudioTrackConfig flatten 对齐 */
  audio_tracks?: AudioTrackConfig[];
  /** 仅用于前端展示/输出文件后缀，Rust compress-video 不读取该字段 */
  format: FormatEnum;
  /** only display: 0-100，表示压缩到原文件的百分比 */
  ratio: number;
  /** frontend-only: 源视频码率（kbps），用于 ratio 重算 */
  source_video_bitrate?: number;
  /** frontend-only: 源视频帧率 */
  source_frame_rate?: number;
  /** frontend-only: 源视频关键帧间隔（帧） */
  source_keyframe_interval?: number;
  /** frontend-only: 源音轨参数，用于 ratio 重算 */
  source_audio_tracks?: AudioTrackConfig[];
}

export interface CompressAudioTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  /** 输出容器格式（后端 compress_audio_file 会据此修正输出扩展名并选择 muxer） */
  format: FormatEnum;
  codec: AudioEncoderEnum;
  sample_rate?: number;
  bitrate?: number;
  remove_silence?: boolean;
  volume_gain?: number;
  silence_threshold?: number;
  channels?: number;
  bit_depth?: number;
  output_path: string;
  /** only display */
  ratio: number;
}

export interface CompressImageTaskArgs {
  task_id: string;
  input_path: string;
  input_file_type?: FileType;
  /** only display */
  ratio?: number;
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
