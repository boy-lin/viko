import { useCallback } from "react";
import { UploadDrag } from "@/components/ui-biz/UploadDrag";
import { useDenoiseStore } from "./store";

export function UploadPanel({
  supportedExtensions,
  className = "h-full",
}: {
  supportedExtensions: string[];
  className?: string;
}) {
  const addTasksByPaths = useDenoiseStore((state) => state.addTasksByPaths);

  const onUploadComplete = useCallback(
    (paths: string[]) => {
      addTasksByPaths(paths);
    },
    [addTasksByPaths],
  );

  return (
    <UploadDrag
      className={className}
      supportedExtensions={supportedExtensions}
      onUploadComplete={onUploadComplete}
    />
  );
}

