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
import { extractFilenameFromPath } from "@/lib/utils";
import { bridge } from "@/lib/bridge";
import { formatBitrate } from "@/lib/utils";

interface TaskItemProps {
  task: CompressingTask;
}

const buildDefaultArgs = (task: CompressingTask, details: any) => {
  const title = details.title || extractFilenameFromPath(details.path) || "Unknown";
  const taskId = task.id;
  const path = task.args.input_path;
  const format = details.extension;
  const outputArgs: any = {
    ...getAudioCompressionPresetByRatio(task.args.ratio, format).patch,
    task_id: taskId,
    title,
    format,
    input_path: path,
  };

  const containerDefinition = formatToDefinition.get(outputArgs.format);
  outputArgs.video_encoder = containerDefinition?.video?.defaultEncoder;

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
        startTransition(() => {
          updateTaskById(task.id, {
            mediaDetails: details,
            args: outputArgs,
            fileType: FileType.Audio,
            taskType: MediaTaskType.CompressAudio,
            outputTitle: outputArgs.title,
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
  const originalInfoParts = [
    task.mediaDetails?.extension?.toUpperCase?.(),
    formatBitrate(firstAudioStream?.bit_rate),
    firstAudioStream?.sample_rate,
    firstAudioStream?.channels,
  ];
  const targetInfoParts = [
    taskArgs.format?.toUpperCase?.(),
    taskArgs.bitrate + 'kbps',
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
