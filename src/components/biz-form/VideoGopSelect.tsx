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
import { GOP_OPTIONS } from "@/data/video_options";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";


interface VideoGopSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
  gopOptions?: string[];
}

export const VideoGopSelect: React.FC<VideoGopSelectProps> = ({
  value,
  onValueChange,
  placeholder,
  label,
  helpText,
  hideLabel = true,
  className,
  gopOptions,
}) => {
  const { t } = useTranslation("task");
  const options = useMemo(() => {
    const source = gopOptions ? gopOptions : GOP_OPTIONS.map((option) => option.value as string);
    return source.map((value) => ({ value, label: value }));
  }, [gopOptions]);

  useEffect(() => {
    if (value && !options.some((option) => option.value === value)) {
      onValueChange("auto");
    }
  }, [options, value])

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("bizForm.videoGop.label")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.video.fields.keyframeIntervalHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? t("bizForm.videoGop.placeholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem key="auto" value="auto">
            Auto
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
