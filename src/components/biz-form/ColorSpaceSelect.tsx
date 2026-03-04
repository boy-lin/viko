import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { BadgeQuestionMark } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COLOR_SPACES } from "@/data/video_options";
import { cn } from "@/lib/utils";

interface ColorSpaceSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  allowedColorSpaces?: string[];
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

const COLOR_SPACE_HELP =
  "Color space affects color reproduction and compatibility. Use auto unless you need a specific production or HDR workflow.";

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
  helpText,
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
      {!hideLabel && label && (
        <div className="flex items-center gap-1">
          <Label>{label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? COLOR_SPACE_HELP}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
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
