import { useMemo } from "react";
import { IMAGE_SUPPORT_FORMATS } from "@/data/formats";

import { UploadPanel } from "./UploadPanel";
import { useCompressorStore } from "./store";
import TaskItem from "./TaskItem";

interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const compressingTasks = useCompressorStore((state) => state.CompressingImageTasks);

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
          <UploadPanel
            supportedExtensions={IMAGE_SUPPORT_FORMATS}
          />
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
