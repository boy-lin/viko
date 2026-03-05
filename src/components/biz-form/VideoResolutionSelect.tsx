import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { BadgeQuestionMark } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RESOLUTION_OPTIONS } from "@/data/resolution";
import { cn } from "@/lib/utils";

interface VideoResolutionSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  maxResolution?: [number, number];
  className?: string;
  wrapperClassName?: string;
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  showNumberInput?: boolean;
}

const parseResolution = (value?: string): { width: number; height: number } | null => {
  if (!value || value === "auto") return null;
  const [w, h] = value.split("x").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { width: Math.round(w), height: Math.round(h) };
};

export const VideoResolutionSelect: React.FC<VideoResolutionSelectProps> = ({
  value,
  onValueChange,
  maxResolution,
  className,
  wrapperClassName,
  placeholder = "Select resolution",
  label,
  helpText,
  hideLabel = false,
  showNumberInput = true,
}) => {
  const groups = useMemo(() => {
    if (!maxResolution) return RESOLUTION_OPTIONS;
    return RESOLUTION_OPTIONS.filter((group) => {
      return group.options.some((opt) => {
        if (opt.value === "auto") return true;
        const [width, height] = opt.value.split("x").map((v) => parseInt(v));
        return width <= maxResolution[0] && height <= maxResolution[1];
      });
    });
  }, [maxResolution]);

  const presetValues = useMemo(
    () => groups.flatMap((group) => group.options.map((option) => option.value)),
    [groups],
  );

  const firstPreset = useMemo(
    () => groups.flatMap((group) => group.options).find((option) => option.value !== "auto")?.value,
    [groups],
  );

  const fallbackResolution = useMemo(() => {
    const parsed = parseResolution(firstPreset);
    return parsed ?? { width: 1920, height: 1080 };
  }, [firstPreset]);

  const parsed = parseResolution(value) ?? fallbackResolution;
  const selectedPresetValue =
    value && presetValues.includes(value) ? value : value === "auto" || !value ? "auto" : "custom";

  useEffect(() => {
    const current = value ?? "auto";
    const isPreset = presetValues.includes(current);
    const isCustom = Boolean(parseResolution(current));

    if (isPreset || (showNumberInput && isCustom)) return;
    onValueChange(groups[0]?.options[0]?.value ?? "auto");
  }, [groups, onValueChange, presetValues, showNumberInput, value]);

  const emitResolution = (nextWidth: number, nextHeight: number) => {
    const clampedWidth = Math.max(1, Math.round(nextWidth));
    const clampedHeight = Math.max(1, Math.round(nextHeight));
    onValueChange(`${clampedWidth}x${clampedHeight}`);
  };

  return (
    <div className={wrapperClassName ?? "space-y-2"}>
      {!hideLabel && label && (
        <div className="flex items-center gap-1">
          <Label>{label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">{helpText}</TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select
        value={selectedPresetValue}
        onValueChange={(next) => {
          if (next === "custom") {
            emitResolution(parsed.width, parsed.height);
            return;
          }
          onValueChange(next);
        }}
      >
        <SelectTrigger className={cn("h-7 w-auto px-2 focus-visible:ring-0", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {showNumberInput && <SelectItem value="custom">Custom</SelectItem>}
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
