import { useMemo } from "react";
import { VIDEO_SUPPORT_FORMATS } from "@/data/formats";
import { useBatchMediaDetails } from "@/hooks/useBatchMediaDetails";
import { cn } from "@/lib/utils";

import { FormatEnum } from "@/types/options";
import { VIDEO_CONTAINER_DEFINITIONS } from "@/data/capabilities";
import { MediaTaskType } from "@/types/tasks";
import { FileType, MediaDetailsWithResolve } from "@/types/tasks";

import { UploadPanel } from "./UploadPanel";
import { ConverterTask, useConverterStore } from "./store";
import TaskItem from "./TaskItem";

export const buildTaskDefaultsFromDetails = (task: ConverterTask, details: MediaDetailsWithResolve) => {
  let format = details.extension || FormatEnum.MP4;
  const containerDefinition = VIDEO_CONTAINER_DEFINITIONS[format as FormatEnum];
  const primaryVideoStream = details.streams.find((stream: any) => stream.codec_type === "video");
  // const primaryAudioStream = details.streams.find((stream: any) => stream.codec_type === "audio");

  const outputArgs = {
    task_id: task.id,
    format: format,
    input_path: details.path,
    video_encoder: containerDefinition?.video?.allowedEncoders[0],
    resolution: `${primaryVideoStream?.width}x${primaryVideoStream?.height}`,
    frame_rate: primaryVideoStream?.frame_rate,
    audio_tracks: [{
      source_stream_index: 0,
      codec: containerDefinition?.audio?.allowedEncoders[0],
    }]
  };

  return {
    mediaDetails: details,
    args: outputArgs,
    fileType: FileType.Video,
    taskType: MediaTaskType.ConvertToVideo,
    outputTitle: details.title,
  } as Partial<ConverterTask>;
};


interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const convertingTasks = useConverterStore((state) => state.tasks);
  const updateTaskById = useConverterStore((state) => state.updateTaskById);

  const { metaStateById, retryMeta } = useBatchMediaDetails({
    tasks: convertingTasks,
    updateTaskById,
    buildUpdate: buildTaskDefaultsFromDetails,
  });

  const filteredTasks = useMemo(() => {
    const search = globalFilter?.trim().toLowerCase() || "";
    if (!search) return convertingTasks;
    return convertingTasks.filter((task) => {
      const fileName = task.mediaDetails?.title?.toLowerCase?.() || "";
      return fileName.includes(search);
    });
  }, [convertingTasks, globalFilter]);
  
  return <>
    <UploadPanel className={cn(filteredTasks.length > 0 ? "sr-only" : "")} supportedExtensions={VIDEO_SUPPORT_FORMATS} />
    {
      filteredTasks.map((task) => {
        return (
          <TaskItem
            key={task.id}
            task={task}
            metaStatus={metaStateById[task.id]?.status}
            metaError={metaStateById[task.id]?.error}
            onRetryMeta={() => retryMeta(task.id)}
          />
        );
      })
    }
  </>
}
