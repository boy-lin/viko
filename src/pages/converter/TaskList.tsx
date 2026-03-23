import { useMemo } from "react";

import { useBatchMediaDetails } from "@/hooks/useBatchMediaDetails";
import { cn } from "@/lib/utils";

import { useConverterStore } from "./store";
import { buildTaskDefaultsFromDetails } from "./taskDefaults";
import ConverterTaskItem from "./TaskItem";
import ConverterUploadPanel from "./UploadPanel";

export default function ConverterTaskList({
  globalFilter = "",
}: {
  globalFilter?: string;
}) {
  const tasks = useConverterStore((state) => state.tasks);
  const updateTaskById = useConverterStore((state) => state.updateTaskById);

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
      <ConverterUploadPanel
        className={cn(filteredTasks.length > 0 ? "sr-only" : "")}
      />
      {filteredTasks.map((task) => (
        <ConverterTaskItem
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
