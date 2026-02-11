import { useMemo } from "react";
import { FileType } from "@/types/tasks";
import { VIDEO_FORMATS } from "@/data/formats";
import { MediaTaskType } from "@/types/tasks";

import { UploadPanel } from "./UploadPanel";
import { useConverterStore } from "./store";
import TaskItem from "./TaskItem";

interface ConvertingTaskProps {
  fileType: FileType;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
}

export default function ConvertingTask({
  fileType,
  globalFilter = "",
  onGlobalFilterChange,
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
              mediaType={MediaTaskType.ConvertVideo}
              supportedExtensions={VIDEO_FORMATS}
            />
          </div>
        ) : (
          filteredTasks.map((task) => <TaskItem key={task.id} task={task} />)
        )}
      </div>
    </>
  );
}
