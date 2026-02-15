import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectOption } from "@/types/options";

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
  const frameRateOptions = options ?? [
    { value: "auto", label: "auto" },
    { value: "60", label: "60 FPS" },
    { value: "30", label: "30 FPS" },
    { value: "24", label: "24 FPS" },
    { value: "auto", label: "Smart Fit" },
  ];

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
