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

const DEFAULT_BIT_DEPTH_OPTIONS: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "16", label: "16-bit" },
  { value: "24", label: "24-bit" },
  { value: "32", label: "32-bit" },
];

interface AudioBitDepthSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioBitDepthSelect: React.FC<AudioBitDepthSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const bitDepthOptions = options ?? DEFAULT_BIT_DEPTH_OPTIONS;
  const placeholderText = placeholder ?? "Select bit depth";

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer">
          <SelectValue placeholder={placeholderText} />
        </SelectTrigger>
        <SelectContent>
          {bitDepthOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
