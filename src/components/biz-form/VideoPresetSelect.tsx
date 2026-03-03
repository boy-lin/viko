import React from "react";
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
import type { SelectOption } from "@/types/options";
import { VIDEO_PRESETS } from "@/data/video_options";
import { cn } from "@/lib/utils";

interface VideoPresetSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

const DEFAULT_LABEL = "压缩模式";
const DEFAULT_PLACEHOLDER = "选择压缩模式";
const PRESET_HELP = "控制编码器速度与压缩倾向。更快通常处理更省时，更慢通常更有利于压缩率。";

export const VideoPresetSelect: React.FC<VideoPresetSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  helpText,
  hideLabel = true,
  className,
}) => {
  const presetOptions = options ?? VIDEO_PRESETS;

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? DEFAULT_LABEL}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? PRESET_HELP}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? DEFAULT_PLACEHOLDER} />
        </SelectTrigger>
        <SelectContent>
          {presetOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

