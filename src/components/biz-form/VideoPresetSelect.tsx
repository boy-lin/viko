import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectOption } from "@/types/options";

const DEFAULT_PRESET_OPTIONS: SelectOption[] = [
  { value: "auto", label: "默认" },
  { value: "ultrafast", label: "ultrafast" },
  { value: "fast", label: "fast" },
  { value: "medium", label: "medium" },
  { value: "slow", label: "slow" },
];

interface VideoPresetSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
}

export const VideoPresetSelect: React.FC<VideoPresetSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
}) => {
  const presetOptions = options ?? DEFAULT_PRESET_OPTIONS;

  return (
    <Select value={value ?? "auto"} onValueChange={onValueChange}>
      <SelectTrigger className="cursor-pointer">
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
  );
};

