import { formatToDefinition } from "@/data/capabilities";
import { CompressAudioTaskArgs } from "@/lib/bridge";
import { EncoderEnum } from "@/types/options";

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
  format: string | undefined,
  preferred: string[]
) => {
  const allowed = format
    ? formatToDefinition.get(format)?.audio?.allowedEncoders
    : undefined;

  if (allowed && allowed.length > 0) {
    for (const codec of preferred) {
      if (allowed.includes(codec as EncoderEnum)) return codec;
    }
    return allowed[0];
  }

  for (const codec of preferred) {
    if (codec) return codec;
  }
  return EncoderEnum.MP3;
};

export const getAudioCompressionPresetByRatio = (
  ratio: number,
  format: string
): AudioCompressionPresetResult => {
  const normalizedRatio = clampRatio(ratio);

  if (normalizedRatio < 20) {
    return {
      tier: "extreme_compression",
      patch: {
        ratio: 20,
        codec: pickSupportedAudioEncoder(format, [
          EncoderEnum.OPUS,
          EncoderEnum.AAC,
          EncoderEnum.VORBIS,
          EncoderEnum.MP3,
        ]),
        bitrate: 64,
        sample_rate: 32000,
        channels: 1,
        bit_depth: 16,
      },
    };
  }

  if (normalizedRatio <= 40) {
    return {
      tier: "high_compression",
      patch: {
        ratio: normalizedRatio,
        codec: pickSupportedAudioEncoder(format, [
          EncoderEnum.OPUS,
          EncoderEnum.AAC,
          EncoderEnum.MP3,
          EncoderEnum.VORBIS,
        ]),
        bitrate: 96,
        sample_rate: 44100,
        channels: 2,
        bit_depth: 16,
      },
    };
  }

  if (normalizedRatio <= 70) {
    return {
      tier: "balanced",
      patch: {
        ratio: normalizedRatio,
        codec: pickSupportedAudioEncoder(format, [
          EncoderEnum.AAC,
          EncoderEnum.OPUS,
          EncoderEnum.MP3,
          EncoderEnum.VORBIS,
        ]),
        bitrate: 128,
        sample_rate: 44100,
        channels: 2,
        bit_depth: 16,
      },
    };
  }

  return {
    tier: "high_quality",
    patch: {
      ratio: normalizedRatio,
      codec: pickSupportedAudioEncoder(format, [
        EncoderEnum.AAC,
        EncoderEnum.OPUS,
        EncoderEnum.FLAC,
        EncoderEnum.MP3,
      ]),
      bitrate: 192,
      sample_rate: 48000,
      channels: 2,
      bit_depth: 24,
    },
  };
};

