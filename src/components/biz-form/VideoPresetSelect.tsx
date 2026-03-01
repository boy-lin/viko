import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectOption } from "@/types/options";
import { VIDEO_PRESETS } from "@/data/video_options";
import { cn } from "@/lib/utils";

interface VideoPresetSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoPresetSelect: React.FC<VideoPresetSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const presetOptions = options ?? VIDEO_PRESETS;

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? "选择压缩模式"} />
        </SelectTrigger>
        <SelectContent>
          {presetOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

