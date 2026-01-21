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

interface VideoBitrateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
}

export const VideoBitrateSelect: React.FC<VideoBitrateSelectProps> = ({
  value,
  onValueChange,
  options,
}) => {
  const bitrateOptions = options ?? [
    { value: "auto", label: "Smart Fit" },
    { value: "5000", label: "5000 kbps" },
    { value: "2000", label: "2000 kbps" },
    { value: "1000", label: "1000 kbps" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Bit Rate :</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select bitrate" />
        </SelectTrigger>
        <SelectContent>
          {bitrateOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
