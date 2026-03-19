import { useCallback } from "react";
import { UploadDrag } from '@/components/ui-biz/UploadDrag'
import { useCompressorStore } from "./store";
import { cn } from "@/lib/utils";

export function UploadPanel({
  className,
  supportedExtensions,
}: {
  supportedExtensions: string[];
  className?: string;
}) {
  const addTasksByPaths = useCompressorStore(
    (state) => state.addTasksByPaths
  );

  const onUploadComplete = useCallback((paths: string[]) => {
    addTasksByPaths(paths)
  }, [addTasksByPaths])

  return (
    <UploadDrag
      className={cn("h-full", className)}
      supportedExtensions={supportedExtensions}
      onUploadComplete={onUploadComplete}
    />
  );
}
