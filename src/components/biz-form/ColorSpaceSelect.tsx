import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLOR_SPACES } from "@/data/video_options";
import type { ColorSpaceOption } from "@/types/options";

interface ColorSpaceSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options?: ColorSpaceOption[];
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
  options,
  label,
  hideLabel = true,
  className,
}) => {
  const colorSpaceOptions = options ?? COLOR_SPACES;

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer">
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
