import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { RESOLUTION_OPTIONS, ResolutionGroup } from "@/data/resolution";
import { cn } from "@/lib/utils";

interface VideoResolutionSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  groups?: ResolutionGroup[];
  className?: string;
  placeholder?: string;
}

export const VideoResolutionSelect: React.FC<VideoResolutionSelectProps> = ({
  value,
  onValueChange,
  groups = RESOLUTION_OPTIONS,
  className,
  placeholder = "Select resolution",
}) => {
  return (
    <Select value={value || "auto"} onValueChange={onValueChange}>
      <SelectTrigger className={cn("w-[12em]", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {
          groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))
        }
      </SelectContent>
    </Select>
  );
};
