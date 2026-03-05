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
import {
  InputGroup,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import CorrectNumberInput from "@/components/ui-lab/correct-number-input";
import { VIDEO_BITRATES } from "@/data/video_options";
import { cn, parseOptionalInt } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface VideoBitrateSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  minBitrate?: number;
  maxBitrate?: number;
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoBitrateSelect: React.FC<VideoBitrateSelectProps> = ({
  value,
  onValueChange,
  minBitrate,
  maxBitrate,
  placeholder,
  label,
  helpText,
  hideLabel = false,
  className,
}) => {
  const { t } = useTranslation("task");
  const bitrateOptions = useMemo(() => {
    return VIDEO_BITRATES.filter((option) => {
      if (option.value === "auto") return true;
      const numeric = Number(option.value);
      if (!Number.isFinite(numeric)) return false;
      if (minBitrate !== undefined && numeric < minBitrate) return false;
      if (maxBitrate !== undefined && numeric > maxBitrate) return false;
      return true;
    });
  }, [maxBitrate, minBitrate]);

  const numericValue = value && value !== "auto" ? parseOptionalInt(value) : undefined;
  const clampedNumericValue = numericValue === undefined
    ? undefined
    : Math.min(
      maxBitrate ?? Number.MAX_SAFE_INTEGER,
      Math.max(minBitrate ?? 0, numericValue),
    );
  const selectValue = value && bitrateOptions.some((option) => option.value === value) ? value : "auto";

  useEffect(() => {
    if (numericValue !== undefined && clampedNumericValue !== numericValue) {
      onValueChange(String(clampedNumericValue));
    }
  }, [clampedNumericValue, numericValue]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("video_advance.bitrate")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.video.fields.bitrateHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <InputGroup>
        <CorrectNumberInput
          min={minBitrate}
          max={maxBitrate}
          step={100}
          placeholder={placeholder ?? t("bizForm.videoBitrate.inputPlaceholder")}
          value={clampedNumericValue}
          className="max-w-[6em]"
          onChange={(nextValue) => {
            const parsed = nextValue;
            if (parsed === undefined) return;
            const clamped = Math.min(
              maxBitrate ?? Number.MAX_SAFE_INTEGER,
              Math.max(minBitrate ?? 0, parsed),
            );
            onValueChange(String(clamped));
          }}
        />
        <InputGroupAddon align="inline-end" className="pr-1">
          <Select
            value={selectValue}
            onValueChange={(next) => onValueChange(next)}
          >
            <SelectTrigger className="h-7 w-[6em] border-0 bg-transparent px-2 shadow-none focus-visible:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bitrateOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
};
