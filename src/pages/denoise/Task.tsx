import { useCallback, useMemo } from "react";
import { AUDIO_SUPPORT_FORMATS, VIDEO_SUPPORT_FORMATS } from "@/data/formats";
import { useBatchMediaDetails } from "@/hooks/useBatchMediaDetails";
import { MediaDetailsWithResolve } from "@/types/tasks";

import { UploadPanel } from "./UploadPanel";
import { useDenoiseStore } from "./store";
import TaskItem, { buildDenoiseTaskDefaults } from "./TaskItem";

interface DenoiseTaskListProps {
  globalFilter?: string;
}

const SUPPORTED_EXTENSIONS = Array.from(
  new Set([...AUDIO_SUPPORT_FORMATS, ...VIDEO_SUPPORT_FORMATS]),
);

export default function DenoiseTaskList({
  globalFilter = "",
}: DenoiseTaskListProps) {
  const tasks = useDenoiseStore((state) => state.tasks);
  const updateTaskById = useDenoiseStore((state) => state.updateTaskById);

  const buildTaskUpdate = useCallback(
    (task: (typeof tasks)[number], details: MediaDetailsWithResolve) =>
      buildDenoiseTaskDefaults(details, task),
    [],
  );

  const { metaStateById, retryMeta } = useBatchMediaDetails({
    tasks: tasks,
    updateTaskById,
    buildUpdate: buildTaskUpdate,
  });

  const filteredTasks = useMemo(() => {
    const search = globalFilter?.trim().toLowerCase() || "";
    if (!search) return tasks;
    return tasks.filter((task) => {
      const fileName = task.mediaDetails?.title?.toLowerCase?.() || "";
      return fileName.includes(search);
    });
  }, [tasks, globalFilter]);

  if (filteredTasks.length === 0) {
    return (
        <UploadPanel supportedExtensions={SUPPORTED_EXTENSIONS} className="h-full" />
    );
  }

  return (
    <>
      {filteredTasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          metaStatus={metaStateById[task.id]?.status}
          metaError={metaStateById[task.id]?.error}
          onRetryMeta={() => retryMeta(task.id)}
        />
      ))}
    </>
  );
}

