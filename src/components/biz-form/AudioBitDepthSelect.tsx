import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
const DEFAULT_BIT_DEPTH_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "16", label: "16-bit" },
  { value: "24", label: "24-bit" },
  { value: "32", label: "32-bit" },
];

interface AudioBitDepthSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedBitDepths?: number[];
  autoLabel?: string;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioBitDepthSelect: React.FC<AudioBitDepthSelectProps> = ({
  value,
  onValueChange,
  allowedBitDepths,
  autoLabel,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const bitDepthOptions = useMemo(() => {
    if (!allowedBitDepths || allowedBitDepths.length === 0) {
      return [
        { ...DEFAULT_BIT_DEPTH_OPTIONS[0], label: autoLabel ?? "Auto" },
        ...DEFAULT_BIT_DEPTH_OPTIONS.slice(1),
      ];
    }
    const sorted = [...allowedBitDepths]
      .filter((bitDepth) => Number.isFinite(bitDepth) && bitDepth > 0)
      .sort((left, right) => left - right);
    return [
      { value: "auto", label: autoLabel ?? "Auto" },
      ...sorted.map((bitDepth) => ({
        value: String(bitDepth),
        label: `${bitDepth}-bit`,
      })),
    ];
  }, [allowedBitDepths, autoLabel]);

  useEffect(() => {
    if (!bitDepthOptions.length) return;
    if (!bitDepthOptions.some((option) => option.value === value)) {
      onValueChange(bitDepthOptions[0].value);
    }
  }, [bitDepthOptions, onValueChange, value]);

  const placeholderText = placeholder ?? "Select bit depth";

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
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
