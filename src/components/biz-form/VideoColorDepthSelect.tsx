import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLOR_DEPTHS } from "@/data/video_options";
import { useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";

interface VideoColorDepthSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedColorDepths?: number[];
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoColorDepthSelect: React.FC<VideoColorDepthSelectProps> = ({
  value,
  onValueChange,
  allowedColorDepths,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const colorDepthOptions = useMemo(() => {
    return allowedColorDepths?.map((value) => {
      const option = COLOR_DEPTHS.find((option) => option.value === String(value));
      return option ?? { value: String(value), label: String(value) };
    }) ?? COLOR_DEPTHS;
  }, [allowedColorDepths])

  useEffect(() => {
    if (value && !colorDepthOptions.some((e) => e.value === value)) {
      onValueChange(colorDepthOptions[0].value);
    }
  }, [colorDepthOptions, value])

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? "选择色深"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem key="auto" value="auto">
            Auto
          </SelectItem>
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

