import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ColorRangeSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  autoLabel?: string;
  limitedLabel?: string;
  fullLabel?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const ColorRangeSelect: React.FC<ColorRangeSelectProps> = ({
  value,
  onValueChange,
  placeholder = "Color Range",
  autoLabel = "Auto",
  limitedLabel = "Limited (TV/MPEG)",
  fullLabel = "Full (PC/JPEG)",
  label,
  hideLabel = true,
  className,
}) => {
  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{autoLabel}</SelectItem>
          <SelectItem value="limited">{limitedLabel}</SelectItem>
          <SelectItem value="full">{fullLabel}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
