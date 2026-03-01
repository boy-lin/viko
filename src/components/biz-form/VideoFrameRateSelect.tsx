import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIDEO_FRAME_RATES } from "@/data/capabilities";
import { cn } from "@/lib/utils";

interface VideoFrameRateSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  maxFrameRate?: number;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoFrameRateSelect: React.FC<VideoFrameRateSelectProps> = ({
  value,
  onValueChange,
  maxFrameRate,
  label,
  hideLabel = true,
  className,
}) => {
  const frameRateOptions = useMemo(() => {
    return maxFrameRate ? VIDEO_FRAME_RATES.filter((option) => option.value === "auto" || Number(option.value) <= maxFrameRate) : VIDEO_FRAME_RATES;
  }, [maxFrameRate]);

  useEffect(() => {
    if (value && !frameRateOptions.some((option) => option.value === value)) {
      onValueChange("auto");
    }
  }, [frameRateOptions, value, onValueChange])

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
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
