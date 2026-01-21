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

interface VideoResolutionSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
}

export const VideoResolutionSelect: React.FC<VideoResolutionSelectProps> = ({
  value,
  onValueChange,
  options,
}) => {
  const resolutionOptions = options ?? [
    { value: "auto", label: "auto" },
    { value: "7680x4320", label: "7680x4320" },
    { value: "3840x2160", label: "3840x2160" },
    { value: "1920x1080", label: "1920x1080" },
    { value: "1280x720", label: "1280x720" },
    { value: "720x576", label: "720x576" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Resolution :</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select resolution" />
        </SelectTrigger>
        <SelectContent>
          {resolutionOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
