import React, { useEffect } from "react";
import { BadgeQuestionMark } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import CorrectNumberInput from "@/components/ui-lab/correct-number-input";
import { cn } from "@/lib/utils";

interface GifLoopCountGroupProps {
  value?: number;
  onValueChange: (value?: number) => void;
  minLoopCount?: number;
  maxLoopCount?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
}

export const GifLoopCountGroup: React.FC<GifLoopCountGroupProps> = ({
  value,
  onValueChange,
  minLoopCount = 0,
  maxLoopCount,
  step = 1,
  className,
  placeholder,
  label,
  helpText,
  hideLabel = false,
}) => {
  const { t } = useTranslation("task");
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const clampedValue = numericValue === undefined
    ? undefined
    : Math.min(
      maxLoopCount ?? Number.MAX_SAFE_INTEGER,
      Math.max(minLoopCount, numericValue),
    );

  useEffect(() => {
    if (numericValue !== undefined && clampedValue !== numericValue) {
      onValueChange(clampedValue);
    }
  }, [clampedValue, numericValue, onValueChange]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("settings.gif.fields.loopCount")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.gif.fields.loopCountHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <CorrectNumberInput
        min={minLoopCount}
        max={maxLoopCount}
        step={step}
        placeholder={placeholder ?? t("settings.gif.placeholders.loopCount")}
        value={clampedValue}
        onChange={(nextValue) => {
          const clamped = Math.min(
            maxLoopCount ?? Number.MAX_SAFE_INTEGER,
            Math.max(minLoopCount, nextValue),
          );
          onValueChange(clamped);
        }}
      />
    </div>
  );
};
