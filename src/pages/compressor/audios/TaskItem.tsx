import { startTransition, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import { CompressingTask, FileType } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { CompressAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useTranslation } from "react-i18next";
import { CompressionSettingsDialog } from "./SettingsDialog";
import { useCompressorStore } from "./store";
import { formatToDefinition } from "@/data/capabilities";
import { MediaTaskType } from "@/types/tasks";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { getAudioCompressionPresetByRatio } from "./compressionPreset";
import { extractFilenameFromPath, formatBitrate } from "@/lib/utils";
import { bridge } from "@/lib/bridge";
import { FormatEnum } from "@/types/options";

interface TaskItemProps {
  task: CompressingTask;
}

interface CompressibilityAssessment {
  score: number;
  text: string;
  colorClass: string;
  recommendedFormat: string;
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

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

const pickBestCompressionFormat = (score: number, originalExtension?: string): string => {
  const original = (originalExtension ?? "").toLowerCase();
  if (score >= 75) return FormatEnum.OGG;
  if (score >= 55) return FormatEnum.M4A;
  if ([FormatEnum.MP3, FormatEnum.M4A, FormatEnum.OGG, FormatEnum.AAC].includes(original as FormatEnum)) {
    return original;
  }
  return FormatEnum.M4A;
};

const assessCompressibility = (details: any): CompressibilityAssessment => {
  const stream = details?.streams?.find((s: any) => s.codec_type === "audio");
  const codecName = String(stream?.codec_name ?? "").toLowerCase();
  const bitrateBps = toNumber(stream?.bit_rate) ?? toNumber(details?.bit_rate) ?? 0;
  const bitrateKbps = bitrateBps > 0 ? bitrateBps / 1000 : 0;
  const sampleRate = toNumber(stream?.sample_rate) ?? 0;
  const bitDepth = toNumber(stream?.bit_depth) ?? toNumber(stream?.bits_per_sample) ?? 0;
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

  if (["aac", "opus", "vorbis", "mp3"].includes(codecName) && bitrateKbps > 0 && bitrateKbps <= 128) {
    score -= 14;
  } else if (["aac", "opus", "vorbis", "mp3"].includes(codecName) && bitrateKbps > 0 && bitrateKbps <= 192) {
    score -= 8;
  }

  const normalizedScore = clampScore(score);
  const recommendedFormat = pickBestCompressionFormat(normalizedScore, details?.extension);

  if (normalizedScore >= 80) {
    return {
      score: normalizedScore,
      text: `压缩潜力极高 (${normalizedScore})`,
      colorClass: "text-emerald-600",
      recommendedFormat,
    };
  }
  if (normalizedScore >= 60) {
    return {
      score: normalizedScore,
      text: `压缩潜力高 (${normalizedScore})`,
      colorClass: "text-sky-600",
      recommendedFormat,
    };
  }
  if (normalizedScore >= 40) {
    return {
      score: normalizedScore,
      text: `可适度压缩 (${normalizedScore})`,
      colorClass: "text-amber-600",
      recommendedFormat,
    };
  }
  return {
    score: normalizedScore,
    text: `压缩空间有限 (${normalizedScore})`,
    colorClass: "text-rose-600",
    recommendedFormat,
  };
};

const buildDefaultArgs = (task: CompressingTask, details: any): CompressAudioTaskArgs => {
  const taskId = task.id;
  const path = task.args.input_path;
  const assessment = assessCompressibility(details);
  const ratio = typeof task.args.ratio === "number" ? task.args.ratio : 50;
  const format = assessment.recommendedFormat;
  const outputArgs: CompressAudioTaskArgs = {
    ...(task.args as CompressAudioTaskArgs),
    ...getAudioCompressionPresetByRatio(ratio, format).patch,
    task_id: taskId,
    format,
    input_path: path,
    ratio,
    output_path: (task.args as CompressAudioTaskArgs).output_path ?? "",
  };

  const containerDefinition = formatToDefinition.get(format);
  outputArgs.codec =
    outputArgs.codec ||
    containerDefinition?.audio?.allowedEncoders[0] ||
    (task.args as CompressAudioTaskArgs).codec;

  return outputArgs;
};

export default function TaskItem({ task }: TaskItemProps) {
  const { t } = useTranslation("converter");
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);
  const [loading, setLoading] = useState(!task.mediaDetails);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadDetails = async () => {
      if (task.mediaDetails || !task.args?.input_path) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const details = await bridge.getMediaDetails(task.args.input_path);
        if (!active) return;
        const outputArgs = buildDefaultArgs(task, details);
        const outputTitle =
          details.title || extractFilenameFromPath(details.path) || "Unknown";
        startTransition(() => {
          updateTaskById(task.id, {
            mediaDetails: details,
            args: outputArgs,
            fileType: FileType.Audio,
            taskType: MediaTaskType.CompressAudio,
            outputTitle,
          });
        });
      } catch (error: any) {
        if (!active) return;
        setLoadError(error?.message || "Failed to load media details");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadDetails();
    return () => {
      active = false;
    };
  }, [task.args?.input_path]);

  const handleConvertSingle = async () => {
    await useCompressorStore.getState().pushTasksToQueue([task])
  };

  if (loading) {
    return <TaskLoadingCard />;
  }

  const isQueuedOrProcessing = task.status === "queued" || task.status === "processing";

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

  if (loadError) {
    return <TaskLoadErrorCard loadError={loadError} onRemove={handleDeleteOrCancel} />;
  }

  const taskArgs = task.args as CompressAudioTaskArgs;
  const firstAudioStream = task.mediaDetails?.streams?.find((s) => s.codec_type === "audio");
  const compressibility = assessCompressibility(task.mediaDetails);
  const originalInfoParts = [
    task.mediaDetails?.extension?.toUpperCase?.(),
    formatBitrate(firstAudioStream?.bit_rate),
    firstAudioStream?.sample_rate,
    firstAudioStream?.channels,
  ];
  const targetInfoParts = [
    taskArgs.format?.toUpperCase?.(),
    formatBitrate(taskArgs.bitrate, 1),
    taskArgs.sample_rate,
    taskArgs.channels,
  ];

  const handleOutputTitleChange = (nextTitle: string) => {
    startTransition(() => {
      updateTaskById(task.id, {
        outputTitle: nextTitle
      });
    });
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-border shadow-sm">
      <div className="w-28 flex flex-col items-start gap-2 flex-shrink-0 relative">
        <div className="w-20 h-20 rounded-lg overflow-hidden">
          <MediaThumbnail
            path={task.mediaDetails?.path}
            title={task.mediaDetails?.title}
            fileType={task.fileType}
            className="w-full h-full"
          />
        </div>
        <span className={`absolute top-0 right-0 w-full text-xs font-medium ${compressibility.colorClass}`}>
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
        <OutputTitleEditor
          value={task.outputTitle}
          onChange={handleOutputTitleChange}
        />
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
              }
            });
          }}
          onSave={(config) => {
            updateTaskById(task.id, {
              args: {
                ...taskArgs,
                ...config,
              }
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
          disabled={isQueuedOrProcessing}
        >
          {t("actions.compressSingle", "压缩")}
        </Button>
      </div>
    </div>
  );
}
