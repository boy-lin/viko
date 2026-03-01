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

const clampRatio = (ratio: number) => {
  if (Number.isNaN(ratio)) return 50;
  return Math.max(0, Math.min(100, Math.round(ratio)));
};

const pickSupportedAudioEncoder = (
  format: FormatEnum | undefined,
  preferred: AudioEncoderEnum[]
) => {
  const allowed = format
    ? AUDIO_CONTAINER_DEFINITIONS[format]?.allowedEncoders
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
  return AudioEncoderEnum.MP3;
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
  format: FormatEnum
): AudioCompressionPresetResult => {
  const normalizedRatio = clampRatio(ratio);
  const codec = pickSupportedAudioEncoder(format, [
    AudioEncoderEnum.OPUS,
    AudioEncoderEnum.AAC,
    AudioEncoderEnum.VORBIS,
    AudioEncoderEnum.MP3,
  ]);
  const definition = AUDIO_ENCODER_DEFINITIONS[codec]

  if (normalizedRatio < 20) {
    return {
      tier: "extreme_compression",
      patch: {
        ratio: 20,
        codec,
        bitrate: Math.min(64, definition?.maxBitrate ?? 64),
        sample_rate: Math.min(32000, definition?.maxSampleRate ?? 32000),
        channels: resolveChannels(definition?.allowedChannels, 1),
        bit_depth: resolveBitDepth(definition?.allowedBitDepths, 16),
      },
    };
  }

  if (normalizedRatio <= 40) {
    return {
      tier: "high_compression",
      patch: {
        ratio: normalizedRatio,
        codec,
        bitrate: Math.min(96, definition?.maxBitrate ?? 96),
        sample_rate: Math.min(44100, definition?.maxSampleRate ?? 44100),
        channels: resolveChannels(definition?.allowedChannels, 2),
        bit_depth: resolveBitDepth(definition?.allowedBitDepths, 16),
      },
    };
  }

  if (normalizedRatio <= 70) {
    return {
      tier: "balanced",
      patch: {
        ratio: normalizedRatio,
        codec,
        bitrate: Math.min(128, definition?.maxBitrate ?? 128),
        sample_rate: Math.min(44100, definition?.maxSampleRate ?? 44100),
        channels: resolveChannels(definition?.allowedChannels, 2),
        bit_depth: resolveBitDepth(definition?.allowedBitDepths, 16),
      },
    };
  }

  return {
    tier: "high_quality",
    patch: {
      ratio: normalizedRatio,
      codec,
      bitrate: Math.min(192, definition?.maxBitrate ?? 192),
      sample_rate: Math.min(48000, definition?.maxSampleRate ?? 48000),
      channels: resolveChannels(definition?.allowedChannels, 2),
      bit_depth: resolveBitDepth(definition?.allowedBitDepths, 24),
    },
  };
};
