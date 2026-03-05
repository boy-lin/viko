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
import { VIDEO_FRAME_RATES } from "@/data/capabilities";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface VideoFrameRateSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  maxFrameRate?: number;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoFrameRateSelect: React.FC<VideoFrameRateSelectProps> = ({
  value,
  onValueChange,
  maxFrameRate,
  label,
  helpText,
  hideLabel = false,
  className,
}) => {
  const { t } = useTranslation("task");
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
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("video_advance.frame_rate")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.video.fields.frameRateHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
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
