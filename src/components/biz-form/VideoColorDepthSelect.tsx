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
import { COLOR_DEPTHS } from "@/data/video_options";
import { useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface VideoColorDepthSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedColorDepths?: number[];
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoColorDepthSelect: React.FC<VideoColorDepthSelectProps> = ({
  value,
  onValueChange,
  allowedColorDepths,
  placeholder,
  label,
  helpText,
  hideLabel = true,
  className,
}) => {
  const { t } = useTranslation("task");
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
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("bizForm.videoColorDepth.label")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.video.fields.colorDepthHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? t("bizForm.videoColorDepth.placeholder")} />
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

