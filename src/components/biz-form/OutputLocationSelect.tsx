import React from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "@/stores/settingsStore";

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
      <Input
        value={outputPath}
        readOnly
        className="h-10 min-w-[140px] bg-background text-ellipsis"
        title={outputPath}
      />
      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleBrowse}>
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
      </Button>
    </div>
  );
};
