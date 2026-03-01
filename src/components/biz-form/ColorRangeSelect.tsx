import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  hideLabel?: boolean;
  className?: string;
}

export const ColorRangeSelect: React.FC<ColorRangeSelectProps> = ({
  value,
  onValueChange,
  allowedColorRanges,
  placeholder = "Color Range",
  label,
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
      {!hideLabel && label && <Label>{label}</Label>}
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
