import { useCallback } from "react";
import { UploadDrag } from '@/components/ui-biz/UploadDrag'
import { useCompressorStore } from "./store";

export function UploadPanel({
  supportedExtensions,
}: {
  supportedExtensions: string[];
}) {
  const addTasksByPaths = useCompressorStore(
    (state) => state.addTasksByPaths
  );

  const onUploadComplete = useCallback((paths: string[]) => {
    addTasksByPaths(paths)
  }, [addTasksByPaths])

  return (
    <UploadDrag
      className="h-full"
      supportedExtensions={supportedExtensions}
      onUploadComplete={onUploadComplete}
    />
  );
}
