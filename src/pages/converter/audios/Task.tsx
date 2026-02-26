import { useMemo } from "react";
import { AUDIO_FORMATS } from "@/data/formats";

import { UploadPanel } from "./UploadPanel";
import { useConverterStore } from "./store";
import TaskItem from "./TaskItem";

interface ConvertingTaskProps {
  globalFilter?: string;
}

export default function ConvertingTask({
  globalFilter = "",
}: ConvertingTaskProps) {
  const convertingTasks = useConverterStore((state) => state.convertingTasks);

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
          <UploadPanel
            supportedExtensions={AUDIO_FORMATS}
          />
        ) : (
          filteredTasks.map((task) => <TaskItem key={task.id} task={task} />)
        )}
      </div>
    </>
  );
}
