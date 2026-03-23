import React, { useEffect, useMemo } from "react";
import { BadgeQuestionMark } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";

const DEFAULT_GIF_QUALITY_OPTIONS = [100, 90, 80, 70, 60, 50, 40];

interface GifQualityGroupProps {
  value?: number;
  onValueChange: (value?: number) => void;
  options?: number[];
  minQuality?: number;
  maxQuality?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  autoLabel?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
}

export const GifQualityGroup: React.FC<GifQualityGroupProps> = ({
  value,
  onValueChange,
  options = DEFAULT_GIF_QUALITY_OPTIONS,
  minQuality = 1,
  maxQuality = 100,
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
  const optionItems = useMemo(() => {
    const dedup = new Set<number>(options.filter((n) => Number.isFinite(n)));
    if (typeof value === "number" && Number.isFinite(value)) {
      dedup.add(value);
    }
    return Array.from(dedup)
      .sort((a, b) => b - a)
      .map((n) => ({ value: String(n), label: String(n) }));
  }, [options, value]);

  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const clampedValue = numericValue === undefined
    ? undefined
    : Math.min(maxQuality, Math.max(minQuality, numericValue));
  const selectValue = optionItems.some((item) => item.value === String(clampedValue))
    ? String(clampedValue)
    : "auto";

  useEffect(() => {
    if (numericValue !== undefined && clampedValue !== numericValue) {
      onValueChange(clampedValue);
    }
  }, [clampedValue, numericValue, onValueChange]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("settings.image.fields.quality")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.gif.fields.qualityHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <InputGroup>
        <CorrectNumberInput
          min={minQuality}
          max={maxQuality}
          step={step}
          placeholder={placeholder ?? t("settings.gif.placeholders.quality")}
          value={clampedValue}
          onChange={(nextValue) => {
            const clamped = Math.min(maxQuality, Math.max(minQuality, nextValue));
            onValueChange(clamped);
          }}
        />
        <InputGroupAddon align="inline-end" className="pr-1">
          <Select
            value={selectValue}
            onValueChange={(next) => {
              if (next === "auto") {
                onValueChange(undefined);
                return;
              }
              const parsed = Number(next);
              onValueChange(Number.isFinite(parsed) ? parsed : undefined);
            }}
          >
            <SelectTrigger className="h-7 w-[6em] border-0 bg-transparent px-2 shadow-none focus-visible:ring-0">
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
