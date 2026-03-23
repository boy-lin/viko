import { useMemo } from "react";

import { useBatchMediaDetails } from "@/hooks/useBatchMediaDetails";
import { cn } from "@/lib/utils";

import CompressorTaskItem from "./TaskItem";
import { useCompressorStore } from "./store";
import { buildTaskDefaultsFromDetails } from "./taskDefaults";
import CompressorUploadPanel from "./UploadPanel";

export default function CompressorTaskList({
  globalFilter = "",
}: {
  globalFilter?: string;
}) {
  const tasks = useCompressorStore((state) => state.tasks);
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);

  const { metaStateById, retryMeta } = useBatchMediaDetails({
    tasks,
    updateTaskById,
    buildUpdate: buildTaskDefaultsFromDetails,
  });

  const filteredTasks = useMemo(() => {
    const search = globalFilter.trim().toLowerCase();
    if (!search) return tasks;

    return tasks.filter((task) => {
      const fileName = task.mediaDetails?.title?.toLowerCase?.() || "";
      return fileName.includes(search);
    });
  }, [globalFilter, tasks]);

  return (
    <>
      <CompressorUploadPanel
        className={cn(filteredTasks.length > 0 ? "sr-only" : "")}
      />
      {filteredTasks.map((task) => {
        return (
          <CompressorTaskItem
            key={task.id}
            task={task}
            metaStatus={metaStateById[task.id]?.status}
            metaError={metaStateById[task.id]?.error}
            onRetryMeta={() => retryMeta(task.id)}
          />
        );
      })}
    </>
  );
}
