import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { EncoderEnum } from "@/types/options";
import { formatToDefinition } from "@/data/capabilities";
import { AudioTrackConfig } from "@/lib/mediaTaskEvent";

export type VideoCompressionTier =
  | "extreme_compression"
  | "high_compression"
  | "balanced"
  | "high_quality";

export interface VideoCompressionPresetResult {
  tier: VideoCompressionTier;
  patch: Partial<CompressVideoTaskArgs>;
}

const clampRatio = (ratio: number) => {
  if (Number.isNaN(ratio)) return 50;
  return Math.max(0, Math.min(100, Math.round(ratio)));
};

export const getVideoCompressionPresetByRatio = (
  ratio: number,
  format: string,
  audio_tracks?: AudioTrackConfig[]
): VideoCompressionPresetResult => {
  const normalizedRatio = clampRatio(ratio);
  const containerDefinition = formatToDefinition.get(format)
  const audioTracks = audio_tracks ? audio_tracks : [{
    source_stream_index: 0,
    codec: EncoderEnum.AAC,
    bitrate: 128,
    sample_rate: 32000,
    channels: 2,
    bit_depth: 16,
  }]

  if (normalizedRatio < 20) {
    audioTracks.forEach(track => {
      track.bitrate = Math.max(64, track.bitrate ?? 128) * 0.5;
    });
    return {
      tier: "extreme_compression",
      patch: {
        ratio: 20,
        codec: containerDefinition?.video?.allowedEncoders?.includes(EncoderEnum.AV1) ? EncoderEnum.AV1 : EncoderEnum.H264,
        preset: "slow",
        frame_rate: 24,
        keyframe_interval: 120,
        bitrate: undefined,
        audio_tracks: audioTracks,
      },
    };
  }

  if (normalizedRatio <= 40) {
    audioTracks.forEach(track => {
      track.bitrate = Math.max(96, track.bitrate ?? 128) * 0.5;
    });
    return {
      tier: "high_compression",
      patch: {
        ratio: normalizedRatio,
        codec: EncoderEnum.H264,
        preset: "slow",
        frame_rate: 24,
        keyframe_interval: 120,
        bitrate: undefined,
        audio_tracks: audioTracks,
      },
    };
  }

  if (normalizedRatio <= 70) {
    audioTracks.forEach(track => {
      track.bitrate = Math.max(96, track.bitrate ?? 128) * 0.5;
    });
    return {
      tier: "balanced",
      patch: {
        ratio: normalizedRatio,
        codec: EncoderEnum.H264,
        preset: "medium",
        frame_rate: 30,
        keyframe_interval: 250,
        bitrate: undefined,
        audio_tracks: audioTracks,
      },
    };
  }

  return {
    tier: "high_quality",
    patch: {
      ratio: normalizedRatio,
      codec: EncoderEnum.H264,
      preset: "fast",
      frame_rate: 30,
      keyframe_interval: 250,
      bitrate: undefined,
      audio_tracks: audioTracks,
    },
  };
};
