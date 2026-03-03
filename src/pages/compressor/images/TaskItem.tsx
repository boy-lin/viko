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

export const buildDefaultImageArgs = (task: CompressingImageTask, mediaDetails: MediaDetailsWithResolve): CompressImageTaskArgs => {
  const taskId = task.id;
  const path = task.args.input_path;
  const mediaTitle = task.outputTitle || mediaDetails?.title || extractFilenameFromPath(path) || "output";
  const outputDir = useSettingsStore.getState().getOutputDir(path);
  const format = task.args.format || mediaDetails?.extension || "jpg";
  const ratio = typeof task.args.ratio === "number" ? task.args.ratio : 50;
  const presetResult = getImageCompressionPresetByRatio(ratio, format);
  const outputArgs: CompressImageTaskArgs = {
    ...task.args,
    ...presetResult.patch,
    task_id: taskId,
    format,
    input_path: path,
    ratio,
    output_path: task.args.output_path ?? "",
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
  const { t } = useTranslation("converter");
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
    <div className="flex items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
        <MediaThumbnail
          path={task.mediaDetails?.path}
          title={task.mediaDetails?.title}
          fileType={task.fileType}
          className="h-full w-full"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <EllipsisName name={task.mediaDetails?.title} className="text-base font-semibold text-foreground" />
        </div>
        <div className="mt-2 grid grid-cols-2 text-sm text-muted-foreground">
          {originalInfoParts.map((p, idx) => (
            <span key={idx}>{p || "-"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TaskStatusLabel task={task} />
      </div>

      <div className="min-w-0 flex-1">
        <OutputTitleEditor value={task.outputTitle} onChange={handleOutputTitleChange} />
        <div className="mt-1 grid grid-cols-2 text-sm text-muted-foreground">
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
          <TooltipContent>{isQueuedOrProcessing ? t("actions.cancel", "È¡Ïû") : t("actions.delete")}</TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          onClick={handleConvertSingle}
          disabled={loading || isQueuedOrProcessing}
        >
          {t("actions.compressSingle", "Ñ¹Ëõ")}
        </Button>
      </div>
    </div>
  );
}
