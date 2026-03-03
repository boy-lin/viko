import { useCallback, useMemo } from "react";
import { VIDEO_SUPPORT_FORMATS } from "@/data/formats";
import { useBatchMediaDetails } from "@/hooks/useBatchMediaDetails";
import { MediaDetailsWithResolve } from "@/types/tasks";

import { UploadPanel } from "./UploadPanel";
import { useCompressorStore } from "./store";
import TaskItem, { buildDefaultTaskDetailsUpdates } from "./TaskItem";

interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const compressingTasks = useCompressorStore((state) => state.compressingTasks);
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);

  const buildTaskUpdate = useCallback(
    (task: (typeof compressingTasks)[number], details: MediaDetailsWithResolve) =>
      buildDefaultTaskDetailsUpdates(task, details),
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
      return fileName.includes(search);
    });
  }, [compressingTasks, globalFilter]);

  return (
    <>
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <UploadPanel supportedExtensions={VIDEO_SUPPORT_FORMATS} />
        ) : (
          filteredTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              metaStatus={metaStateById[task.id]?.status}
              metaError={metaStateById[task.id]?.error}
              onRetryMeta={() => retryMeta(task.id)}
            />
          ))
        )}
      </div>
    </>
  );
}
