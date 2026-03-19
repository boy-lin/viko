import { useCallback } from "react";
import { useConverterStore } from "./store";
import { UploadDrag } from '@/components/ui-biz/UploadDrag'
import { cn } from "@/lib/utils";

export function UploadPanel({
    supportedExtensions,
  className,
}: {
  supportedExtensions: string[];
  className?: string;
}) {
  const addTasksByPaths = useConverterStore(
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
