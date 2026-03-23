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
import {
  FileType,
  MediaDetailsWithResolve,
  MediaTaskType,
} from "@/types/tasks";
import { CompressorTask } from "../store";
import { extractFilenameFromPath } from "@/lib/utils";

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
  const allowed =
    VIDEO_CONTAINER_DEFINITIONS[format]?.video?.allowedEncoders || [];
  const normalizedSourceCodec = String(
    sourceCodec ?? "",
  ).toLowerCase() as VideoEncoderEnum;
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
  const videoMinBitrate = Math.max(
    100,
    encoderDefinition?.video?.minBitrate ?? 100,
  );
  const videoMaxBitrate = Math.max(
    videoMinBitrate,
    encoderDefinition?.video?.maxBitrate ?? 50000,
  );

  const bitrateFactor = 0.15 + normalizedRatio * 0.0085;
  const frameRateFactor = 0.5 + normalizedRatio * 0.005;
  const keyframeFactor = Math.max(1.0, 2.2 - normalizedRatio * 0.012);
  const audioBitrateFactor = 0.35 + normalizedRatio * 0.0065;

  const fallbackBitrateByTier =
    normalizedRatio < 20
      ? 600
      : normalizedRatio <= 40
        ? 1400
        : normalizedRatio <= 70
          ? 2400
          : 3800;
  const fallbackFrameRateByTier =
    normalizedRatio < 20
      ? 15
      : normalizedRatio <= 40
        ? 20
        : normalizedRatio <= 70
          ? 24
          : 30;
  const sourceBasedFrameRate = Math.max(
    12,
    Math.round(baselineFrameRate * frameRateFactor),
  );
  const sourceBasedKeyframe = Math.max(
    1,
    Math.round(baselineKeyframeInterval * keyframeFactor),
  );
  const baseBitrateForCodec = baselineBitrateKbps
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
  const bitrate =
    clampByRange(sourceBasedBitrate, videoMinBitrate, videoMaxBitrate) ??
    fallbackBitrateByTier;
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

interface CompressibilityAssessment {
  score: number;
  text: string;
  colorClass: string;
  recommendedFormat: FormatEnum;
}

const HIGH_EFFICIENCY_CODECS = new Set(["hevc", "h265", "av1", "vp9"]);
const INEFFICIENT_CODECS = new Set([
  "mpeg2video",
  "mpeg4",
  "h263",
  "h261",
  "wmv1",
  "wmv2",
  "wmv3",
]);
const INTRA_OR_LOSSLESS_CODECS = new Set([
  "prores",
  "prores_ks",
  "mjpeg",
  "ffv1",
  "huffyuv",
  "utvideo",
  "rawvideo",
  "dnxhd",
  "dnxhr",
]);

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const SOURCE_CODEC_TO_ENCODER: Partial<Record<string, VideoEncoderEnum>> = {
  h264: VideoEncoderEnum.H264,
  avc: VideoEncoderEnum.H264,
  hevc: VideoEncoderEnum.H265,
  h265: VideoEncoderEnum.H265,
  vp9: VideoEncoderEnum.VP9,
  av1: VideoEncoderEnum.AV1,
  mpeg4: VideoEncoderEnum.MPEG4,
  mpeg2video: VideoEncoderEnum.MPEG2VIDEO,
  mjpeg: VideoEncoderEnum.MJPEG,
  prores: VideoEncoderEnum.PRORES,
  prores_ks: VideoEncoderEnum.PRORES,
  libxvid: VideoEncoderEnum.XVID,
  xvid: VideoEncoderEnum.XVID,
};

const clampScore = (score: number) =>
  Math.max(0, Math.min(100, Math.round(score)));

const parseFrameRateValue = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const input = value.trim();
  if (!input) return 0;
  if (input.includes("/")) {
    const [num, den] = input.split("/");
    const n = Number.parseFloat(num);
    const d = Number.parseFloat(den);
    if (Number.isFinite(n) && Number.isFinite(d) && d > 0) {
      return n / d;
    }
  }
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pickBestCompressionFormat = (
  score: number,
  originalExtension?: string,
): FormatEnum => {
  const original = (originalExtension ?? "").toLowerCase();
  if (score >= 80) return FormatEnum.WEBM;
  if (score >= 60) return FormatEnum.MP4;
  if (
    [FormatEnum.MP4, FormatEnum.MKV, FormatEnum.MOV, FormatEnum.WEBM].includes(
      original as FormatEnum,
    )
  ) {
    return original as FormatEnum;
  }
  return FormatEnum.MP4;
};

const assessCompressibility = (details: any): CompressibilityAssessment => {
  const stream = details?.streams?.find((s: any) => s.codec_type === "video");
  const codecName = String(stream?.codec_name ?? "").toLowerCase();
  const bitrateBps =
    toNumber(stream?.bit_rate) ?? toNumber(details?.bit_rate) ?? 0;
  const bitrateKbps = bitrateBps > 0 ? bitrateBps / 1000 : 0;
  const width = toNumber(stream?.width) ?? 0;
  const height = toNumber(stream?.height) ?? 0;
  const frameRate = parseFrameRateValue(stream?.frame_rate);

  let score = 18;

  if (INTRA_OR_LOSSLESS_CODECS.has(codecName)) score += 30;
  else if (INEFFICIENT_CODECS.has(codecName)) score += 18;
  else if (HIGH_EFFICIENCY_CODECS.has(codecName)) score -= 8;

  if (bitrateKbps >= 20000) score += 28;
  else if (bitrateKbps >= 12000) score += 22;
  else if (bitrateKbps >= 8000) score += 16;
  else if (bitrateKbps >= 5000) score += 10;
  else if (bitrateKbps > 0) score += 4;

  const pixels = width * height;
  if (pixels >= 3840 * 2160) score += 10;
  else if (pixels >= 2560 * 1440) score += 8;
  else if (pixels >= 1920 * 1080) score += 6;
  else if (pixels > 0) score += 3;

  if (frameRate >= 60) score += 8;
  else if (frameRate >= 30) score += 5;
  else if (frameRate > 0) score += 2;

  if (
    HIGH_EFFICIENCY_CODECS.has(codecName) &&
    bitrateKbps > 0 &&
    bitrateKbps <= 3500
  ) {
    score -= 14;
  } else if (
    HIGH_EFFICIENCY_CODECS.has(codecName) &&
    bitrateKbps > 0 &&
    bitrateKbps <= 5500
  ) {
    score -= 8;
  }

  const normalizedScore = clampScore(score);
  const recommendedFormat = pickBestCompressionFormat(
    normalizedScore,
    details?.extension,
  );

  if (normalizedScore >= 80) {
    return {
      score: normalizedScore,
      text: "压缩潜力极高",
      colorClass: "text-emerald-600",
      recommendedFormat,
    };
  }
  if (normalizedScore >= 60) {
    return {
      score: normalizedScore,
      text: "压缩潜力高",
      colorClass: "text-sky-600",
      recommendedFormat,
    };
  }
  if (normalizedScore >= 40) {
    return {
      score: normalizedScore,
      text: "可适度压缩",
      colorClass: "text-amber-600",
      recommendedFormat,
    };
  }
  return {
    score: normalizedScore,
    text: "压缩空间有限",
    colorClass: "text-rose-600",
    recommendedFormat,
  };
};

export const buildDefaultTaskDetailsUpdates = (
  task: CompressorTask,
  details: MediaDetailsWithResolve,
): Partial<CompressorTask> => {
  const title = details.title || extractFilenameFromPath(details.path);
  const taskId = task.id;
  const path = task.args.input_path;
  const assessment = assessCompressibility(details);
  const ratio = typeof task.args.ratio === "number" ? task.args.ratio : 20;
  const currentArgs = task.args as CompressVideoTaskArgs;
  const sourceFormat =
    (details.format as FormatEnum) || (details.extension as FormatEnum);
  const sourceFormatSupported = Boolean(
    sourceFormat && VIDEO_CONTAINER_DEFINITIONS[sourceFormat],
  );
  const currentFormat = sourceFormatSupported
    ? sourceFormat
    : currentArgs.format || assessment.recommendedFormat;
  const firstVideoStream = details?.streams?.find(
    (s: any) => s.codec_type === "video",
  );
  const sourceCodecName = String(
    firstVideoStream?.codec_name ?? "",
  ).toLowerCase();
  const sourceCodec =
    SOURCE_CODEC_TO_ENCODER[sourceCodecName] ??
    (sourceCodecName as VideoEncoderEnum);
  const sourceVideoBitrate = toNumber(firstVideoStream?.bit_rate);
  const sourceVideoBitrateKbps =
    typeof sourceVideoBitrate === "number" && sourceVideoBitrate > 0
      ? Math.max(1, Math.round(sourceVideoBitrate / 1000))
      : undefined;
  const sourceFrameRateRaw = parseFrameRateValue(firstVideoStream?.frame_rate);
  const sourceFrameRate =
    sourceFrameRateRaw > 0 && Number.isFinite(sourceFrameRateRaw)
      ? sourceFrameRateRaw
      : undefined;
  const sourceKeyframeInterval =
    typeof sourceFrameRate === "number"
      ? Math.max(1, Math.round(sourceFrameRate * 2))
      : undefined;
  const initialAudioTracks =
    details?.streams
      ?.filter((stream: any) => stream.codec_type === "audio")
      .map((stream: any) => ({
        source_stream_index: stream.index,
        bitrate:
          typeof stream.bit_rate === "number" && stream.bit_rate > 0
            ? Math.max(1, Math.round(stream.bit_rate / 1000))
            : 128,
        sample_rate:
          typeof stream.sample_rate === "number" && stream.sample_rate > 0
            ? stream.sample_rate
            : 32000,
        channels: stream.channels,
        bit_depth: stream.bit_depth,
      })) || [];

  const ratioPreset = getVideoCompressionPresetByRatio(
    ratio,
    currentFormat,
    initialAudioTracks,
    {
      sourceCodec,
      videoBitrateKbps: sourceVideoBitrateKbps,
      frameRate: sourceFrameRate,
      keyframeInterval: sourceKeyframeInterval,
    },
  );
  const ratioPatch = { ...ratioPreset.patch };
  delete ratioPatch.codec;
  const outputArgs: CompressVideoTaskArgs = {
    ...currentArgs,
    ...ratioPatch,
    task_id: taskId,
    format: currentFormat,
    input_path: path,
    ratio,
    resolution:
      firstVideoStream?.width && firstVideoStream?.height
        ? `${firstVideoStream.width}x${firstVideoStream.height}`
        : undefined,
    frame_rate: sourceFrameRate?.toString(),
    source_video_bitrate: sourceVideoBitrateKbps,
    source_frame_rate: sourceFrameRate,
    source_keyframe_interval: sourceKeyframeInterval,
    source_audio_tracks: initialAudioTracks,
  };
  const containerDefinition =
    VIDEO_CONTAINER_DEFINITIONS[outputArgs.format as FormatEnum];
  const resolvedSourceCodec =
    containerDefinition?.video?.allowedEncoders?.includes(
      sourceCodec as VideoEncoderEnum,
    )
      ? (sourceCodec as VideoEncoderEnum)
      : undefined;
  const resolvedPresetCodec =
    containerDefinition?.video?.allowedEncoders?.includes(
      ratioPreset.patch.codec as VideoEncoderEnum,
    )
      ? (ratioPreset.patch.codec as VideoEncoderEnum)
      : undefined;
  outputArgs.codec =
    resolvedSourceCodec ||
    resolvedPresetCodec ||
    containerDefinition?.video?.allowedEncoders?.[0] ||
    currentArgs.codec;
  outputArgs.audio_tracks =
    details?.streams
      ?.filter((stream: any) => stream.codec_type === "audio")
      .map((stream: any) => ({
        source_stream_index: stream.index,
        codec: containerDefinition?.audio?.allowedEncoders[0],
        bitrate:
          typeof stream.bit_rate === "number" && stream.bit_rate > 0
            ? Math.max(1, Math.round(stream.bit_rate / 1000))
            : 128,
        sample_rate:
          typeof stream.sample_rate === "number" && stream.sample_rate > 0
            ? stream.sample_rate
            : 32000,
        channels: stream.channels,
        bit_depth: stream.bit_depth,
      })) || [];

  return {
    mediaDetails: details,
    args: outputArgs,
    fileType: FileType.Video,
    taskType: MediaTaskType.CompressVideo,
    outputTitle: title,
  };
};
