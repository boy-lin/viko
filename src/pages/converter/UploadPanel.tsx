import { UploadDrag } from "@/components/ui-biz/UploadDrag";
import { SUPPORT_FORMATS } from "@/data/formats";
import { cn } from "@/lib/utils";

import { useConverterStore } from "./store";

export default function ConverterUploadPanel({
  className,
}: {
  className?: string;
}) {
  const addTasksByPaths = useConverterStore((state) => state.addTasksByPaths);

  return (
    <UploadDrag
      className={cn("h-full", className)}
      supportedExtensions={SUPPORT_FORMATS}
      onUploadComplete={(paths) => addTasksByPaths(paths)}
    />
  );
}
