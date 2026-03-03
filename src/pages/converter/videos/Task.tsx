import { useCallback, useMemo } from "react";
import { VIDEO_SUPPORT_FORMATS } from "@/data/formats";
import { useBatchMediaDetails } from "@/hooks/useBatchMediaDetails";
import { MediaDetailsWithResolve } from "@/types/tasks";

import { UploadPanel } from "./UploadPanel";
import { useConverterStore } from "./store";
import TaskItem, { buildTaskDefaultsFromDetails } from "./TaskItem";

interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const convertingTasks = useConverterStore((state) => state.convertingTasks);
  const updateTaskById = useConverterStore((state) => state.updateTaskById);

  const buildTaskUpdate = useCallback(
    (task: (typeof convertingTasks)[number], details: MediaDetailsWithResolve) =>
      buildTaskDefaultsFromDetails(task, details),
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
    return convertingTasks.filter((task) => {
      const fileName = task.mediaDetails?.title?.toLowerCase?.() || "";
      return fileName.includes(search);
    });
  }, [convertingTasks, globalFilter]);

  return (
    <>
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <UploadPanel supportedExtensions={VIDEO_SUPPORT_FORMATS} />
        ) : (
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
        )}
      </div>
    </>
  );
}
