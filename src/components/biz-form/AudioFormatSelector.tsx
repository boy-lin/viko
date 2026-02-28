import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_FORMAT_OPTIONS } from "@/data/formats";

interface AudioFormatSelectorProps {
  value?: string;
  onValueChange: (value?: string) => void;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioFormatSelector: React.FC<AudioFormatSelectorProps> = ({
  value,
  onValueChange,
  placeholder,
  label = "输出格式",
  hideLabel = false,
  className,
}) => {
  const selectValue = value ?? "auto";

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && <Label>{label}</Label>}
      <Select
        value={selectValue}
        onValueChange={(next) => onValueChange(next === "auto" ? undefined : next)}
      >
        <SelectTrigger className="cursor-pointer">
          <SelectValue placeholder={placeholder ?? "选择音频格式"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">自动</SelectItem>
          {AUDIO_FORMAT_OPTIONS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
