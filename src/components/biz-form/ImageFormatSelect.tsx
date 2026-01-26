import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IMAGE_FORMATS } from "@/data/formats";

interface ImageFormatSelectProps {
  value?: string;
  onValueChange: (value?: string) => void;
  label?: string;
}

const FORMAT_OPTIONS = IMAGE_FORMATS.map((format) => ({
  value: format,
  label: format.toUpperCase(),
}));

export const ImageFormatSelect: React.FC<ImageFormatSelectProps> = ({
  value,
  onValueChange,
  label = "输出格式",
}) => {
  const selectValue = value ?? "auto";

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={selectValue}
        onValueChange={(v) => onValueChange(v === "auto" ? undefined : v)}
      >
        <SelectTrigger className="w-full" size="sm">
          <SelectValue placeholder="保持原始" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">保持原始</SelectItem>
          {FORMAT_OPTIONS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
