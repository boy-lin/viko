import { useCallback } from "react";
import { useConverterStore } from "./store";
import { UploadDrag } from '@/components/ui-biz/UploadDrag'

export function UploadPanel({
  supportedExtensions,
}: {
  supportedExtensions: string[];
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
