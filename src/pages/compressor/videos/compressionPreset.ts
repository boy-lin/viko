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
  sourceCodec?: string;
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

const pickVideoEncoderBySourceAndFormat = (
  format: FormatEnum,
  sourceCodec?: string,
) => {
  const allowed = VIDEO_CONTAINER_DEFINITIONS[format]?.video?.allowedEncoders || [];
  const normalizedSourceCodec = String(sourceCodec ?? "").toLowerCase() as VideoEncoderEnum;
  if (normalizedSourceCodec && allowed.includes(normalizedSourceCodec)) {
    return normalizedSourceCodec;
  }
  if (allowed.length > 0) return allowed[0];
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

const clampByRange = (value: number, min?: number, max?: number) => {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  let clamped = value;
  if (min && Number.isFinite(min) && min > 0) {
    clamped = Math.max(clamped, min);
  }
  if (max && Number.isFinite(max) && max > 0) {
    clamped = Math.min(clamped, max);
  }
  return clamped;
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
  const codec = pickVideoEncoderBySourceAndFormat(format, source?.sourceCodec);
  const encoderDefinition = VIDEO_ENCODER_DEFINITIONS[codec];
  const videoMinBitrate = Math.max(100, encoderDefinition?.video?.minBitrate ?? 100);
  const videoMaxBitrate = Math.max(
    videoMinBitrate,
    encoderDefinition?.video?.maxBitrate ?? 50000,
  );

  const bitrateFactor = 0.15 + normalizedRatio * 0.0085;
  const frameRateFactor = 0.5 + normalizedRatio * 0.005;
  const keyframeFactor = Math.max(1.0, 2.2 - normalizedRatio * 0.012);
  const audioBitrateFactor = 0.35 + normalizedRatio * 0.0065;

  const fallbackBitrateByTier =
    normalizedRatio < 20 ? 600 : normalizedRatio <= 40 ? 1400 : normalizedRatio <= 70 ? 2400 : 3800;
  const fallbackFrameRateByTier =
    normalizedRatio < 20 ? 15 : normalizedRatio <= 40 ? 20 : normalizedRatio <= 70 ? 24 : 30;
  const sourceBasedFrameRate = Math.max(12, Math.round(baselineFrameRate * frameRateFactor));
  const sourceBasedKeyframe = Math.max(1, Math.round(baselineKeyframeInterval * keyframeFactor));
  const baseBitrateForCodec =
    baselineBitrateKbps
      ? Math.max(videoMinBitrate, Math.round(baselineBitrateKbps * bitrateFactor))
      : fallbackBitrateByTier;
  const sourceBasedBitrate = resolveVideoBitrate(
    codec,
    sourceBasedFrameRate,
    baseBitrateForCodec,
  );

  const frame_rate = resolveFrameRate(
    encoderDefinition?.video?.maxFrameRate,
    sourceBasedFrameRate || fallbackFrameRateByTier,
  ).toString();
  const keyframe_interval = resolveKeyframeInterval(
    encoderDefinition?.video?.gopOptions,
    sourceBasedKeyframe,
  );
  const bitrate = clampByRange(sourceBasedBitrate, videoMinBitrate, videoMaxBitrate) ?? fallbackBitrateByTier;
  const audioTracks = baseTracks.map((track) =>
    scaleTrackBitrate(track, 64, audioBitrateFactor),
  );

  if (normalizedRatio < 20) {
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
  return {
    tier: "high_quality",
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
};
