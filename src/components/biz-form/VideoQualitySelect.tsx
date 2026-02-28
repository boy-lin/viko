import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIDEO_QUALITIES } from "@/data/video_options";
import type { SelectOption } from "@/types/options";

interface VideoQualitySelectProps {
  value?: number;
  onValueChange: (value: number | undefined) => void;
  options?: SelectOption[];
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoQualitySelect: React.FC<VideoQualitySelectProps> = ({
  value,
  onValueChange,
  options,
  label,
  hideLabel = true,
  className,
}) => {
  const qualityOptions = options ?? VIDEO_QUALITIES;

  // Convert number value to string for Select component
  // If value is undefined, it might be "auto" if we defined it. 
  // Let's rely on string values in options and parse back.

  const currentValue = value !== undefined ? value.toString() : "auto";

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select
        value={currentValue}
        onValueChange={(val) => {
          if (val === "auto") {
            onValueChange(undefined);
          } else {
            onValueChange(parseInt(val, 10));
          }
        }}
      >
        <SelectTrigger className="cursor-pointer" >
          <SelectValue placeholder="Select quality" />
        </SelectTrigger>
        <SelectContent>
          {qualityOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
