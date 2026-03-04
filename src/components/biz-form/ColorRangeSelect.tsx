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
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const COLOR_RANGES = [
  { value: "auto", label: "Auto", labelKey: "video_advance.auto" },
  { value: "limited", label: "Limited (TV/MPEG)", labelKey: "video_advance.limited" },
  { value: "full", label: "Full (PC/JPEG)", labelKey: "video_advance.full" },
];
interface ColorRangeSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedColorRanges?: string[];
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

const COLOR_RANGE_HELP =
  "Color range controls luminance mapping. Full is common for computer graphics, limited is common for TV/video workflows.";

export const ColorRangeSelect: React.FC<ColorRangeSelectProps> = ({
  value,
  onValueChange,
  allowedColorRanges,
  placeholder = "Color Range",
  label,
  helpText,
  hideLabel = true,
  className,
}) => {

  const { t } = useTranslation("common");
  const options = useMemo(() => {
    if (!allowedColorRanges || allowedColorRanges.length === 0) {
      return COLOR_RANGES;
    }
    return COLOR_RANGES.filter((option) => allowedColorRanges.includes(option.value));
  }, [allowedColorRanges]);

  useEffect(() => {
    const current = value ?? "auto";
    if (!options.some((option) => option.value === current)) {
      onValueChange(options[0]?.value ?? "auto");
    }
  }, [onValueChange, options, value]);

  return (
    <div className={cn(className, "space-y-2")}>
      {!hideLabel && label && (
        <div className="flex items-center gap-1">
          <Label>{label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? COLOR_RANGE_HELP}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.labelKey, option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
