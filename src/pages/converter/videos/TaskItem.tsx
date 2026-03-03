import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FileType, MediaDetails } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useTranslation } from "react-i18next";
import { FormatSelectorDialog } from "@/components/biz-form/FormatSelector";
import { ConverterTask, useConverterStore } from "./store";
import { FormatEnum } from "@/types/options";
import { VIDEO_CONTAINER_DEFINITIONS } from "@/data/capabilities";
import { MediaTaskType } from "@/types/tasks";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import MediaOriginalInfoGrid from "@/components/ui-biz/MediaOriginalInfoGrid";
import MediaTargetInfoGrid from "@/components/ui-biz/MediaTargetInfoGrid";

interface TaskItemProps {
  task: ConverterTask;
  metaStatus?: "idle" | "loading" | "error";
  metaError?: string;
  onRetryMeta?: () => void;
}

export const buildTaskDefaultsFromDetails = (task: ConverterTask, details: MediaDetails) => {
  let format = FormatEnum.MP4;
  const outputArgs: any = {
    task_id: task.id,
    format: format,
    input_path: details.path,
  };
  const containerDefinition = VIDEO_CONTAINER_DEFINITIONS[format as FormatEnum];
  outputArgs.video_encoder = containerDefinition?.video?.allowedEncoders[0];
  outputArgs.audio_tracks =
    details?.streams
      ?.filter((stream: any) => stream.codec_type === "audio")
      .map((stream: any) => ({
        source_stream_index: stream.index,
        codec: containerDefinition?.audio?.allowedEncoders[0],
        bitrate: 128,
        sample_rate: 32000,
        channels: stream.channels,
        bit_depth: stream.bit_depth,
      })) || [];

  return {
    mediaDetails: details,
    args: outputArgs,
    fileType: FileType.Video,
    taskType: MediaTaskType.ConvertVideo,
    outputTitle: details.title,
  } as Partial<ConverterTask>;
};

export default function TaskItem({ task, metaStatus, metaError, onRetryMeta }: TaskItemProps) {
  const { t } = useTranslation("converter");
  const updateTaskById = useConverterStore((state) => state.updateTaskById);

  const currentMetaStatus = metaStatus ?? (task.mediaDetails ? "idle" : "loading");
  const loadError = metaError ?? "";
  const loading = currentMetaStatus === "loading" || (!task.mediaDetails && currentMetaStatus !== "error");
  const outputTitleValue = useMemo(
    () => task.outputTitle ?? task.mediaDetails?.title ?? "",
    [task.outputTitle, task.mediaDetails?.title],
  );

  const handleConvertSingle = async () => {
    await useConverterStore.getState().pushTasksToQueue([task]);
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
    useConverterStore.getState().removeTask(task.id);
  };

  if (currentMetaStatus === "error") {
    return (
      <TaskLoadErrorCard
        loadError={loadError || "Failed to load media details"}
        onRemove={handleDeleteOrCancel}
        onRetry={onRetryMeta}
      />
    );
  }

  const convertVideoTaskArgs = task.args as ConvertVideoTaskArgs;

  const handleOutputTitleChange = (nextTitle: string) => {
    updateTaskById(task.id, {
      outputTitle: nextTitle,
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
        <MediaOriginalInfoGrid mediaDetails={task.mediaDetails} />
      </div>

      <div className="flex items-center gap-2">
        <TaskStatusLabel task={task} />
      </div>

      <div className="flex-1 min-w-0">
        <OutputTitleEditor
          value={outputTitleValue}
          onChange={handleOutputTitleChange}
        />
        <MediaTargetInfoGrid args={convertVideoTaskArgs} />
      </div>

      <div className="flex items-center gap-2">
        <FormatSelectorDialog
          config={{
            args: task.args,
            taskType: task.taskType,
            activeCategory: task.activeCategory,
          }}
          recentKey="converter-videos-task-item"
          onValueChange={(config) => {
            updateTaskById(task.id, {
              activeCategory: config.activeCategory,
              taskType: config.taskType,
              args: config.args,
            });
          }}
          applyConfigToAllTasks={(config) => {
            updateTaskById(task.id, {
              activeCategory: config.activeCategory,
              taskType: config.taskType,
              args: config.args,
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
          <TooltipContent>{isQueuedOrProcessing ? t("actions.cancel", "È¡Ïû") : t("actions.delete")}</TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          onClick={handleConvertSingle}
          disabled={loading || isQueuedOrProcessing}
        >
          {t("actions.convertSingle", "×ª»»")}
        </Button>
      </div>
    </div>
  );
}
