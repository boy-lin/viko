import { useMemo } from "react";
import { VIDEO_FORMATS } from "@/data/formats";

import { UploadPanel } from "./UploadPanel";
import { useConverterStore } from "./store";
import TaskItem from "./TaskItem";

interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const { convertingTasks } = useConverterStore();

  const filteredTasks = useMemo(() => {
    const search = globalFilter?.trim().toLowerCase() || "";
    if (!search) return convertingTasks;
    return convertingTasks.filter((task) => {
      const fileName = task.mediaDetails?.title?.toLowerCase?.() || "";
      return (
        fileName.includes(search)
      );
    });
  }, [convertingTasks, globalFilter]);

  console.log('ConvertingTask')

  return (
    <>
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
            <UploadPanel
              supportedExtensions={VIDEO_FORMATS}
            />
          </div>
        ) : (
          filteredTasks.map((task) => {
            return (
              <TaskItem
                key={task.id}
                task={task}
              />
            );
          })
        )}
      </div>
    </>
  );
}
