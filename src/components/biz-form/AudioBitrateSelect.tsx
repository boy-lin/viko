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
import { AUDIO_BITRATES } from "@/data/audio_options";
import { cn } from "@/lib/utils";

interface AudioBitrateSelectProps {
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

const DEFAULT_LABEL = "音频码率";
const DEFAULT_PLACEHOLDER = "输入码率 (kbps)";
const BITRATE_HELP = "控制音频数据密度。数值越高通常保真更好，但体积与处理开销也可能增加。";

export const AudioBitrateSelect: React.FC<AudioBitrateSelectProps> = ({
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
  const effectiveValue = value ?? "auto";
  const bitrateOptions = useMemo(() => {
    return AUDIO_BITRATES.filter((option) => {
      if (option.value === "auto") return true;
      const numeric = Number(option.value);
      if (!Number.isFinite(numeric)) return false;
      if (minBitrate !== undefined && numeric < minBitrate) return false;
      if (maxBitrate !== undefined && numeric > maxBitrate) return false;
      return true;
    });
  }, [maxBitrate, minBitrate]);

  const parsedNumericValue = effectiveValue !== "auto" ? Number(effectiveValue) : undefined;
  const numericValue = parsedNumericValue !== undefined && Number.isFinite(parsedNumericValue)
    ? parsedNumericValue
    : undefined;
  const clampedNumericValue = numericValue === undefined
    ? undefined
    : Math.min(
      maxBitrate ?? Number.MAX_SAFE_INTEGER,
      Math.max(minBitrate ?? 0, numericValue),
    );
  const selectValue = bitrateOptions.some((option) => option.value === effectiveValue) ? effectiveValue : "auto";

  useEffect(() => {
    if (numericValue !== undefined && clampedNumericValue !== numericValue) {
      onValueChange(String(clampedNumericValue));
    }
  }, [clampedNumericValue, numericValue, onValueChange]);

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
              {helpText ?? BITRATE_HELP}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <InputGroup>
        <CorrectNumberInput
          min={minBitrate}
          max={maxBitrate}
          step={0.1}
          placeholder={placeholder ?? DEFAULT_PLACEHOLDER}
          value={clampedNumericValue}
          onChange={(nextValue) => {
            const clamped = Math.min(
              maxBitrate ?? Number.MAX_SAFE_INTEGER,
              Math.max(minBitrate ?? 0, nextValue),
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
              <SelectValue placeholder="常用值" />
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
