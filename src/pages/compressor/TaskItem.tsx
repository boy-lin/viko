import { startTransition, useMemo } from "react";
import { ArrowBigRight, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { formatFileSize } from "@/lib/file";
import {
  CompressAudioTaskArgs,
  CompressImageTaskArgs,
  CompressVideoTaskArgs,
} from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { formatBitrate } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import { FileType, MediaDetailsWithResolve } from "@/types/tasks";

import {
  buildDefaultAudioArgs,
} from "./audios/compressionPreset";
import {
  getAudioEstimatedOutputSizeLabel,
  getImageEstimatedOutputSizeLabel,
  getVideoEstimatedOutputSizeLabel,
} from "./estimateOutputSize";
import {
  CompressionSettingsDialog as AudioCompressionSettingsDialog,
} from "./audios/SettingsDialog";
import {
  CompressionSettingsDialog as ImageCompressionSettingsDialog,
} from "./images/SettingsDialog";
import { CompressionSettingsDialog as VideoCompressionSettingsDialog } from "./videos/SettingsDialog";
import { CompressorTask, CompressorTaskArgs, useCompressorStore } from "./store";

interface CompressorTaskItemProps {
  task: CompressorTask;
  metaStatus?: "idle" | "loading" | "error";
  metaError?: string;
  onRetryMeta?: () => void;
}

interface CompressibilityAssessment {
  text: string;
  colorClass: string;
}

const LOSSLESS_AUDIO_CODECS = new Set([
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

const HIGH_EFFICIENCY_VIDEO_CODECS = new Set(["hevc", "h265", "av1", "vp9"]);
const INEFFICIENT_VIDEO_CODECS = new Set([
  "mpeg2video",
  "mpeg4",
  "h263",
  "h261",
  "wmv1",
  "wmv2",
  "wmv3",
]);
const INTRA_OR_LOSSLESS_VIDEO_CODECS = new Set([
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

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

const toAssessment = (score: number): CompressibilityAssessment => {
  if (score >= 80) {
    return {
      text: "压缩潜力极高",
      colorClass: "text-emerald-600",
    };
  }
  if (score >= 60) {
    return {
      text: "压缩潜力高",
      colorClass: "text-sky-600",
    };
  }
  if (score >= 40) {
    return {
      text: "可适度压缩",
      colorClass: "text-amber-600",
    };
  }
  return {
    text: "压缩空间有限",
    colorClass: "text-rose-600",
  };
};

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

const assessAudioCompressibility = (
  details?: MediaDetailsWithResolve,
): CompressibilityAssessment | null => {
  if (!details) return null;
  const stream = details.streams?.find((s) => s.codec_type === "audio");
  const detailsBitrate = toNumber((details as { bit_rate?: unknown }).bit_rate);
  const codecName = String(stream?.codec_name ?? "").toLowerCase();
  const bitrateBps = toNumber(stream?.bit_rate) ?? detailsBitrate ?? 0;
  const bitrateKbps = bitrateBps > 0 ? bitrateBps / 1000 : 0;
  const sampleRate = toNumber(stream?.sample_rate) ?? 0;
  const bitDepth = toNumber(stream?.bit_depth) ?? toNumber(stream?.bits_per_sample) ?? 0;
  const channels = toNumber(stream?.channels) ?? 0;

  let score = 20;

  if (LOSSLESS_AUDIO_CODECS.has(codecName)) score += 32;
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

  if (["aac", "opus", "vorbis", "mp3"].includes(codecName) && bitrateKbps > 0 && bitrateKbps <= 128) {
    score -= 14;
  } else if (["aac", "opus", "vorbis", "mp3"].includes(codecName) && bitrateKbps > 0 && bitrateKbps <= 192) {
    score -= 8;
  }

  return toAssessment(clampScore(score));
};

const assessVideoCompressibility = (
  details?: MediaDetailsWithResolve,
): CompressibilityAssessment | null => {
  if (!details) return null;
  const stream = details.streams?.find((s) => s.codec_type === "video");
  const detailsBitrate = toNumber((details as { bit_rate?: unknown }).bit_rate);
  const codecName = String(stream?.codec_name ?? "").toLowerCase();
  const bitrateBps = toNumber(stream?.bit_rate) ?? detailsBitrate ?? 0;
  const bitrateKbps = bitrateBps > 0 ? bitrateBps / 1000 : 0;
  const width = toNumber(stream?.width) ?? 0;
  const height = toNumber(stream?.height) ?? 0;
  const frameRate = parseFrameRateValue(stream?.frame_rate);

  let score = 18;

  if (INTRA_OR_LOSSLESS_VIDEO_CODECS.has(codecName)) score += 30;
  else if (INEFFICIENT_VIDEO_CODECS.has(codecName)) score += 18;
  else if (HIGH_EFFICIENCY_VIDEO_CODECS.has(codecName)) score -= 8;

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

  if (HIGH_EFFICIENCY_VIDEO_CODECS.has(codecName) && bitrateKbps > 0 && bitrateKbps <= 3500) {
    score -= 14;
  } else if (HIGH_EFFICIENCY_VIDEO_CODECS.has(codecName) && bitrateKbps > 0 && bitrateKbps <= 5500) {
    score -= 8;
  }

  return toAssessment(clampScore(score));
};

const getOriginalInfoParts = (task: CompressorTask) => {
  if (task.fileType === FileType.Audio) {
    const firstAudioStream = task.mediaDetails?.streams?.find((s) => s.codec_type === "audio");
    return [
      task.mediaDetails?.extension?.toUpperCase?.(),
      formatFileSize(task.mediaDetails?.size, 0),
      firstAudioStream?.sample_rate,
      formatBitrate(firstAudioStream?.bit_rate),
    ];
  }

  if (task.fileType === FileType.Image || task.fileType === FileType.Gif) {
    const firstVideoStream = task.mediaDetails?.streams?.find((s) => s.codec_type === "video");
    return [
      task.mediaDetails?.extension?.toUpperCase?.(),
      formatFileSize(task.mediaDetails?.size, 0),
      // task.mediaDetails?.resolution,
      firstVideoStream?.width && firstVideoStream?.height
        ? `${firstVideoStream.width}x${firstVideoStream.height}`
        : undefined,
      firstVideoStream?.frame_rate,
    ];
  }

  const firstVideoStream = task.mediaDetails?.streams.find((s) => s.codec_type === "video");
  return [
    task.mediaDetails?.extension?.toUpperCase?.(),
    formatFileSize(task.mediaDetails?.size),
    task.mediaDetails?.resolution,
    formatBitrate(firstVideoStream?.bit_rate),
  ];
};

const getTargetInfoParts = (task: CompressorTask) => {
  if (task.fileType === FileType.Audio) {
    const taskArgs = task.args as CompressAudioTaskArgs;
    return [
      taskArgs.format?.toUpperCase?.(),
      getAudioEstimatedOutputSizeLabel(taskArgs, task.mediaDetails),
      taskArgs.sample_rate,
      `${taskArgs.bitrate}kbps`,
    ];
  }

  if (task.fileType === FileType.Image || task.fileType === FileType.Gif) {
    const taskArgs = task.args as CompressImageTaskArgs;
    return [
      taskArgs.format?.toUpperCase?.(),
      getImageEstimatedOutputSizeLabel(taskArgs, task.mediaDetails),
      `${taskArgs.width}x${taskArgs.height}`,
      taskArgs.frame_rate,
    ];
  }

  const taskArgs = task.args as CompressVideoTaskArgs;
  return [
    taskArgs.format?.toUpperCase?.(),
    getVideoEstimatedOutputSizeLabel(taskArgs, task.mediaDetails),
    taskArgs.resolution,
    formatBitrate(taskArgs.bitrate, 1),
  ];
};

const getCompressibility = (task: CompressorTask) => {
  if (task.fileType === FileType.Audio) {
    return assessAudioCompressibility(task.mediaDetails);
  }
  if (task.fileType === FileType.Video) {
    return assessVideoCompressibility(task.mediaDetails);
  }
  return null;
};

export default function CompressorTaskItem({
  task,
  metaStatus,
  metaError,
  onRetryMeta,
}: CompressorTaskItemProps) {
  const { t } = useTranslation("task");
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);

  const currentMetaStatus = metaStatus ?? (task.mediaDetails ? "idle" : "loading");
  const loading =
    currentMetaStatus === "loading" ||
    (!task.mediaDetails && currentMetaStatus !== "error");
  const isQueuedOrProcessing =
    task.status === "queued" || task.status === "processing";
  const outputTitleValue = useMemo(
    () => task.outputTitle ?? task.mediaDetails?.title ?? "",
    [task.outputTitle, task.mediaDetails?.title],
  );
  const compressibility = useMemo(() => getCompressibility(task), [task]);
  const originalInfoParts = useMemo(() => getOriginalInfoParts(task), [task]);
  const targetInfoParts = useMemo(() => getTargetInfoParts(task), [task]);

  const handleDeleteOrCancel = async () => {
    if (isQueuedOrProcessing) {
      await getMediaTaskQueue().cancelTaskById(task.id);
      startTransition(() => {
        updateTaskById(task.id, {
          status: "idle",
          progress: 0,
          errorMessage: undefined,
        });
      });
      return;
    }
    startTransition(() => {
      useCompressorStore.getState().removeTask(task.id);
    });
  };

  const handleConvertSingle = async () => {
    try {
      await useCompressorStore.getState().pushTasksToQueue([task]);
    } catch (error: any) {
      if (error?.message) {
        toast.error(error.message);
      }
    }
  };

  const handleOutputTitleChange = (nextTitle: string) => {
    if (task.fileType === FileType.Image || task.fileType === FileType.Gif) {
      const imageArgs = task.args as CompressImageTaskArgs;
      if (!task.mediaDetails?.path) return;
      const outputDir = useSettingsStore.getState().getOutputDir(task.mediaDetails.path);
      startTransition(() => {
        updateTaskById(task.id, {
          outputTitle: nextTitle,
          args: {
            ...imageArgs,
            output_path: `${outputDir}/${nextTitle}.${imageArgs.format}`,
          },
        });
      });
      return;
    }

    startTransition(() => {
      updateTaskById(task.id, {
        outputTitle: nextTitle,
      });
    });
  };

  const handleConfigChange = (config: Partial<CompressorTaskArgs>) => {
    if (task.fileType === FileType.Audio) {
      const audioArgs = task.args as CompressAudioTaskArgs;
      const nextConfig = config as Partial<CompressAudioTaskArgs>;
      const shouldRebuild =
        Boolean(task.mediaDetails) &&
        (nextConfig.format || nextConfig.codec || nextConfig.ratio);

      if (shouldRebuild) {
        const mergedArgs = {
          ...audioArgs,
          ...nextConfig,
        } as CompressAudioTaskArgs;
        const recalculatedArgs = buildDefaultAudioArgs(
          { ...task, args: mergedArgs },
          task.mediaDetails as MediaDetailsWithResolve,
          {
            format: nextConfig.format as FormatEnum,
            codec: nextConfig.codec as AudioEncoderEnum,
          },
        );
        updateTaskById(task.id, {
          args: recalculatedArgs,
        });
        return;
      }

      updateTaskById(task.id, {
        args: {
          ...audioArgs,
          ...nextConfig,
        },
      });
      return;
    }

    if (task.fileType === FileType.Image || task.fileType === FileType.Gif) {
      const imageArgs = task.args as CompressImageTaskArgs;
      updateTaskById(task.id, {
        args: {
          ...imageArgs,
          ...(config as Partial<CompressImageTaskArgs>),
        },
      });
      return;
    }

    const videoArgs = task.args as CompressVideoTaskArgs;
    updateTaskById(task.id, {
      args: {
        ...videoArgs,
        ...(config as Partial<CompressVideoTaskArgs>),
      },
    });
  };

  if (loading) {
    return <TaskLoadingCard />;
  }

  if (currentMetaStatus === "error") {
    return (
      <TaskLoadErrorCard
        loadError={metaError || "Failed to load media details"}
        onRemove={() => {
          void handleDeleteOrCancel();
        }}
        onRetry={onRetryMeta}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-1">
      <div className="relative flex-shrink-0">
        <div className="h-22 aspect-square overflow-hidden rounded-lg">
          <MediaThumbnail
            path={task.mediaDetails?.path}
            title={task.mediaDetails?.title}
            className="h-full w-full"
          />
        </div>
        {compressibility ? (
          <span className={`absolute right-0 top-1 w-full text-center text-xs font-medium ${compressibility.colorClass}`}>
            {compressibility.text}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <EllipsisName
            name={task.mediaDetails?.title}
            className="text-base font-semibold text-foreground/80"
          />
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0 text-sm text-muted-foreground/80">
          {originalInfoParts.map((part, index) => (
            <span key={index}>{part || "-"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ArrowBigRight className="h-4 w-4" />
      </div>

      <div className="relative min-w-[300px] basis-1/5 flex-1 rounded-lg bg-card p-2 shadow-sm">
        <div className="text-base font-semibold text-foreground/80">
          <OutputTitleEditor value={outputTitleValue} onChange={handleOutputTitleChange} />
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0 text-sm text-muted-foreground/80">
          {targetInfoParts.map((part, index) => (
            <span key={index}>{part || "auto"}</span>
          ))}
        </div>

        <div className="absolute right-1 top-1 flex flex-col items-center gap-2">
          {task.fileType === FileType.Audio ? (
            <AudioCompressionSettingsDialog
              config={task.args as CompressAudioTaskArgs}
              mediaDetails={task.mediaDetails}
              onConfigChange={(config) => {
                handleConfigChange(config);
              }}
            />
          ) : task.fileType === FileType.Image || task.fileType === FileType.Gif ? (
            <ImageCompressionSettingsDialog
              config={task.args as CompressImageTaskArgs}
              mediaDetails={task.mediaDetails}
              onConfigChange={(config) => {
                handleConfigChange(config);
              }}
              onSave={(config) => {
                handleConfigChange(config);
              }}
            />
          ) : (
            <VideoCompressionSettingsDialog
              config={task.args as CompressVideoTaskArgs}
              mediaDetails={task.mediaDetails}
              onConfigChange={(config) => {
                handleConfigChange(config);
              }}
              onSave={(config) => {
                handleConfigChange(config);
              }}
            />
          )}
          <TaskStatusLabel task={task} />
        </div>
      </div>

      <div className="flex items-center gap-2">


        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => {
                void handleDeleteOrCancel();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isQueuedOrProcessing ? t("actions.cancel") : t("actions.delete")}
          </TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          onClick={() => {
            void handleConvertSingle();
          }}
          disabled={loading || isQueuedOrProcessing}
        >
          {t("actions.compressSingle")}
        </Button>
      </div>
    </div>
  );
}
