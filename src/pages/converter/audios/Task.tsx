import { useCallback, useMemo } from "react";
import { AUDIO_SUPPORT_FORMATS } from "@/data/formats";
import { useBatchMediaDetails } from "@/hooks/useBatchMediaDetails";
import { MediaDetailsWithResolve } from "@/types/tasks";

import { UploadPanel } from "./UploadPanel";
import { ConverterTask, useConverterStore } from "./store";
import TaskItem, { buildDefaultArgs } from "./TaskItem";
import { cn } from "@/lib/utils";

interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const convertingTasks = useConverterStore((state) => state.tasks);
  const updateTaskById = useConverterStore((state) => state.updateTaskById);

  const buildTaskUpdate = useCallback(
    (task: (typeof convertingTasks)[number], details: MediaDetailsWithResolve) => buildDefaultArgs(details, task),
    [],
  );

  const { metaStateById, retryMeta } = useBatchMediaDetails({
    tasks: convertingTasks,
    updateTaskById,
    buildUpdate: buildTaskUpdate,
  });

  const filteredTasks = useMemo(() => {
    const search = globalFilter?.trim().toLowerCase() || "";
    if (!search) return convertingTasks;
    return convertingTasks.filter((task: ConverterTask) => {
      const fileName = task.mediaDetails?.title?.toLowerCase?.() || "";
      return fileName.includes(search);
    });
  }, [convertingTasks, globalFilter]);

  return <>
    {
      <UploadPanel className={cn(filteredTasks.length > 0 ? "sr-only" : "")} supportedExtensions={AUDIO_SUPPORT_FORMATS} />
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
