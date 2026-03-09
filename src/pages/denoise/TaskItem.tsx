import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { DenoiseTaskArgs } from "@/lib/mediaTaskEvent";
import { formatBitrate, getExtension } from "@/lib/utils";
import { FileType, MediaDetails, MediaTaskType } from "@/types/tasks";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { isAudioFormat, isVideoFormat } from "@/data/formats";

import { DenoiseTask, useDenoiseStore } from "./store";
import DenoiseSettingsDialog from "./DenoiseSettingsDialog";

interface TaskItemProps {
  task: DenoiseTask;
  metaStatus?: "idle" | "loading" | "error";
  metaError?: string;
  onRetryMeta?: () => void;
}

const resolveFileTypeByExtension = (extension?: string): FileType => {
  const ext = (extension || "").toLowerCase();
  if (isVideoFormat(ext)) return FileType.Video;
  if (isAudioFormat(ext)) return FileType.Audio;
  return FileType.Audio;
};

export function buildDenoiseTaskDefaults(mediaInfo: MediaDetails, task: DenoiseTask) {
  const extension = (mediaInfo.extension || getExtension(mediaInfo.path) || "").toLowerCase();
  const fileType = resolveFileTypeByExtension(extension);
  const outputArgs: DenoiseTaskArgs = {
    ...task.args,
    task_id: task.args.task_id || task.id,
    input_path: mediaInfo.path,
    input_file_type: fileType,
    format: task.args.format || extension || (fileType === FileType.Video ? "mp4" : "mp3"),
  };

  return {
    mediaDetails: mediaInfo,
    args: outputArgs,
    fileType,
    taskType: MediaTaskType.ConvertDenoise,
    outputTitle: mediaInfo.title,
  } as DenoiseTask;
}

const countEnabledFilters = (taskArgs: DenoiseTaskArgs): number => {
  const filter = taskArgs.filter || {};
  const keys: Array<keyof NonNullable<DenoiseTaskArgs["filter"]>> = [
    "remove_low",
    "remove_high",
    "fft_denoise",
    "noise_gate",
  ];
  return keys.reduce((acc, key) => acc + (filter[key] === false ? 0 : 1), 0);
};

export default function TaskItem({
  task,
  metaStatus,
  metaError,
  onRetryMeta,
}: TaskItemProps) {
  const { t } = useTranslation("task");
  const removeTask = useDenoiseStore((state) => state.removeTask);
  const updateTaskById = useDenoiseStore((state) => state.updateTaskById);

  const loadingDetails = metaStatus === "loading" || (!task.mediaDetails && metaStatus !== "error");
  const taskArgs = task.args as DenoiseTaskArgs;
  const taskMediaDetails = task.mediaDetails;
  const firstVideoStream = taskMediaDetails?.streams.find((s) => s.codec_type === "video");
  const firstAudioStream = taskMediaDetails?.streams.find((s) => s.codec_type === "audio");
  const isVideoTask = task.fileType === FileType.Video;
  const enabledFilterCount = countEnabledFilters(taskArgs);

  const originalInfoParts = isVideoTask
    ? [
      taskMediaDetails?.extension,
      firstVideoStream?.codec_name,
      `${firstVideoStream?.width || "-"}x${firstVideoStream?.height || "-"}`,
      formatBitrate(firstAudioStream?.bit_rate),
    ]
    : [
      taskMediaDetails?.extension,
      firstAudioStream?.codec_name,
      formatBitrate(firstAudioStream?.bit_rate),
      firstAudioStream?.sample_rate ? `${firstAudioStream.sample_rate}Hz` : "-",
    ];

  const targetInfoParts = [
    taskArgs.engine || "ffmpeg",
    taskArgs.format || "auto",
    `${enabledFilterCount}/4`,
    isVideoTask ? "保留视频" : "仅音频",
  ];

  const outputTitleValue = useMemo(
    () => task.outputTitle ?? task.mediaDetails?.title ?? "",
    [task.outputTitle, task.mediaDetails?.title],
  );

  const handleDenoiseSingle = async () => {
    await useDenoiseStore.getState().pushTasksToQueue([task]);
  };

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
    removeTask(task.id);
  };

  const handleOutputTitleChange = (nextTitle: string) => {
    updateTaskById(task.id, {
      outputTitle: nextTitle,
    });
  };


  const handleFilterChange = (patch: Partial<DenoiseTaskArgs["filter"]>) => {
    console.log("patch", patch);

    const patchArgs = {
      ...task.args,
      filter: {
        ...(task.args.filter || {}),
        ...patch,
      },
    };
    updateTaskById(task.id, { args: patchArgs });
  };

  if (loadingDetails) {
    return <TaskLoadingCard />;
  }

  if (metaStatus === "error") {
    return (
      <TaskLoadErrorCard
        loadError={metaError || "获取媒体信息失败"}
        onRemove={() => {
          void handleDeleteOrCancel();
        }}
        onRetry={onRetryMeta}
      />
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
        <MediaThumbnail
          path={task.mediaDetails?.path}
          title={task.mediaDetails?.title}
          className="h-full w-full"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <EllipsisName
            name={task.mediaDetails?.title}
            className="text-base font-semibold text-foreground"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 text-sm text-muted-foreground">
          {originalInfoParts.map((part, idx) => (
            <span key={idx}>{part || "-"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TaskStatusLabel task={task} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-foreground">
          <OutputTitleEditor value={outputTitleValue} onChange={handleOutputTitleChange} />
        </div>
        <div className="mt-1 grid grid-cols-2 text-sm text-muted-foreground">
          {targetInfoParts.map((part, idx) => (
            <span key={idx}>{part || "-"}</span>
          ))}
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
            {isQueuedOrProcessing ? t("actions.cancel", "取消") : t("actions.delete")}
          </TooltipContent>
        </Tooltip>

        <DenoiseSettingsDialog
          filter={task.args.filter || {}}
          onFilterChange={handleFilterChange}
        />

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          onClick={handleDenoiseSingle}
          disabled={loadingDetails || isQueuedOrProcessing}
        >
          开始降噪
        </Button>
      </div>
    </div>
  );
}
