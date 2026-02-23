import { useMemo } from "react";
import { IMAGE_FORMATS } from "@/data/formats";

import { UploadPanel } from "./UploadPanel";
import { useCompressorStore } from "./store";
import TaskItem from "./TaskItem";

interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const { compressingTasks } = useCompressorStore();

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

  return (
    <>
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
            <UploadPanel
              supportedExtensions={IMAGE_FORMATS}
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
