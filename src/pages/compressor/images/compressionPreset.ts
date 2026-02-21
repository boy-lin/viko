import { CompressImageTaskArgs } from "@/lib/mediaTaskEvent";

export type ImageCompressionTier =
  | "extreme_compression"
  | "high_compression"
  | "balanced"
  | "high_quality";

export interface ImageCompressionPresetResult {
  tier: ImageCompressionTier;
  patch: Partial<CompressImageTaskArgs>;
}

const clampQuality = (quality: number) => {
  if (Number.isNaN(quality)) return 80;
  return Math.max(0, Math.min(100, Math.round(quality)));
};

const supportsTransparency = (format?: string) => {
  if (!format) return true;
  const normalized = format.toLowerCase();
  return ["png", "webp", "avif", "gif", "tiff", "ico"].includes(normalized);
};

export const getImageCompressionPresetByQuality = (
  quality: number,
  format?: string
): ImageCompressionPresetResult => {
  const normalizedQuality = clampQuality(quality);
  const canKeepTransparency = supportsTransparency(format);

  if (normalizedQuality < 20) {
    return {
      tier: "extreme_compression",
      patch: {
        quality: 20,
        color_mode: "Gray",
        dpi: 72,
        strip_metadata: true,
        keep_transparency: false,
        crop_whitespace: true,
      },
    };
  }

  if (normalizedQuality <= 40) {
    return {
      tier: "high_compression",
      patch: {
        quality: normalizedQuality,
        color_mode: "RGB",
        dpi: 72,
        strip_metadata: true,
        keep_transparency: false,
        crop_whitespace: true,
      },
    };
  }

  if (normalizedQuality <= 70) {
    return {
      tier: "balanced",
      patch: {
        quality: normalizedQuality,
        color_mode: "RGB",
        dpi: 96,
        strip_metadata: true,
        keep_transparency: canKeepTransparency,
        crop_whitespace: false,
      },
    };
  }

  return {
    tier: "high_quality",
    patch: {
      quality: normalizedQuality,
      color_mode: "RGB",
      dpi: 150,
      strip_metadata: false,
      keep_transparency: canKeepTransparency,
      crop_whitespace: false,
    },
  };
};
