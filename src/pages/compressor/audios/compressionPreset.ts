import { CompressAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import { AUDIO_CONTAINER_DEFINITIONS, AUDIO_ENCODER_DEFINITIONS } from "@/data/capabilities";

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
  const allowed = AUDIO_CONTAINER_DEFINITIONS[format]?.allowedEncoders || []
  const normalizedSourceCodec = String(sourceCodec ?? "").toLowerCase() as AudioEncoderEnum;
  if (normalizedSourceCodec && allowed.includes(normalizedSourceCodec)) {
    return normalizedSourceCodec;
  }
  if (allowed.length > 0) return allowed[0];
  return AudioEncoderEnum.AAC;
};
const resolveChannels = (
  allowedChannels: string[] | undefined,
  targetChannels: number
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
    if (currentDiff < nearestDiff || (currentDiff === nearestDiff && channel < nearest)) {
      nearest = channel;
    }
  }
  return nearest;
};

const resolveBitDepth = (
  allowedBitDepths: number[] | undefined,
  targetBitDepth: number
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
    if (currentDiff < nearestDiff || (currentDiff === nearestDiff && depth < nearest)) {
      nearest = depth;
    }
  }
  return nearest;
};

export const getAudioCompressionPresetByRatio = (
  ratio: number,
  format: FormatEnum,
  sourceContext?: AudioCompressionSourceContext
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

  const fallbackBitrateByTier = normalizedRatio < 20 ? 64 : normalizedRatio <= 40 ? 96 : normalizedRatio <= 70 ? 128 : 256;
  const fallbackSampleRateByTier = normalizedRatio < 20 ? 32000 : normalizedRatio <= 70 ? 44100 : 48000;
  const fallbackBitDepthByTier = normalizedRatio > 70 ? 24 : 16;
  const fallbackChannelsByTier = normalizedRatio < 30 ? 1 : 2;

  const sourceBasedBitrate = sourceBitrate
    ? Math.round(Math.max(definition?.minBitrate ?? 32, sourceBitrate * bitrateQualityFactor))
    : undefined;
  const sourceBasedSampleRate = sourceSampleRate
    ? Math.round(Math.max(definition?.minSampleRate ?? 8000, sourceSampleRate * sampleRateQualityFactor))
    : undefined;
  const sourceBasedBitDepth = sourceBitDepth
    ? Math.round(Math.max(8, sourceBitDepth * bitDepthQualityFactor))
    : undefined;
  const sourceBasedChannels = sourceChannels
    ? Math.round(normalizedRatio < 30 ? Math.min(sourceChannels, 1) : Math.min(sourceChannels, 2))
    : undefined;

  const targetBitrate = clampByRange(
    sourceBasedBitrate ?? fallbackBitrateByTier,
    definition?.minBitrate,
    definition?.maxBitrate
  ) ?? fallbackBitrateByTier;
  const targetSampleRate = clampByRange(
    sourceBasedSampleRate ?? fallbackSampleRateByTier,
    definition?.minSampleRate,
    definition?.maxSampleRate
  ) ?? fallbackSampleRateByTier;
  const targetChannels = resolveChannels(
    definition?.allowedChannels,
    sourceBasedChannels ?? fallbackChannelsByTier
  );
  const targetBitDepth = resolveBitDepth(
    definition?.allowedBitDepths,
    sourceBasedBitDepth ?? fallbackBitDepthByTier
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
