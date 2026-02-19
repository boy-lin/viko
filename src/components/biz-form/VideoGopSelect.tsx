import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectOption } from "@/types/options";

const DEFAULT_GOP_OPTIONS: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "12", label: "12" },
  { value: "15", label: "15" },
  { value: "18", label: "18" },
  { value: "24", label: "24" },
  { value: "30", label: "30" },
  { value: "48", label: "48" },
  { value: "60", label: "60" },
  { value: "120", label: "120" },
  { value: "250", label: "250" },
];

interface VideoGopSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
}

export const VideoGopSelect: React.FC<VideoGopSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
}) => {
  const gopOptions = options ?? DEFAULT_GOP_OPTIONS;

  return (
    <Select value={value ?? "auto"} onValueChange={onValueChange}>
      <SelectTrigger className="cursor-pointer">
        <SelectValue placeholder={placeholder ?? "选择 GOP"} />
      </SelectTrigger>
      <SelectContent>
        {gopOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

