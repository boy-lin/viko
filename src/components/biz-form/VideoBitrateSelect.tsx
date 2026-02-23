import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectOption } from "@/types/options";
import { VIDEO_BITRATES } from "@/data/video_options";

interface VideoBitrateSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
}

export const VideoBitrateSelect: React.FC<VideoBitrateSelectProps> = ({
  value,
  onValueChange,
  options,
}) => {
  const bitrateOptions = options ?? VIDEO_BITRATES;
  return (
    <Select value={value ?? "auto"} onValueChange={onValueChange}>
      <SelectTrigger className="cursor-pointer">
        <SelectValue placeholder="Select bitrate" />
      </SelectTrigger>
      <SelectContent>
        {bitrateOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
