import { useCallback } from "react";
import { useConverterStore } from "./store";
import { MediaTaskType } from "@/types/tasks";
import { UploadDrag, UploadItem } from '@/components/ui-biz/UploadDrag'

export function UploadPanel({
  supportedExtensions,
  mediaType
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
      mediaType={mediaType}
      onUploadComplete={onUploadComplete}
    />
  );
}
