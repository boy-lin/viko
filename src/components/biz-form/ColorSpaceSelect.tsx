import React from "react";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLOR_SPACES } from "@/data/video_options";

interface ColorSpaceSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
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
}) => {
  return (
    <div className="space-y-2 w-1/2 pr-4">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Color Space</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select color space" />
        </SelectTrigger>
        <SelectContent>
          {COLOR_SPACES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
