import React, { useMemo, useEffect } from "react";
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
import { AUDIO_SAMPLE_RATES } from "@/data/audio_options";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface AudioSampleRateSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  minSampleRate?: number;
  maxSampleRate?: number;
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioSampleRateSelect: React.FC<AudioSampleRateSelectProps> = ({
  value,
  onValueChange,
  minSampleRate,
  maxSampleRate,
  placeholder,
  label,
  helpText,
  hideLabel = false,
  className,
}) => {
  const { t } = useTranslation("task");
  const effectiveValue = value ?? "auto";
  const rateOptions = useMemo(() => {
    return AUDIO_SAMPLE_RATES.filter((option) => {
      if (option.value === "auto") return true;
      const numeric = Number(option.value);
      if (!Number.isFinite(numeric)) return false;
      if (minSampleRate !== undefined && numeric < minSampleRate) return false;
      if (maxSampleRate !== undefined && numeric > maxSampleRate) return false;
      return true;
    });
  }, [maxSampleRate, minSampleRate]);

  const parsedNumericValue = effectiveValue !== "auto" ? Number(effectiveValue) : undefined;
  const numericValue = parsedNumericValue !== undefined && Number.isFinite(parsedNumericValue)
    ? parsedNumericValue
    : undefined;
  const clampedNumericValue = numericValue === undefined
    ? undefined
    : Math.min(
      maxSampleRate ?? Number.MAX_SAFE_INTEGER,
      Math.max(minSampleRate ?? 0, numericValue),
    );
  const selectValue = rateOptions.some((option) => option.value === effectiveValue) ? effectiveValue : "auto";

  useEffect(() => {
    if (numericValue !== undefined && clampedNumericValue !== numericValue) {
      onValueChange(String(clampedNumericValue));
    }
  }, [clampedNumericValue, numericValue, onValueChange]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <InputGroup>
        <CorrectNumberInput
          min={minSampleRate}
          max={maxSampleRate}
          step={100}
          placeholder={placeholder}
          value={clampedNumericValue}
          onChange={(nextValue) => {
            const clamped = Math.min(
              maxSampleRate ?? Number.MAX_SAFE_INTEGER,
              Math.max(minSampleRate ?? 0, nextValue),
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
              <SelectValue placeholder={t("bizForm.common.commonValues")} />
              </SelectTrigger>
            <SelectContent>
              {rateOptions.map((option) => (
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
