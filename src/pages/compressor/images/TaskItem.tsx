import { startTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import { MediaDetailsWithResolve } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { CompressImageTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useTranslation } from "react-i18next";
import { CompressionSettingsDialog } from "./SettingsDialog";
import { CompressingImageTask, useCompressorStore } from "./store";
import { useSettingsStore } from "@/stores/settingsStore";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { extractFilenameFromPath } from "@/lib/utils";
import { getImageCompressionPresetByRatio } from "./compressionPreset";
import { formatFileSize } from "@/lib/file";

interface TaskItemProps {
  task: CompressingImageTask;
  metaStatus?: "idle" | "loading" | "error";
  metaError?: string;
  onRetryMeta?: () => void;
}

const formatDpiFromTags = (tags?: Record<string, string>) => {
  if (!tags) return "-";
  const dpiX = Number.parseFloat(tags.dpi_x ?? "");
  const dpiY = Number.parseFloat(tags.dpi_y ?? "");
  if (!Number.isFinite(dpiX) && !Number.isFinite(dpiY)) return "-";

  const unit = (tags.dpi_unit || "inch").toLowerCase();
  const unitLabel = unit === "cm" ? "dpcm" : "dpi";
  const x = Number.isFinite(dpiX) ? Math.round(dpiX) : undefined;
  const y = Number.isFinite(dpiY) ? Math.round(dpiY) : undefined;
  if (x && y && x !== y) return `${x}x${y} ${unitLabel}`;
  return `${x ?? y} ${unitLabel}`;
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
  const stream = mediaDetails.streams[0] as (typeof mediaDetails.streams[number] & { pix_fmt?: string }) | undefined;
  const pixFmt = (stream?.pix_fmt || "").toLowerCase();
  if (pixFmt.includes("gray") || pixFmt.includes("ya")) return "Gray";
  if (pixFmt.includes("rgba") || pixFmt.includes("argb") || pixFmt.includes("bgra")) return "RGBA";
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

export const buildDefaultImageArgs = (task: CompressingImageTask, mediaDetails: MediaDetailsWithResolve): CompressImageTaskArgs => {
  const taskId = task.id;
  const path = task.args.input_path;
  const mediaTitle = task.outputTitle || mediaDetails?.title || extractFilenameFromPath(path) || "output";
  const outputDir = useSettingsStore.getState().getOutputDir(path);
  const format = task.args.format || mediaDetails?.extension || "jpg";
  const ratio = typeof task.args.ratio === "number" ? task.args.ratio : 50;
  const presetResult = getImageCompressionPresetByRatio(ratio, format);
  const primaryStream = mediaDetails.streams[0];
  const outputArgs: CompressImageTaskArgs = {
    ...task.args,
    ...presetResult.patch,
    task_id: taskId,
    format,
    input_path: path,
    ratio,
    output_path: task.args.output_path ?? "",
    width: task.args.width ?? primaryStream?.width,
    height: task.args.height ?? primaryStream?.height,
    quality: task.args.quality ?? parseImageQuality(mediaDetails) ?? presetResult.patch.quality,
    color_mode: task.args.color_mode ?? inferImageColorMode(mediaDetails) ?? presetResult.patch.color_mode,
    dpi: task.args.dpi ?? parseDpiFromTags(mediaDetails.tags) ?? presetResult.patch.dpi,
  };
  outputArgs.output_path = `${outputDir}/${mediaTitle}.${outputArgs.format ?? format}`;

  return outputArgs;
};

export default function TaskItem({
  task,
  metaStatus,
  metaError,
  onRetryMeta,
}: TaskItemProps) {
  const { t } = useTranslation("task");
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);
  const loading = metaStatus === "loading" || (!task.mediaDetails && metaStatus !== "error");

  const handleConvertSingle = async () => {
    await useCompressorStore.getState().pushTasksToQueue([task]);
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

  if (metaStatus === "error") {
    return (
      <TaskLoadErrorCard
        loadError={metaError || "Failed to load media details"}
        onRemove={handleDeleteOrCancel}
        onRetry={onRetryMeta}
      />
    );
  }

  const taskArgs = task.args as CompressImageTaskArgs;
  const originalInfoParts = [
    task.mediaDetails?.extension?.toUpperCase?.(),
    formatFileSize(task.mediaDetails?.size, 0),
    task.mediaDetails?.resolution,
    formatDpiFromTags(task.mediaDetails?.tags),
  ];
  const targetInfoParts = [
    taskArgs.format?.toUpperCase?.(),
    taskArgs.quality,
    taskArgs.color_mode,
    taskArgs.dpi,
  ];

  const handleOutputTitleChange = (nextTitle: string) => {
    if (!task.mediaDetails?.path) return;
    const outputDir = useSettingsStore.getState().getOutputDir(task.mediaDetails.path);
    const outputPath = `${outputDir}/${nextTitle}.${taskArgs.format}`;
    startTransition(() => {
      updateTaskById(task.id, {
        outputTitle: nextTitle,
        args: {
          ...taskArgs,
          output_path: outputPath,
        },
      });
    });
  };

  return (
    <div className="flex items-center gap-4 p-1 rounded-lg border border-border">
      <div className="h-22 aspect-square rounded-lg overflow-hidden flex-shrink-0">
        <MediaThumbnail
          path={task.mediaDetails?.path}
          title={task.mediaDetails?.title}
          className="h-full w-full"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <EllipsisName name={task.mediaDetails?.title} className="text-base font-semibold text-foreground/80" />
        </div>
        <div className="grid grid-cols-2 mt-2 text-sm text-muted-foreground/80">
          {originalInfoParts.map((p, idx) => (
            <span key={idx}>{p || "-"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TaskStatusLabel task={task} />
      </div>

      <div className="flex-1 min-w-[300px] bg-card shadow-sm p-2 rounded-lg">
        <div className="text-base font-semibold text-foreground/80">
          <OutputTitleEditor value={task.outputTitle} onChange={handleOutputTitleChange} />
        </div>
        <div className="grid grid-cols-2 mt-1 text-sm text-muted-foreground/80">
          {targetInfoParts.map((p, idx) => (
            <span key={idx}>{p || "auto"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <CompressionSettingsDialog
          config={taskArgs}
          onConfigChange={async (config) => {
            startTransition(() => {
              updateTaskById(task.id, {
                args: {
                  ...taskArgs,
                  ...config,
                },
              });
            });
          }}
          onSave={(config) => {
            startTransition(() => {
              updateTaskById(task.id, {
                args: {
                  ...taskArgs,
                  ...config,
                },
              });
            });
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={handleDeleteOrCancel}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isQueuedOrProcessing ? t("actions.cancel") : t("actions.delete")}</TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          onClick={handleConvertSingle}
          disabled={loading || isQueuedOrProcessing}
        >
          {t("actions.compressSingle")}
        </Button>
      </div>
    </div>
  );
}
