import { useCallback } from "react";
import { useConverterStore } from "./store";
import { MediaTaskType } from "@/types/tasks";
import { UploadDrag } from '@/components/ui-biz/UploadDrag'

export function UploadPanel({
  supportedExtensions,
}: {
  supportedExtensions: string[];
  mediaType: MediaTaskType;
}) {
  const addTasksByPaths = useConverterStore(
    (state) => state.addTasksByPaths
  );

  const onUploadComplete = useCallback((paths: string[]) => {
    addTasksByPaths(paths)
  }, [addTasksByPaths])

  return (
    <UploadDrag
      supportedExtensions={supportedExtensions}
      onUploadComplete={onUploadComplete}
    />
  );
}
