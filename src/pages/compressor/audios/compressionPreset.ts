import { CompressAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import {
  AUDIO_CONTAINER_DEFINITIONS,
  AUDIO_ENCODER_DEFINITIONS,
} from "@/data/capabilities";
import { CompressorTask } from "../store";
import { MediaDetailsWithResolve } from "@/types/tasks";

export type AudioCompressionTier =
  | "extreme_compression"
  | "high_compression"
  | "balanced"
  | "high_quality";

export interface AudioCompressionPresetResult {
  tier: AudioCompressionTier;
  patch: Partial<CompressAudioTaskArgs>;
}

export interface AudioCompressionSourceContext {
  sourceCodec?: string;
  sourceBitrate?: number;
  sourceSampleRate?: number;
  sourceChannels?: number;
  sourceBitDepth?: number;
}

const clampRatio = (ratio: number) => {
  if (Number.isNaN(ratio)) return 50;
  return Math.max(0, Math.min(100, Math.round(ratio)));
};

const toPositiveNumber = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

const pickCodecBySourceAndFormat = (
  format: FormatEnum,
  sourceCodec: string | undefined,
) => {
  const allowed = AUDIO_CONTAINER_DEFINITIONS[format]?.allowedEncoders || [];
  const normalizedSourceCodec = String(
    sourceCodec ?? "",
  ).toLowerCase() as AudioEncoderEnum;
  if (normalizedSourceCodec && allowed.includes(normalizedSourceCodec)) {
    return normalizedSourceCodec;
  }
  if (allowed.length > 0) return allowed[0];
  return AudioEncoderEnum.AAC;
};
const resolveChannels = (
  allowedChannels: string[] | undefined,
  targetChannels: number,
) => {
  const parsed = (allowedChannels ?? [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (parsed.length === 0) {
    return targetChannels;
  }

  if (parsed.includes(targetChannels)) {
    return targetChannels;
  }

  if (targetChannels <= parsed[0]) {
    return parsed[0];
  }

  const last = parsed[parsed.length - 1];
  if (targetChannels >= last) {
    return last;
  }

  let nearest = parsed[0];
  for (const channel of parsed) {
    const currentDiff = Math.abs(channel - targetChannels);
    const nearestDiff = Math.abs(nearest - targetChannels);
    if (
      currentDiff < nearestDiff ||
      (currentDiff === nearestDiff && channel < nearest)
    ) {
      nearest = channel;
    }
  }
  return nearest;
};

const resolveBitDepth = (
  allowedBitDepths: number[] | undefined,
  targetBitDepth: number,
) => {
  const parsed = (allowedBitDepths ?? [])
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (parsed.length === 0) {
    return targetBitDepth;
  }

  if (parsed.includes(targetBitDepth)) {
    return targetBitDepth;
  }

  if (targetBitDepth <= parsed[0]) {
    return parsed[0];
  }

  const last = parsed[parsed.length - 1];
  if (targetBitDepth >= last) {
    return last;
  }

  let nearest = parsed[0];
  for (const depth of parsed) {
    const currentDiff = Math.abs(depth - targetBitDepth);
    const nearestDiff = Math.abs(nearest - targetBitDepth);
    if (
      currentDiff < nearestDiff ||
      (currentDiff === nearestDiff && depth < nearest)
    ) {
      nearest = depth;
    }
  }
  return nearest;
};

export const getAudioCompressionPresetByRatio = (
  ratio: number,
  format: FormatEnum,
  sourceContext?: AudioCompressionSourceContext,
): AudioCompressionPresetResult => {
  const normalizedRatio = clampRatio(ratio);
  const codec = pickCodecBySourceAndFormat(format, sourceContext?.sourceCodec);
  const definition = AUDIO_ENCODER_DEFINITIONS[codec];
  const bitrateQualityFactor = 0.2 + normalizedRatio * 0.008;
  const sampleRateQualityFactor = 0.7 + normalizedRatio * 0.003;
  const bitDepthQualityFactor = 0.6 + normalizedRatio * 0.004;
  const sourceBitrate = toPositiveNumber(sourceContext?.sourceBitrate);
  const sourceSampleRate = toPositiveNumber(sourceContext?.sourceSampleRate);
  const sourceChannels = toPositiveNumber(sourceContext?.sourceChannels);
  const sourceBitDepth = toPositiveNumber(sourceContext?.sourceBitDepth);

  const fallbackBitrateByTier =
    normalizedRatio < 20
      ? 64
      : normalizedRatio <= 40
        ? 96
        : normalizedRatio <= 70
          ? 128
          : 256;
  const fallbackSampleRateByTier =
    normalizedRatio < 20 ? 32000 : normalizedRatio <= 70 ? 44100 : 48000;
  const fallbackBitDepthByTier = normalizedRatio > 70 ? 24 : 16;
  const fallbackChannelsByTier = normalizedRatio < 30 ? 1 : 2;

  const sourceBasedBitrate = sourceBitrate
    ? Math.round(
        Math.max(
          definition?.minBitrate ?? 32,
          sourceBitrate * bitrateQualityFactor,
        ),
      )
    : undefined;
  const sourceBasedSampleRate = sourceSampleRate
    ? Math.round(
        Math.max(
          definition?.minSampleRate ?? 8000,
          sourceSampleRate * sampleRateQualityFactor,
        ),
      )
    : undefined;
  const sourceBasedBitDepth = sourceBitDepth
    ? Math.round(Math.max(8, sourceBitDepth * bitDepthQualityFactor))
    : undefined;
  const sourceBasedChannels = sourceChannels
    ? Math.round(
        normalizedRatio < 30
          ? Math.min(sourceChannels, 1)
          : Math.min(sourceChannels, 2),
      )
    : undefined;

  const targetBitrate =
    clampByRange(
      sourceBasedBitrate ?? fallbackBitrateByTier,
      definition?.minBitrate,
      definition?.maxBitrate,
    ) ?? fallbackBitrateByTier;
  const targetSampleRate =
    clampByRange(
      sourceBasedSampleRate ?? fallbackSampleRateByTier,
      definition?.minSampleRate,
      definition?.maxSampleRate,
    ) ?? fallbackSampleRateByTier;
  const targetChannels = resolveChannels(
    definition?.allowedChannels,
    sourceBasedChannels ?? fallbackChannelsByTier,
  );
  const targetBitDepth = resolveBitDepth(
    definition?.allowedBitDepths,
    sourceBasedBitDepth ?? fallbackBitDepthByTier,
  );

  if (normalizedRatio < 20) {
    return {
      tier: "extreme_compression",
      patch: {
        ratio: normalizedRatio,
        codec,
        bitrate: targetBitrate,
        sample_rate: targetSampleRate,
        channels: targetChannels,
        bit_depth: targetBitDepth,
      },
    };
  }

  if (normalizedRatio <= 40) {
    return {
      tier: "high_compression",
      patch: {
        ratio: normalizedRatio,
        codec,
        bitrate: targetBitrate,
        sample_rate: targetSampleRate,
        channels: targetChannels,
        bit_depth: targetBitDepth,
      },
    };
  }

  if (normalizedRatio <= 70) {
    return {
      tier: "balanced",
      patch: {
        ratio: normalizedRatio,
        codec,
        bitrate: targetBitrate,
        sample_rate: targetSampleRate,
        channels: targetChannels,
        bit_depth: targetBitDepth,
      },
    };
  }

  return {
    tier: "high_quality",
    patch: {
      ratio: normalizedRatio,
      codec,
      bitrate: targetBitrate,
      sample_rate: targetSampleRate,
      channels: targetChannels,
      bit_depth: targetBitDepth,
    },
  };
};

interface TaskItemProps {
  task: CompressorTask;
  metaStatus?: "idle" | "loading" | "error";
  metaError?: string;
  onRetryMeta?: () => void;
}

interface CompressibilityAssessment {
  score: number;
  text: string;
  colorClass: string;
  recommendedFormat: FormatEnum;
}

const LOSSLESS_CODECS = new Set([
  "flac",
  "alac",
  "ape",
  "pcm_s16le",
  "pcm_s24le",
  "pcm_s32le",
  "pcm_s16be",
  "pcm_s24be",
  "pcm_s32be",
  "pcm_f32le",
  "pcm_f64le",
  "wavpack",
]);

const SOURCE_CODEC_TO_ENCODER: Partial<Record<string, AudioEncoderEnum>> = {
  mp3: AudioEncoderEnum.MP3,
  opus: AudioEncoderEnum.OPUS,
  vorbis: AudioEncoderEnum.VORBIS,
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const clampScore = (score: number) =>
  Math.max(0, Math.min(100, Math.round(score)));

const pickBestCompressionFormat = (
  score: number,
  originalExtension?: string,
): FormatEnum => {
  const original = (originalExtension ?? "").toLowerCase();
  if (score >= 75) return FormatEnum.OGG;
  if (score >= 55) return FormatEnum.M4A;
  if (
    [FormatEnum.MP3, FormatEnum.M4A, FormatEnum.OGG, FormatEnum.AAC].includes(
      original as FormatEnum,
    )
  ) {
    return original as FormatEnum;
  }
  return FormatEnum.M4A;
};

const assessCompressibility = (details: any): CompressibilityAssessment => {
  const stream = details?.streams?.find((s: any) => s.codec_type === "audio");
  const codecName = String(stream?.codec_name ?? "").toLowerCase();
  const bitrateBps =
    toNumber(stream?.bit_rate) ?? toNumber(details?.bit_rate) ?? 0;
  const bitrateKbps = bitrateBps > 0 ? bitrateBps / 1000 : 0;
  const sampleRate = toNumber(stream?.sample_rate) ?? 0;
  const bitDepth =
    toNumber(stream?.bit_depth) ?? toNumber(stream?.bits_per_sample) ?? 0;
  const channels = toNumber(stream?.channels) ?? 0;

  let score = 20;

  if (LOSSLESS_CODECS.has(codecName)) score += 32;
  if (bitrateKbps >= 320) score += 28;
  else if (bitrateKbps >= 256) score += 22;
  else if (bitrateKbps >= 192) score += 16;
  else if (bitrateKbps >= 128) score += 9;
  else if (bitrateKbps > 0) score += 3;

  if (sampleRate >= 96000) score += 10;
  else if (sampleRate >= 48000) score += 7;
  else if (sampleRate >= 44100) score += 5;
  else if (sampleRate > 0) score += 2;

  if (bitDepth >= 24) score += 10;
  else if (bitDepth >= 16) score += 6;

  if (channels > 2) score += 8;
  else if (channels === 2) score += 4;

  if (
    ["aac", "opus", "vorbis", "mp3"].includes(codecName) &&
    bitrateKbps > 0 &&
    bitrateKbps <= 128
  ) {
    score -= 14;
  } else if (
    ["aac", "opus", "vorbis", "mp3"].includes(codecName) &&
    bitrateKbps > 0 &&
    bitrateKbps <= 192
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

type BuildAudioArgsOverrides = Partial<
  Pick<CompressAudioTaskArgs, "format" | "codec">
>;

export const buildDefaultAudioArgs = (
  task: CompressorTask,
  details: MediaDetailsWithResolve,
  overrides?: BuildAudioArgsOverrides,
): CompressAudioTaskArgs => {
  const taskId = task.id;
  const taskArgs = task.args as CompressAudioTaskArgs;
  const path = taskArgs.input_path;
  const assessment = assessCompressibility(details);
  const ratio = typeof taskArgs.ratio === "number" ? taskArgs.ratio : 50;
  const audioStream = details?.streams?.find(
    (stream) => stream.codec_type === "audio",
  );
  const sourceFormat = details?.format as FormatEnum;
  const shouldInitFromSource = !task.mediaDetails;
  const taskFormat = (overrides?.format ?? taskArgs.format) as FormatEnum;
  const sourceFormatSupported = Boolean(
    sourceFormat && AUDIO_CONTAINER_DEFINITIONS[sourceFormat],
  );
  const taskFormatSupported = Boolean(
    taskFormat && AUDIO_CONTAINER_DEFINITIONS[taskFormat],
  );
  const format =
    shouldInitFromSource && sourceFormatSupported
      ? sourceFormat
      : taskFormatSupported
        ? taskFormat
        : sourceFormatSupported
          ? sourceFormat
          : assessment.recommendedFormat;
  const sourceCodecName = String(audioStream?.codec_name ?? "").toLowerCase();
  const sourceCodec =
    SOURCE_CODEC_TO_ENCODER[sourceCodecName] ?? sourceCodecName;
  const nextCodec = (overrides?.codec ?? taskArgs.codec) as
    | AudioEncoderEnum
    | undefined;
  const audioBitrateKbps = toNumber(audioStream?.bit_rate);
  const isUsingSourceFormat = sourceFormatSupported && format === sourceFormat;
  const presetContext = isUsingSourceFormat
    ? {
        sourceCodec: nextCodec ?? sourceCodec,
        sourceBitrate: audioBitrateKbps ? audioBitrateKbps / 1000 : undefined,
        sourceSampleRate: toNumber(audioStream?.sample_rate),
        sourceChannels: toNumber(audioStream?.channels),
        sourceBitDepth:
          toNumber(audioStream?.bit_depth) ??
          toNumber(audioStream?.bits_per_sample),
      }
    : nextCodec
      ? {
          sourceCodec: nextCodec,
        }
      : undefined;
  const presetResult = presetContext
    ? getAudioCompressionPresetByRatio(ratio, format, presetContext)
    : getAudioCompressionPresetByRatio(ratio, format);
  const allowedEncoders =
    AUDIO_CONTAINER_DEFINITIONS[format]?.allowedEncoders ?? [];
  const isSourceCodecAllowed = allowedEncoders.includes(
    sourceCodec as AudioEncoderEnum,
  );
  const isNextCodecAllowed = allowedEncoders.includes(
    nextCodec as AudioEncoderEnum,
  );
  const presetCodec = presetResult.patch.codec as AudioEncoderEnum | undefined;
  const isPresetCodecAllowed = allowedEncoders.includes(
    presetCodec as AudioEncoderEnum,
  );

  const outputArgs: CompressAudioTaskArgs = {
    ...taskArgs,
    ...presetResult.patch,
    task_id: taskId,
    format,
    input_path: path,
    ratio,
    output_path: taskArgs.output_path ?? "",
  };
  outputArgs.codec =
    (isNextCodecAllowed ? nextCodec : undefined) ||
    (shouldInitFromSource && isSourceCodecAllowed
      ? (sourceCodec as AudioEncoderEnum)
      : undefined) ||
    (isPresetCodecAllowed ? presetCodec : undefined) ||
    allowedEncoders[0] ||
    outputArgs.codec;

  return outputArgs;
};
