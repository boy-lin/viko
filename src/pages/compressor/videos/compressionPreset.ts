import { AudioTrackConfig, CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { formatToDefinition } from "@/data/capabilities";
import { VideoEncoderEnum, AudioEncoderEnum } from "@/types/options";

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

const ratioToQuality = (ratio: number) => Math.max(1, Math.min(100, Math.round(ratio)));

const cloneAudioTracks = (audioTracks?: AudioTrackConfig[]): AudioTrackConfig[] => {
  const source = audioTracks && audioTracks.length > 0
    ? audioTracks
    : [
      {
        source_stream_index: 0,
        codec: AudioEncoderEnum.AAC,
        bitrate: 128,
        sample_rate: 32000,
        channels: 2,
        bit_depth: 16,
      },
    ];

  return source.map((track) => ({ ...track }));
};

const scaleTrackBitrate = (
  track: AudioTrackConfig,
  minBitrate: number,
  factor: number,
): AudioTrackConfig => {
  const base = Math.max(minBitrate, track.bitrate ?? 128);
  return {
    ...track,
    bitrate: Math.round(base * factor),
  };
};

export const getVideoCompressionPresetByRatio = (
  ratio: number,
  format: string,
  audio_tracks?: AudioTrackConfig[],
): VideoCompressionPresetResult => {
  const normalizedRatio = clampRatio(ratio);
  const containerDefinition = formatToDefinition.get(format);
  const baseTracks = cloneAudioTracks(audio_tracks);

  if (normalizedRatio < 20) {
    const appliedRatio = 20;
    const audioTracks = baseTracks.map((track) => scaleTrackBitrate(track, 64, 0.5));
    return {
      tier: "extreme_compression",
      patch: {
        ratio: appliedRatio,
        quality: ratioToQuality(appliedRatio),
        codec: containerDefinition?.video?.allowedEncoders?.includes(VideoEncoderEnum.AV1)
          ? VideoEncoderEnum.AV1
          : VideoEncoderEnum.H264,
        preset: "slow",
        frame_rate: 24,
        keyframe_interval: 120,
        bitrate: undefined,
        audio_tracks: audioTracks,
      },
    };
  }

  if (normalizedRatio <= 40) {
    const audioTracks = baseTracks.map((track) => scaleTrackBitrate(track, 96, 0.5));
    return {
      tier: "high_compression",
      patch: {
        ratio: normalizedRatio,
        quality: ratioToQuality(normalizedRatio),
        codec: VideoEncoderEnum.H264,
        preset: "slow",
        frame_rate: 24,
        keyframe_interval: 120,
        bitrate: undefined,
        audio_tracks: audioTracks,
      },
    };
  }

  if (normalizedRatio <= 70) {
    const audioTracks = baseTracks.map((track) => scaleTrackBitrate(track, 96, 0.5));
    return {
      tier: "balanced",
      patch: {
        ratio: normalizedRatio,
        quality: ratioToQuality(normalizedRatio),
        codec: VideoEncoderEnum.H264,
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
      quality: ratioToQuality(normalizedRatio),
      codec: VideoEncoderEnum.H264,
      preset: "fast",
      frame_rate: 30,
      keyframe_interval: 250,
      bitrate: undefined,
      audio_tracks: baseTracks,
    },
  };
};
