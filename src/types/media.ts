export interface MediaFileInfo {
  path: string
  size: number
  format: string
  format_long_name?: string
  codec: string
  codec_long_name?: string
  resolution: string
  width: number
  height: number
  duration: number
  output_dir: string
  bitrate?: string
  fps?: string
  avg_frame_rate?: string
  nb_frames?: number
  pix_fmt?: string
  color_space?: string
  color_range?: string
  audio_codec?: string
  audio_codec_long_name?: string
  audio_channels?: string
  audio_channel_layout?: string
  audio_sample_rate?: string
  audio_bitrate?: string
  audio_bits_per_sample?: string
  audio_sample_fmt?: string
  format_bitrate?: string
  format_tags?: Record<string, unknown>
}

export interface TranscodeConfig {
  outputName: string
  outputDir: string
  format: string
  resolution?: string
  quality?: string
}
