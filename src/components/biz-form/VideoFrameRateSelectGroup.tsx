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
import { VIDEO_FRAME_RATES } from "@/data/capabilities";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface VideoFrameRateSelectGroupProps {
  value?: string;
  onValueChange: (value?: string) => void;
  maxFrameRate?: number;
  minFrameRate?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  autoLabel?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
}

export const VideoFrameRateSelectGroup: React.FC<VideoFrameRateSelectGroupProps> = ({
  value,
  onValueChange,
  maxFrameRate,
  minFrameRate = 1,
  step = 1,
  className,
  placeholder,
  autoLabel,
  label,
  helpText,
  hideLabel = false,
}) => {
  const { t } = useTranslation("task");
  const resolvedAutoLabel = autoLabel ?? t("common.auto");

  const numericValue = useMemo(() => {
    if (!value || value === "auto") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [value]);

  const optionItems = useMemo(() => {
    const dedup = new Map<string, string>();

    VIDEO_FRAME_RATES.forEach((option) => {
      if (option.value === "auto") return;
      const parsed = Number(option.value);
      if (!Number.isFinite(parsed)) return;
      if (parsed < minFrameRate) return;
      if (typeof maxFrameRate === "number" && parsed > maxFrameRate) return;
      dedup.set(option.value, option.label);
    });

    if (typeof numericValue === "number" && numericValue >= minFrameRate) {
      if (typeof maxFrameRate !== "number" || numericValue <= maxFrameRate) {
        const key = String(numericValue);
        if (!dedup.has(key)) {
          dedup.set(key, `${key} FPS`);
        }
      }
    }

    return Array.from(dedup.entries())
      .map(([itemValue, itemLabel]) => ({
        value: itemValue,
        label: itemLabel,
        numeric: Number(itemValue),
      }))
      .sort((a, b) => a.numeric - b.numeric)
      .map(({ value: itemValue, label: itemLabel }) => ({
        value: itemValue,
        label: itemLabel,
      }));
  }, [maxFrameRate, minFrameRate, numericValue]);

  const clampedValue = numericValue === undefined
    ? undefined
    : Math.min(
      maxFrameRate ?? Number.MAX_SAFE_INTEGER,
      Math.max(minFrameRate, numericValue),
    );

  const selectValue = optionItems.some((item) => item.value === value)
    ? String(value)
    : "auto";

  useEffect(() => {
    if (numericValue !== undefined && clampedValue !== numericValue) {
      onValueChange(String(clampedValue));
    }
  }, [clampedValue, numericValue, onValueChange]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("video_advance.frame_rate")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.video.fields.frameRateHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <InputGroup>
        <CorrectNumberInput
          min={0}
          max={maxFrameRate}
          step={step}
          placeholder={placeholder ?? t("settings.video.placeholders.frameRate", "Frame rate")}
          value={clampedValue}
          className="text-sm"
          onChange={(nextValue) => {
            if (!Number.isFinite(nextValue) || nextValue <= 0) {
              onValueChange(undefined);
              return;
            }
            const clamped = Math.min(
              maxFrameRate ?? Number.MAX_SAFE_INTEGER,
              Math.max(minFrameRate, nextValue),
            );
            onValueChange(String(clamped));
          }}
        />
        <InputGroupAddon align="inline-end" className="pr-1 flex-1 max-w-3/5">
          <Select
            value={selectValue}
            onValueChange={(next) => {
              if (next === "auto") {
                onValueChange(undefined);
                return;
              }
              onValueChange(next);
            }}
          >
            <SelectTrigger className="h-7 w-full border-0 bg-transparent px-2 shadow-none focus-visible:ring-0">
              <SelectValue placeholder={t("bizForm.common.commonValues")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{resolvedAutoLabel}</SelectItem>
              {optionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
};

export default VideoFrameRateSelectGroup;
