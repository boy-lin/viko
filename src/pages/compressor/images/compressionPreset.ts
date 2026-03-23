import { CompressImageTaskArgs } from "@/lib/mediaTaskEvent";
import { MediaDetailsWithResolve } from "@/types/tasks";
import { CompressorTask } from "../store";
import { useSettingsStore } from "@/stores/settingsStore";
import { extractFilenameFromPath } from "@/lib/utils";

export type ImageCompressionTier =
  | "extreme_compression"
  | "high_compression"
  | "balanced"
  | "high_quality";

export interface ImageCompressionPresetResult {
  tier: ImageCompressionTier;
  patch: Partial<CompressImageTaskArgs>;
}

export interface ImageCompressionSourceContext {
  sourceQuality?: number;
  sourceDpi?: number;
  sourceColorMode?: string;
  sourceKeepTransparency?: boolean;
  sourceStripMetadata?: boolean;
  sourceCropWhitespace?: boolean;
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

const supportsTransparency = (format?: string) => {
  if (!format) return true;
  const normalized = format.toLowerCase();
  return ["png", "webp", "avif", "gif", "tiff", "ico"].includes(normalized);
};

export const getImageCompressionPresetByRatio = (
  ratio: number,
  format?: string,
  sourceContext?: ImageCompressionSourceContext,
): ImageCompressionPresetResult => {
  const normalizedRatio = clampRatio(ratio);
  const qualityFactor = 0.2 + normalizedRatio * 0.008;
  const dpiFactor = 0.5 + normalizedRatio * 0.006;
  const canKeepTransparency = supportsTransparency(format);
  const sourceQuality = toPositiveNumber(sourceContext?.sourceQuality);
  const sourceDpi = toPositiveNumber(sourceContext?.sourceDpi);
  const sourceColorMode = String(
    sourceContext?.sourceColorMode ?? "",
  ).toUpperCase();

  const fallbackQualityByTier =
    normalizedRatio < 20
      ? 20
      : normalizedRatio <= 40
        ? 40
        : normalizedRatio <= 70
          ? 70
          : 90;
  const fallbackDpiByTier =
    normalizedRatio < 20
      ? 72
      : normalizedRatio <= 40
        ? 96
        : normalizedRatio <= 70
          ? 150
          : 300;
  const sourceBasedQuality = sourceQuality
    ? Math.round(Math.max(1, sourceQuality * qualityFactor))
    : undefined;
  const sourceBasedDpi = sourceDpi
    ? Math.round(Math.max(72, sourceDpi * dpiFactor))
    : undefined;
  const targetQuality =
    clampByRange(sourceBasedQuality ?? fallbackQualityByTier, 1, 100) ??
    fallbackQualityByTier;
  const targetDpi =
    clampByRange(sourceBasedDpi ?? fallbackDpiByTier, 72, 600) ??
    fallbackDpiByTier;
  const targetColorMode = sourceColorMode
    ? sourceColorMode
    : normalizedRatio < 25
      ? "Gray"
      : "RGB";
  const targetStripMetadata =
    sourceContext?.sourceStripMetadata ?? normalizedRatio < 75;
  const targetCropWhitespace =
    sourceContext?.sourceCropWhitespace ?? normalizedRatio <= 40;
  const targetKeepTransparency = canKeepTransparency
    ? (sourceContext?.sourceKeepTransparency ?? normalizedRatio > 35)
    : false;

  if (normalizedRatio < 20) {
    return {
      tier: "extreme_compression",
      patch: {
        ratio: normalizedRatio,
        quality: targetQuality,
        color_mode: targetColorMode === "GRAY" ? "Gray" : targetColorMode,
        dpi: targetDpi,
        strip_metadata: targetStripMetadata,
        keep_transparency: targetKeepTransparency,
        crop_whitespace: targetCropWhitespace,
      },
    };
  }

  if (normalizedRatio <= 40) {
    return {
      tier: "high_compression",
      patch: {
        ratio: normalizedRatio,
        quality: targetQuality,
        color_mode: targetColorMode === "GRAY" ? "Gray" : targetColorMode,
        dpi: targetDpi,
        strip_metadata: targetStripMetadata,
        keep_transparency: targetKeepTransparency,
        crop_whitespace: targetCropWhitespace,
      },
    };
  }

  if (normalizedRatio <= 70) {
    return {
      tier: "balanced",
      patch: {
        ratio: normalizedRatio,
        quality: targetQuality,
        color_mode: targetColorMode,
        dpi: targetDpi,
        strip_metadata: targetStripMetadata,
        keep_transparency: targetKeepTransparency,
        crop_whitespace: targetCropWhitespace,
      },
    };
  }

  return {
    tier: "high_quality",
    patch: {
      ratio: normalizedRatio,
      quality: targetQuality,
      color_mode: targetColorMode,
      dpi: targetDpi,
      strip_metadata: targetStripMetadata,
      keep_transparency: targetKeepTransparency,
      crop_whitespace: targetCropWhitespace,
    },
  };
};

const parseDpiFromTags = (tags?: Record<string, string>) => {
  if (!tags) return undefined;
  const dpiX = Number.parseFloat(tags.dpi_x ?? "");
  const dpiY = Number.parseFloat(tags.dpi_y ?? "");
  if (!Number.isFinite(dpiX) && !Number.isFinite(dpiY)) return undefined;
  const primary = Number.isFinite(dpiX) ? dpiX : dpiY;
  return primary && Number.isFinite(primary) ? Math.round(primary) : undefined;
};

const inferImageColorMode = (mediaDetails: MediaDetailsWithResolve) => {
  const stream = mediaDetails.streams[0] as
    | ((typeof mediaDetails.streams)[number] & { pix_fmt?: string })
    | undefined;
  const pixFmt = (stream?.pix_fmt || "").toLowerCase();
  if (pixFmt.includes("gray") || pixFmt.includes("ya")) return "Gray";
  if (
    pixFmt.includes("rgba") ||
    pixFmt.includes("argb") ||
    pixFmt.includes("bgra")
  )
    return "RGBA";
  if (pixFmt.includes("cmyk")) return "CMYK";
  if (pixFmt.includes("rgb")) return "RGB";

  const streamTags = mediaDetails.stream_tags?.[0];
  const tagColorMode = (
    streamTags?.color_mode ||
    streamTags?.colormode ||
    mediaDetails.tags?.color_mode ||
    mediaDetails.tags?.colormode
  )?.trim();
  return tagColorMode || undefined;
};

const parseImageQuality = (mediaDetails: MediaDetailsWithResolve) => {
  const candidates = [
    mediaDetails.tags?.quality,
    mediaDetails.tags?.["exif.JPEGInterchangeFormatLength"],
  ];
  for (const candidate of candidates) {
    const parsed = Number.parseInt(candidate ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
      return parsed;
    }
  }
  return undefined;
};

export const buildDefaultImageArgs = (
  task: CompressorTask,
  mediaDetails: MediaDetailsWithResolve,
): CompressImageTaskArgs => {
  const taskId = task.id;
  const taskArgs = task.args as CompressImageTaskArgs;
  const path = taskArgs.input_path;
  const mediaTitle =
    task.outputTitle ||
    mediaDetails?.title ||
    extractFilenameFromPath(path) ||
    "output";
  const outputDir = useSettingsStore.getState().getOutputDir(path);
  const format = taskArgs.format || mediaDetails?.extension || "jpg";
  const ratio = typeof taskArgs.ratio === "number" ? taskArgs.ratio : 50;
  const presetResult = getImageCompressionPresetByRatio(ratio, format);
  const primaryStream = mediaDetails.streams[0];
  const outputArgs: CompressImageTaskArgs = {
    ...taskArgs,
    ...presetResult.patch,
    task_id: taskId,
    format,
    input_path: path,
    ratio,
    output_path: taskArgs.output_path ?? "",
    width: taskArgs.width ?? primaryStream?.width,
    height: taskArgs.height ?? primaryStream?.height,
    quality:
      taskArgs.quality ??
      parseImageQuality(mediaDetails) ??
      presetResult.patch.quality,
    color_mode:
      taskArgs.color_mode ??
      inferImageColorMode(mediaDetails) ??
      presetResult.patch.color_mode,
    dpi:
      taskArgs.dpi ??
      parseDpiFromTags(mediaDetails.tags) ??
      presetResult.patch.dpi,
    frame_rate: primaryStream?.frame_rate?.toString(),
  };
  outputArgs.output_path = `${outputDir}/${mediaTitle}.${outputArgs.format ?? format}`;

  return outputArgs;
};
