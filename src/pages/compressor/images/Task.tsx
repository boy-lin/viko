import { useCallback, useMemo } from "react";
import { IMAGE_SUPPORT_FORMATS } from "@/data/formats";
import { useBatchMediaDetails } from "@/hooks/useBatchMediaDetails";
import { FileType, MediaDetailsWithResolve, MediaTaskType } from "@/types/tasks";
import { extractFilenameFromPath } from "@/lib/utils";

import { UploadPanel } from "./UploadPanel";
import { useCompressorStore } from "./store";
import TaskItem, { buildDefaultImageArgs } from "./TaskItem";
import { cn } from "@/lib/utils";
interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const compressingTasks = useCompressorStore((state) => state.CompressingImageTasks);
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);

  const buildTaskUpdate = useCallback(
    (task: (typeof compressingTasks)[number], details: MediaDetailsWithResolve) => {
      const title = details.title || extractFilenameFromPath(details.path);
      const outputArgs = buildDefaultImageArgs(
        { ...task, outputTitle: title },
        details,
      );
      return {
        mediaDetails: details,
        args: outputArgs,
        fileType: FileType.Image,
        taskType: MediaTaskType.CompressImage,
        outputTitle: title,
      };
    },
    [],
  );

  const { metaStateById, retryMeta } = useBatchMediaDetails({
    tasks: compressingTasks,
    updateTaskById,
    buildUpdate: buildTaskUpdate,
  });

  const filteredTasks = useMemo(() => {
    const search = globalFilter?.trim().toLowerCase() || "";
    if (!search) return compressingTasks;
    return compressingTasks.filter((task) => {
      const fileName = task.mediaDetails?.title?.toLowerCase?.() || "";
      return (
        fileName.includes(search)
      );
    });
  }, [compressingTasks, globalFilter]);

  return <>
    {
      <UploadPanel className={cn(filteredTasks.length > 0 ? "sr-only" : "")} supportedExtensions={IMAGE_SUPPORT_FORMATS} />
    }
    {
      filteredTasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          metaStatus={metaStateById[task.id]?.status}
          metaError={metaStateById[task.id]?.error}
          onRetryMeta={() => retryMeta(task.id)}
        />
      ))
    }
  </>
}
