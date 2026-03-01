import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLOR_SPACES } from "@/data/video_options";
import { cn } from "@/lib/utils";

interface ColorSpaceSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  allowedColorSpaces?: string[];
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

/**
 * 颜色空间选择组件
 *
 * 注意：当视频编码为 H.264 或 HEVC 时，可以选择 HDR 颜色空间进行导出。
 * 但是，当前模式不支持 GPU 加速。
 */
export const ColorSpaceSelect: React.FC<ColorSpaceSelectProps> = ({
  value = "auto",
  onValueChange,
  allowedColorSpaces,
  label,
  hideLabel = true,
  className,
}) => {
  const colorSpaceOptions = useMemo(() => {
    return allowedColorSpaces ? COLOR_SPACES.filter((option) => allowedColorSpaces.includes(option.value) || option.value === "auto") : COLOR_SPACES;
  }, [allowedColorSpaces]);

  useEffect(() => {
    if (value && !allowedColorSpaces?.includes(value)) {
      onValueChange?.("auto");
    }
  }, [value, allowedColorSpaces]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder="Select color space" />
        </SelectTrigger>
        <SelectContent>
          {colorSpaceOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
