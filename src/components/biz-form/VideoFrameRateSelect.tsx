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

interface VideoFrameRateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
}

export const VideoFrameRateSelect: React.FC<VideoFrameRateSelectProps> = ({
  value,
  onValueChange,
  options,
}) => {
  const frameRateOptions = options ?? [
    { value: "auto", label: "auto" },
    { value: "60", label: "60 FPS" },
    { value: "30", label: "30 FPS" },
    { value: "24", label: "24 FPS" },
    { value: "auto", label: "Smart Fit" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Frame Rate :</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select frame rate" />
        </SelectTrigger>
        <SelectContent>
          {frameRateOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
