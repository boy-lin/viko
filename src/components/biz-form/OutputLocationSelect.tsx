import React from "react";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { EllipsisName } from "../ui-lab/ellipsis-name";

interface OutputLocationSelectProps {
  className?: string;
}

export const OutputLocationSelect: React.FC<OutputLocationSelectProps> = ({
  className,
}) => {
  const { outputPath, setOutputPath } = useSettingsStore();

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: outputPath,
      });

      if (selected && typeof selected === "string") {
        setOutputPath(selected);
      }
    } catch (error) {
      console.error("Failed to open directory picker:", error);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        role="combobox"
        className={cn("group h-10 min-w-[140px] bg-background cursor-pointer justify-between", className)}
        onClick={handleBrowse}
      >
        <EllipsisName name={outputPath} startCount={14} />
        <FolderOpen className="w-4 h-4" />
      </Button>

    </div>
  );
};
