import React from "react";
import { Label } from "@/components/ui/label";
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
  wrapperClassName?: string;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
}

export const VideoResolutionSelect: React.FC<VideoResolutionSelectProps> = ({
  value,
  onValueChange,
  groups = RESOLUTION_OPTIONS,
  className,
  wrapperClassName,
  placeholder = "Select resolution",
  label,
  hideLabel = true,
}) => {
  return (
    <div className={wrapperClassName ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
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
    </div>
  );
};
