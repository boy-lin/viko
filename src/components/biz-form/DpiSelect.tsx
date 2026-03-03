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
import { cn } from "@/lib/utils";

const DEFAULT_DPI_OPTIONS = [72, 96, 150, 300, 600];

interface DpiSelectProps {
  value?: number;
  onValueChange: (value?: number) => void;
  options?: number[];
  minDpi?: number;
  maxDpi?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  autoLabel?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
}

const DEFAULT_LABEL = "DPI";
const DEFAULT_PLACEHOLDER = "输入 DPI";
const DEFAULT_HELP_TEXT = "DPI 影响打印密度元数据，不改变像素尺寸。";

export const DpiSelect: React.FC<DpiSelectProps> = ({
  value,
  onValueChange,
  options = DEFAULT_DPI_OPTIONS,
  minDpi,
  maxDpi,
  step = 1,
  className,
  placeholder,
  autoLabel = "自动",
  label,
  helpText,
  hideLabel = true,
}) => {
  const optionItems = useMemo(() => {
    const dedup = new Set<number>(options.filter((n) => Number.isFinite(n)));
    if (typeof value === "number" && Number.isFinite(value)) {
      dedup.add(value);
    }
    return Array.from(dedup)
      .sort((a, b) => a - b)
      .map((n) => ({ value: String(n), label: String(n) }));
  }, [options, value]);

  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const clampedValue = numericValue === undefined
    ? undefined
    : Math.min(
      maxDpi ?? Number.MAX_SAFE_INTEGER,
      Math.max(minDpi ?? 0, numericValue),
    );
  const selectValue = optionItems.some((item) => item.value === String(value))
    ? String(value)
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
          <Label>{label ?? DEFAULT_LABEL}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? DEFAULT_HELP_TEXT}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <InputGroup>
        <CorrectNumberInput
          min={minDpi}
          max={maxDpi}
          step={step}
          placeholder={placeholder ?? DEFAULT_PLACEHOLDER}
          value={clampedValue}
          onChange={(nextValue) => {
            const clamped = Math.min(
              maxDpi ?? Number.MAX_SAFE_INTEGER,
              Math.max(minDpi ?? 0, nextValue),
            );
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
              <SelectValue placeholder="常用值" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{autoLabel}</SelectItem>
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
