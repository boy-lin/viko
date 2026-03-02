import { startTransition, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import { FileType, MediaDetailsWithResolve } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { CompressImageTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { bridge } from "@/lib/bridge";
import { useTranslation } from "react-i18next";
import { CompressionSettingsDialog } from "./SettingsDialog";
import { CompressingImageTask, useCompressorStore } from "./store";
import { MediaTaskType } from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { extractFilenameFromPath } from "@/lib/utils";
import { getImageCompressionPresetByRatio } from "./compressionPreset";

interface TaskItemProps {
  task: CompressingImageTask;
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
  console.log('presetResult', presetResult)
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
        const details = await bridge.getImageDetails(task.args.input_path);
        console.log(' details', details)
        if (!active) return;
        const title = details.title || extractFilenameFromPath(details.path);
        const outputArgs = buildDefaultImageArgs(
          { ...task, outputTitle: title },
          details,
        );
        startTransition(() => {
          updateTaskById(task.id, {
            mediaDetails: details,
            args: outputArgs,
            fileType: FileType.Image,
            taskType: MediaTaskType.CompressImage,
            outputTitle: title,
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

  const taskArgs = task.args as CompressImageTaskArgs;
  const originalInfoParts = [
    task.mediaDetails?.extension?.toUpperCase?.(),
    formatDpiFromTags(task.mediaDetails?.tags),
  ];
  const targetInfoParts = [
    taskArgs.format?.toUpperCase?.(),
    taskArgs.quality,
    taskArgs.color_mode,
    taskArgs.dpi
  ];

  const handleOutputTitleChange = (nextTitle: string) => {
    if (!task.mediaDetails?.path) {
      console.error('mediaDetails.path is undefined');
      return;
    }
    const outputDir = useSettingsStore.getState().getOutputDir(task.mediaDetails?.path);
    const output_path = `${outputDir}/${nextTitle}.${taskArgs.format}`
    startTransition(() => {
      updateTaskById(task.id, {
        outputTitle: nextTitle,
        args: {
          ...taskArgs,
          output_path,
        },
      });
    });
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-border shadow-sm">
      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
        <MediaThumbnail
          path={task.mediaDetails?.path}
          title={task.mediaDetails?.title}
          fileType={task.fileType}
          className="w-full h-full"
        />
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
            startTransition(() => {
              updateTaskById(task.id, {
                args: {
                  ...taskArgs,
                  ...config,
                }
              });
            });
          }}
          onSave={(config) => {
            startTransition(() => {
              updateTaskById(task.id, {
                args: {
                  ...taskArgs,
                  ...config,
                }
              });
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
