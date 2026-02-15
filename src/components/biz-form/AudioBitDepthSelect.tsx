import React from "react";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectOption } from "@/types/options";

const DEFAULT_BIT_DEPTH_OPTIONS: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "16", label: "16-bit" },
  { value: "24", label: "24-bit" },
  { value: "32", label: "32-bit" },
];

interface AudioBitDepthSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  label?: string;
  placeholder?: string;
}

export const AudioBitDepthSelect: React.FC<AudioBitDepthSelectProps> = ({
  value,
  onValueChange,
  options,
  label,
  placeholder,
}) => {
  const bitDepthOptions = options ?? DEFAULT_BIT_DEPTH_OPTIONS;
  const labelText = label ?? "Bit Depth:";
  const placeholderText = placeholder ?? "Select bit depth";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">{labelText}</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholderText} />
        </SelectTrigger>
        <SelectContent>
          {bitDepthOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
