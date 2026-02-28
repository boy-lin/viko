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
import { VIDEO_FRAME_RATES } from "@/data/capabilities";

interface VideoFrameRateSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoFrameRateSelect: React.FC<VideoFrameRateSelectProps> = ({
  value,
  onValueChange,
  options,
  label,
  hideLabel = true,
  className,
}) => {
  const frameRateOptions = options ?? VIDEO_FRAME_RATES

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer">
          <SelectValue placeholder="Select frame rate" />
        </SelectTrigger>
        <SelectContent>
          {frameRateOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
