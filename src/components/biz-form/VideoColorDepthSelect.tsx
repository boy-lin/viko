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
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoColorDepthSelect: React.FC<VideoColorDepthSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const colorDepthOptions = options ?? DEFAULT_COLOR_DEPTH_OPTIONS;

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
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
    </div>
  );
};

