import { AudioTrackConfig, CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import {
  VIDEO_CONTAINER_DEFINITIONS,
  VIDEO_ENCODER_DEFINITIONS,
} from "@/data/capabilities";
import {
  VideoEncoderEnum,
  AudioEncoderEnum,
  FormatEnum,
} from "@/types/options";

export type VideoCompressionTier =
  | "extreme_compression"
  | "high_compression"
  | "balanced"
  | "high_quality";

export interface VideoCompressionPresetResult {
  tier: VideoCompressionTier;
  patch: Partial<CompressVideoTaskArgs>;
}

export interface VideoCompressionSourceProfile {
  videoBitrateKbps?: number;
  frameRate?: number;
  keyframeInterval?: number;
}

const clampRatio = (ratio: number) => {
  if (Number.isNaN(ratio)) return 50;
  return Math.max(0, Math.min(100, Math.round(ratio)));
};

const ratioToQuality = (ratio: number) =>
  Math.max(1, Math.min(100, Math.round(ratio)));

const cloneAudioTracks = (
  audioTracks?: AudioTrackConfig[],
): AudioTrackConfig[] => {
  const source =
    audioTracks && audioTracks.length > 0
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

const pickSupportedVideoEncoder = (
  format: FormatEnum | undefined,
  preferred: VideoEncoderEnum[],
) => {
  const allowed = format
    ? VIDEO_CONTAINER_DEFINITIONS[format]?.video?.allowedEncoders
    : undefined;

  if (allowed && allowed.length > 0) {
    for (const codec of preferred) {
      if (allowed.includes(codec)) return codec;
    }
    return allowed[0];
  }

  for (const codec of preferred) {
    if (codec) return codec;
  }
  return VideoEncoderEnum.H264;
};

const resolveFrameRate = (
  maxFrameRate: number | undefined,
  targetFrameRate: number,
) => {
  const normalizedTarget = Math.max(1, Math.round(targetFrameRate));
  if (!maxFrameRate || maxFrameRate <= 0) {
    return normalizedTarget;
  }
  return Math.min(normalizedTarget, Math.round(maxFrameRate));
};

const resolveKeyframeInterval = (
  gopOptions: string[] | undefined,
  targetInterval: number,
) => {
  const parsed = (gopOptions ?? [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (parsed.length === 0) {
    return Math.max(1, Math.round(targetInterval));
  }

  const normalizedTarget = Math.max(1, Math.round(targetInterval));
  if (parsed.includes(normalizedTarget)) {
    return normalizedTarget;
  }
  if (normalizedTarget <= parsed[0]) {
    return parsed[0];
  }
  const last = parsed[parsed.length - 1];
  if (normalizedTarget >= last) {
    return last;
  }

  let nearest = parsed[0];
  for (const gop of parsed) {
    const currentDiff = Math.abs(gop - normalizedTarget);
    const nearestDiff = Math.abs(nearest - normalizedTarget);
    if (
      currentDiff < nearestDiff ||
      (currentDiff === nearestDiff && gop < nearest)
    ) {
      nearest = gop;
    }
  }
  return nearest;
};

const getCodecBitrateFactor = (codec: VideoEncoderEnum) => {
  switch (codec) {
    case VideoEncoderEnum.AV1:
      return 0.75;
    case VideoEncoderEnum.VP9:
      return 0.82;
    case VideoEncoderEnum.H265:
      return 0.85;
    case VideoEncoderEnum.H264:
      return 1.0;
    case VideoEncoderEnum.MPEG4:
      return 1.15;
    case VideoEncoderEnum.MPEG2VIDEO:
      return 1.25;
    case VideoEncoderEnum.PRORES:
      return 2.0;
    case VideoEncoderEnum.MJPEG:
      return 1.8;
    default:
      return 1.0;
  }
};

const resolveVideoBitrate = (
  codec: VideoEncoderEnum,
  frameRate: number,
  baseBitrate: number,
) => {
  const encoderDefinition = VIDEO_ENCODER_DEFINITIONS[codec];
  const minBitrate = Math.max(100, encoderDefinition?.video?.minBitrate ?? 100);
  const maxBitrate = Math.max(
    minBitrate,
    encoderDefinition?.video?.maxBitrate ?? 20000,
  );
  const normalizedFrameRate = Math.max(1, frameRate);
  const frameRateFactor = normalizedFrameRate / 30;
  const codecFactor = getCodecBitrateFactor(codec);

  const target = Math.round(baseBitrate * frameRateFactor * codecFactor);
  return Math.max(minBitrate, Math.min(maxBitrate, target));
};

const normalizeSourceBitrate = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.round(value);
};

const normalizeSourceFrameRate = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
};

const normalizeSourceKeyframeInterval = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.round(value);
};

const resolveBaselineFrameRate = (source?: VideoCompressionSourceProfile) => {
  const sourceFrameRate = normalizeSourceFrameRate(source?.frameRate);
  if (sourceFrameRate) return sourceFrameRate;
  return 30;
};

const resolveBaselineKeyframeInterval = (
  baselineFrameRate: number,
  source?: VideoCompressionSourceProfile,
) => {
  const sourceKeyframeInterval = normalizeSourceKeyframeInterval(
    source?.keyframeInterval,
  );
  if (sourceKeyframeInterval) return sourceKeyframeInterval;
  return Math.max(1, Math.round(baselineFrameRate * 2));
};

export const getVideoCompressionPresetByRatio = (
  ratio: number,
  format: FormatEnum,
  audio_tracks?: AudioTrackConfig[],
  source?: VideoCompressionSourceProfile,
): VideoCompressionPresetResult => {
  const normalizedRatio = clampRatio(ratio);
  const baseTracks = cloneAudioTracks(audio_tracks);
  const baselineFrameRate = resolveBaselineFrameRate(source);
  const baselineKeyframeInterval = resolveBaselineKeyframeInterval(
    baselineFrameRate,
    source,
  );
  const baselineBitrateKbps = normalizeSourceBitrate(source?.videoBitrateKbps);
  const preferredEncoders =
    normalizedRatio < 20
      ? [
          VideoEncoderEnum.AV1,
          VideoEncoderEnum.H264,
          VideoEncoderEnum.VP9,
          VideoEncoderEnum.MPEG4,
        ]
      : [VideoEncoderEnum.H264, VideoEncoderEnum.VP9, VideoEncoderEnum.MPEG4];
  const codec = pickSupportedVideoEncoder(format, preferredEncoders);

  if (normalizedRatio < 20) {
    const encoderDefinition = VIDEO_ENCODER_DEFINITIONS[codec];
    const frame_rate = resolveFrameRate(
      encoderDefinition?.video?.maxFrameRate,
      Math.max(12, Math.round(baselineFrameRate * 0.6)),
    );
    const keyframe_interval = resolveKeyframeInterval(
      encoderDefinition?.video?.gopOptions,
      Math.max(1, Math.round(baselineKeyframeInterval * 1.8)),
    );
    const bitrate = resolveVideoBitrate(
      codec,
      frame_rate,
      baselineBitrateKbps
        ? Math.max(100, Math.round(baselineBitrateKbps * 0.12))
        : 200,
    );
    const audioTracks = baseTracks.map((track) =>
      scaleTrackBitrate(track, 64, 0.5),
    );
    return {
      tier: "extreme_compression",
      patch: {
        ratio: normalizedRatio,
        quality: ratioToQuality(normalizedRatio),
        codec,
        preset: "slow",
        frame_rate,
        keyframe_interval,
        bitrate,
        audio_tracks: audioTracks,
      },
    };
  }

  if (normalizedRatio <= 40) {
    const encoderDefinition = VIDEO_ENCODER_DEFINITIONS[codec];
    const frame_rate = resolveFrameRate(
      encoderDefinition?.video?.maxFrameRate,
      Math.max(15, Math.round(baselineFrameRate * 0.75)),
    );
    const keyframe_interval = resolveKeyframeInterval(
      encoderDefinition?.video?.gopOptions,
      Math.max(1, Math.round(baselineKeyframeInterval * 1.6)),
    );
    const bitrate = resolveVideoBitrate(
      codec,
      frame_rate,
      baselineBitrateKbps
        ? Math.max(120, Math.round(baselineBitrateKbps * 0.26))
        : 1400,
    );
    const audioTracks = baseTracks.map((track) =>
      scaleTrackBitrate(track, 96, 0.5),
    );
    return {
      tier: "high_compression",
      patch: {
        ratio: normalizedRatio,
        quality: ratioToQuality(normalizedRatio),
        codec,
        preset: "slow",
        frame_rate,
        keyframe_interval,
        bitrate,
        audio_tracks: audioTracks,
      },
    };
  }

  if (normalizedRatio <= 70) {
    const encoderDefinition = VIDEO_ENCODER_DEFINITIONS[codec];
    const frame_rate = resolveFrameRate(
      encoderDefinition?.video?.maxFrameRate,
      Math.max(18, Math.round(baselineFrameRate * 0.9)),
    );
    const keyframe_interval = resolveKeyframeInterval(
      encoderDefinition?.video?.gopOptions,
      Math.max(1, Math.round(baselineKeyframeInterval * 1.3)),
    );
    const bitrate = resolveVideoBitrate(
      codec,
      frame_rate,
      baselineBitrateKbps
        ? Math.max(200, Math.round(baselineBitrateKbps * 0.45))
        : 2200,
    );
    const audioTracks = baseTracks.map((track) =>
      scaleTrackBitrate(track, 96, 0.5),
    );
    return {
      tier: "balanced",
      patch: {
        ratio: normalizedRatio,
        quality: ratioToQuality(normalizedRatio),
        codec,
        preset: "medium",
        frame_rate,
        keyframe_interval,
        bitrate,
        audio_tracks: audioTracks,
      },
    };
  }
  const encoderDefinition = VIDEO_ENCODER_DEFINITIONS[codec];
  const frame_rate = resolveFrameRate(
    encoderDefinition?.video?.maxFrameRate,
    Math.max(24, Math.round(baselineFrameRate)),
  );
  const keyframe_interval = resolveKeyframeInterval(
    encoderDefinition?.video?.gopOptions,
    Math.max(1, Math.round(baselineKeyframeInterval * 1.1)),
  );
  const bitrate = resolveVideoBitrate(
    codec,
    frame_rate,
    baselineBitrateKbps
      ? Math.max(300, Math.round(baselineBitrateKbps * 0.7))
      : 3200,
  );
  return {
    tier: "high_quality",
    patch: {
      ratio: normalizedRatio,
      quality: ratioToQuality(normalizedRatio),
      codec,
      preset: "fast",
      frame_rate,
      keyframe_interval,
      bitrate,
      audio_tracks: baseTracks,
    },
  };
};
