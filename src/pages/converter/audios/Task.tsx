import { useMemo } from "react";
import { AUDIO_FORMATS } from "@/data/formats";
import { MediaTaskType } from "@/types/tasks";

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
      return fileName.includes(search);
    });
  }, [convertingTasks, globalFilter]);

  return (
    <>
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
            <UploadPanel
              supportedExtensions={AUDIO_FORMATS}
            />
          </div>
        ) : (
          filteredTasks.map((task) => <TaskItem key={task.id} task={task} />)
        )}
      </div>
    </>
  );
}
