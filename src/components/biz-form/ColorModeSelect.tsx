import React, { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const DEFAULT_COLOR_MODES = ["RGB", "RGBA", "Gray", "CMYK"];

interface ColorModeSelectProps {
  value?: string;
  onValueChange: (value?: string) => void;
  options?: string[];
  className?: string;
  placeholder?: string;
  autoLabel?: string;
}

export const ColorModeSelect: React.FC<ColorModeSelectProps> = ({
  value,
  onValueChange,
  options = DEFAULT_COLOR_MODES,
  className,
  placeholder,
  autoLabel,
}) => {
  const { t } = useTranslation("task");
  const resolvedAutoLabel = autoLabel ?? t("common.auto");
  const resolvedPlaceholder = placeholder ?? t("common.auto");
  const mergedOptions = useMemo(() => {
    const normalized = options
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0);
    if (value && !normalized.includes(value)) {
      normalized.push(value);
    }
    return normalized;
  }, [options, value]);

  const selectValue = value ?? "auto";

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => {
        onValueChange(next === "auto" ? undefined : next);
      }}
    >
      <SelectTrigger className={cn("w-full", className)} size="sm">
        <SelectValue placeholder={resolvedPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">{resolvedAutoLabel}</SelectItem>
        {mergedOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
