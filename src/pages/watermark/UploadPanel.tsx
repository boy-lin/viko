import { useCallback } from "react";
import { UploadDrag } from '@/components/ui-biz/UploadDrag'
import { useWatermarkStore } from "./store";

export function UploadPanel({
  supportedExtensions,
}: {
  supportedExtensions: string[];
}) {
  const addTasksByPaths = useWatermarkStore(
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
