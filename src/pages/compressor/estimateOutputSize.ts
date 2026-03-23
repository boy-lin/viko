import { formatFileSize } from "@/lib/file";
import {
  AudioTrackConfig,
  CompressAudioTaskArgs,
  CompressImageTaskArgs,
  CompressVideoTaskArgs,
} from "@/lib/mediaTaskEvent";
import { MediaDetailsWithResolve } from "@/types/tasks";

type EstimateResult = {
  bytes: number;
  approximate: boolean;
};

const APPROXIMATE_AUDIO_CODECS = new Set(["aac", "opus", "vorbis"]);

const toKbps = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
};

const sumTrackBitrates = (tracks?: AudioTrackConfig[]) =>
  (tracks ?? []).reduce((sum, track) => sum + toKbps(track.bitrate), 0);

const formatEstimate = (estimate: EstimateResult | null) => {
  if (!estimate) return null;
  return `${estimate.approximate ? "~" : ""}${formatFileSize(estimate.bytes)}`;
};

const estimateFromDurationAndBitrate = (
  durationSeconds: number,
  totalBitrateKbps: number,
  approximate: boolean,
) => {
  if (!(durationSeconds > 0) || !(totalBitrateKbps > 0)) return null;
  return {
    bytes: Math.max(1, Math.round((durationSeconds * totalBitrateKbps * 1000) / 8)),
    approximate,
  } satisfies EstimateResult;
};

const estimateFromRatio = (sourceSizeBytes?: number, ratioPercent?: number) => {
  if (
    typeof sourceSizeBytes !== "number" ||
    !Number.isFinite(sourceSizeBytes) ||
    sourceSizeBytes <= 0 ||
    typeof ratioPercent !== "number" ||
    !Number.isFinite(ratioPercent) ||
    ratioPercent <= 0
  ) {
    return null;
  }

  return {
    bytes: Math.max(1, Math.round(sourceSizeBytes * (ratioPercent / 100))),
    approximate: true,
  } satisfies EstimateResult;
};

export const getAudioEstimatedOutputSizeLabel = (
  config: CompressAudioTaskArgs,
  mediaDetails?: MediaDetailsWithResolve,
) => {
  const duration = mediaDetails?.duration ?? 0;
  const sourceSize = mediaDetails?.size;
  const codec = String(config.codec ?? "").toLowerCase();
  const exactEstimate = estimateFromDurationAndBitrate(
    duration,
    toKbps(config.bitrate),
    APPROXIMATE_AUDIO_CODECS.has(codec),
  );

  return formatEstimate(exactEstimate ?? estimateFromRatio(sourceSize, config.ratio));
};

export const getImageEstimatedOutputSizeLabel = (
  config: CompressImageTaskArgs,
  mediaDetails?: MediaDetailsWithResolve,
) => formatEstimate(estimateFromRatio(mediaDetails?.size, config.ratio ?? config.quality));

export const getVideoEstimatedOutputSizeLabel = (
  config: CompressVideoTaskArgs,
  mediaDetails?: MediaDetailsWithResolve,
) => {
  const duration = mediaDetails?.duration ?? 0;
  const sourceSize = mediaDetails?.size;
  const videoBitrate = toKbps(config.bitrate);
  const audioBitrate = config.remove_audio
    ? 0
    : sumTrackBitrates(config.audio_tracks) || sumTrackBitrates(config.source_audio_tracks);
  const totalBitrate = videoBitrate + audioBitrate;

  const hasPredictableAudio = config.remove_audio || audioBitrate > 0;
  const isExactEnough = config.rc_mode === "cbr" && videoBitrate > 0 && hasPredictableAudio;
  const bitrateEstimate = estimateFromDurationAndBitrate(
    duration,
    totalBitrate,
    !isExactEnough,
  );

  return formatEstimate(bitrateEstimate ?? estimateFromRatio(sourceSize, config.ratio));
};
