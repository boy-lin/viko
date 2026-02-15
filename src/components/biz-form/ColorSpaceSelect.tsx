import React from "react";
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
}) => {
  const colorSpaceOptions = options ?? COLOR_SPACES;

  return (

    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
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
  );
};
