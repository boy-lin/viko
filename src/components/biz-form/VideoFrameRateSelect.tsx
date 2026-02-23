import React from "react";
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
}

export const VideoFrameRateSelect: React.FC<VideoFrameRateSelectProps> = ({
  value,
  onValueChange,
  options,
}) => {
  const frameRateOptions = options ?? VIDEO_FRAME_RATES

  return (
    <Select value={value ?? "auto"} onValueChange={onValueChange}>
      <SelectTrigger>
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
  );
};
