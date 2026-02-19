import { CompressVideoTaskArgs } from "@/lib/bridge";
import { VideoEncoderEnum } from "@/types/options";

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
  supportedEncoders?: string[]
): VideoCompressionPresetResult => {
  const normalizedRatio = clampRatio(ratio);

  if (normalizedRatio < 20) {
    return {
      tier: "extreme_compression",
      patch: {
        ratio: 20,
        codec: supportedEncoders?.includes(VideoEncoderEnum.AV1) ? VideoEncoderEnum.AV1 : VideoEncoderEnum.H264,
        preset: "slow",
        audio_bitrate: 96,
        frame_rate: 24,
        keyframe_interval: 120,
        bitrate: undefined,
      },
    };
  }

  if (normalizedRatio <= 40) {
    return {
      tier: "high_compression",
      patch: {
        ratio: normalizedRatio,
        codec: VideoEncoderEnum.H265,
        preset: "slow",
        audio_bitrate: 96,
        frame_rate: 24,
        keyframe_interval: 120,
        bitrate: undefined,
      },
    };
  }

  if (normalizedRatio <= 70) {
    return {
      tier: "balanced",
      patch: {
        ratio: normalizedRatio,
        codec: VideoEncoderEnum.H264,
        preset: "medium",
        audio_bitrate: 128,
        frame_rate: 30,
        keyframe_interval: 250,
        bitrate: undefined,
      },
    };
  }

  return {
    tier: "high_quality",
    patch: {
      ratio: normalizedRatio,
      codec: VideoEncoderEnum.H264,
      preset: "fast",
      audio_bitrate: 160,
      frame_rate: 30,
      keyframe_interval: 250,
      bitrate: undefined,
    },
  };
};
