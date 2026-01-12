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

export interface ConversionConfig {
    outputFormat: string;
    outputTitle: string;
    // Video
    video: {
        encoder: string;
        resolution: string;
        frameRate: string;
        bitrate: string;
    },
    // Audio
    audioTracks: AudioTrackConfig[];
}

export interface ConverterTask extends MediaDetails {
    id: string;
    status: "idle" | "converting" | "finished" | "error";
    progress: number;
    outputPath?: string;
    config?: ConversionConfig;
    // Helper fields for UI
    title: string;
    displayFormat: string;
    displayResolution: string;
    displaySize: string;
}
