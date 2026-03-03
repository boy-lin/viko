import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import { FileType, MediaDetailsWithResolve, MediaTaskType } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useTranslation } from "react-i18next";
import { CompressionSettingsDialog } from "./SettingsDialog";
import { CompressingTask, useCompressorStore } from "./store";
import { VIDEO_CONTAINER_DEFINITIONS } from "@/data/capabilities";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { formatFileSize } from "@/lib/file";
import { getVideoCompressionPresetByRatio } from "./compressionPreset";
import { extractFilenameFromPath, formatBitrate } from "@/lib/utils";
import { toast } from "sonner";
import { FormatEnum, VideoEncoderEnum } from "@/types/options";

interface TaskItemProps {
  task: CompressingTask;
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

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

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

const pickBestCompressionFormat = (score: number, originalExtension?: string): FormatEnum => {
  const original = (originalExtension ?? "").toLowerCase();
  if (score >= 80) return FormatEnum.WEBM;
  if (score >= 60) return FormatEnum.MP4;
  if ([FormatEnum.MP4, FormatEnum.MKV, FormatEnum.MOV, FormatEnum.WEBM].includes(original as FormatEnum)) {
    return original as FormatEnum;
  }
  return FormatEnum.MP4;
};

const assessCompressibility = (details: any): CompressibilityAssessment => {
  const stream = details?.streams?.find((s: any) => s.codec_type === "video");
  const codecName = String(stream?.codec_name ?? "").toLowerCase();
  const bitrateBps = toNumber(stream?.bit_rate) ?? toNumber(details?.bit_rate) ?? 0;
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

  if (HIGH_EFFICIENCY_CODECS.has(codecName) && bitrateKbps > 0 && bitrateKbps <= 3500) {
    score -= 14;
  } else if (HIGH_EFFICIENCY_CODECS.has(codecName) && bitrateKbps > 0 && bitrateKbps <= 5500) {
    score -= 8;
  }

  const normalizedScore = clampScore(score);
  const recommendedFormat = pickBestCompressionFormat(normalizedScore, details?.extension);

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
  task: CompressingTask,
  details: MediaDetailsWithResolve,
): Partial<CompressingTask> => {
  const title = details.title || extractFilenameFromPath(details.path);
  const taskId = task.id;
  const path = task.args.input_path;
  const assessment = assessCompressibility(details);
  const ratio = typeof task.args.ratio === "number" ? task.args.ratio : 20;
  const currentArgs = task.args as CompressVideoTaskArgs;
  const sourceFormat = (details.format as FormatEnum) || (details.extension as FormatEnum);
  const sourceFormatSupported = Boolean(sourceFormat && VIDEO_CONTAINER_DEFINITIONS[sourceFormat]);
  const currentFormat = sourceFormatSupported
    ? sourceFormat
    : (currentArgs.format || assessment.recommendedFormat);
  const firstVideoStream = details?.streams?.find((s: any) => s.codec_type === "video");
  const sourceCodecName = String(firstVideoStream?.codec_name ?? "").toLowerCase();
  const sourceCodec = SOURCE_CODEC_TO_ENCODER[sourceCodecName] ?? (sourceCodecName as VideoEncoderEnum);
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
    source_video_bitrate: sourceVideoBitrateKbps,
    source_frame_rate: sourceFrameRate,
    source_keyframe_interval: sourceKeyframeInterval,
    source_audio_tracks: initialAudioTracks,
  };
  const containerDefinition = VIDEO_CONTAINER_DEFINITIONS[outputArgs.format as FormatEnum];
  const resolvedSourceCodec = containerDefinition?.video?.allowedEncoders?.includes(sourceCodec as VideoEncoderEnum)
    ? (sourceCodec as VideoEncoderEnum)
    : undefined;
  const resolvedPresetCodec = containerDefinition?.video?.allowedEncoders?.includes(ratioPreset.patch.codec as VideoEncoderEnum)
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

export default function TaskItem({
  task,
  metaStatus,
  metaError,
  onRetryMeta,
}: TaskItemProps) {
  const { t } = useTranslation("converter");
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);

  const loading = metaStatus === "loading" || (!task.mediaDetails && metaStatus !== "error");

  const handleConvertSingle = async () => {
    try {
      await useCompressorStore.getState().pushTasksToQueue([task]);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return <TaskLoadingCard />;
  }

  const isQueuedOrProcessing = task.status === "queued" || task.status === "processing";

  const handleDeleteOrCancel = async () => {
    if (isQueuedOrProcessing) {
      await getMediaTaskQueue().cancelTaskById(task.id);
      updateTaskById(task.id, {
        status: "idle",
        progress: 0,
        errorMessage: undefined,
      });
      return;
    }
    useCompressorStore.getState().removeTask(task.id);
  };

  if (metaStatus === "error") {
    return (
      <TaskLoadErrorCard
        loadError={metaError || "Failed to load media details"}
        onRemove={handleDeleteOrCancel}
        onRetry={onRetryMeta}
      />
    );
  }

  const taskArgs = task.args as CompressVideoTaskArgs;
  const firstVideoStream = task.mediaDetails?.streams.find((s: any) => s.codec_type === "video");
  const compressibility = assessCompressibility(task.mediaDetails);
  const originalInfoParts = [
    task.mediaDetails?.extension?.toUpperCase?.(),
    firstVideoStream?.codec_name?.toUpperCase?.(),
    formatFileSize(task.mediaDetails?.size),
    formatBitrate(firstVideoStream?.bit_rate),
  ];
  const targetInfoParts = [
    taskArgs.format?.toUpperCase?.(),
    taskArgs.codec?.toUpperCase?.(),
    "-",
    formatBitrate(taskArgs.bitrate, 1),
  ];

  const outputTitleValue = useMemo(
    () => task.outputTitle ?? task.mediaDetails?.title ?? "",
    [task.outputTitle, task.mediaDetails?.title],
  );

  const handleOutputTitleChange = (nextTitle: string) => {
    if (!task.mediaDetails?.path) {
      return;
    }
    updateTaskById(task.id, {
      outputTitle: nextTitle,
    });
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-border shadow-sm">
      <div className="flex flex-col items-start gap-2 flex-shrink-0 relative">
        <div className="w-20 h-20 rounded-lg overflow-hidden">
          <MediaThumbnail
            path={task.mediaDetails?.path}
            title={task.mediaDetails?.title}
            fileType={task.fileType}
            className="w-full h-full"
          />
        </div>
        <span className={`absolute top-1 right-0 w-full text-xs text-center font-medium ${compressibility.colorClass}`}>
          {compressibility.text}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <EllipsisName name={task.mediaDetails?.title} className="text-base font-semibold text-foreground" />
        </div>
        <div className="grid grid-cols-2 mt-2 text-sm text-muted-foreground">
          {originalInfoParts.map((p, idx) => (
            <span key={idx}>{p || "-"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TaskStatusLabel task={task} />
      </div>

      <div className="flex-1 min-w-0">
        <OutputTitleEditor value={outputTitleValue} onChange={handleOutputTitleChange} />
        <div className="grid grid-cols-2 mt-1 text-sm text-muted-foreground">
          {targetInfoParts.map((p, idx) => (
            <span key={idx}>{p || "auto"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <CompressionSettingsDialog
          config={taskArgs}
          onConfigChange={async (config) => {
            updateTaskById(task.id, {
              args: {
                ...taskArgs,
                ...config,
              },
            });
          }}
          onSave={(config) => {
            updateTaskById(task.id, {
              args: {
                ...taskArgs,
                ...config,
              },
            });
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleDeleteOrCancel}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isQueuedOrProcessing ? t("actions.cancel", "取消") : t("actions.delete")}</TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          onClick={handleConvertSingle}
          disabled={loading || isQueuedOrProcessing}
        >
          {t("actions.compressSingle", "压缩")}
        </Button>
      </div>
    </div>
  );
}
