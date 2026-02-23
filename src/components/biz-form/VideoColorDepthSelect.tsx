import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectOption } from "@/types/options";

const DEFAULT_COLOR_DEPTH_OPTIONS: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "8", label: "8-bit" },
  { value: "10", label: "10-bit" },
  { value: "12", label: "12-bit" },
];

interface VideoColorDepthSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
}

export const VideoColorDepthSelect: React.FC<VideoColorDepthSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
}) => {
  const colorDepthOptions = options ?? DEFAULT_COLOR_DEPTH_OPTIONS;

  return (
    <Select value={value ?? "auto"} onValueChange={onValueChange}>
      <SelectTrigger className="cursor-pointer">
        <SelectValue placeholder={placeholder ?? "选择色深"} />
      </SelectTrigger>
      <SelectContent>
        {colorDepthOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

