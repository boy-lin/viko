import React, { useEffect, useMemo } from "react";
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
import { RESOLUTION_OPTIONS } from "@/data/resolution";
import { cn } from "@/lib/utils";

interface VideoResolutionSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  maxResolution?: [number, number];
  className?: string;
  wrapperClassName?: string;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
}

export const VideoResolutionSelect: React.FC<VideoResolutionSelectProps> = ({
  value,
  onValueChange,
  maxResolution,
  className,
  wrapperClassName,
  placeholder = "Select resolution",
  label,
  hideLabel = true,
}) => {
  const groups = useMemo(() => {
    if (!maxResolution) return RESOLUTION_OPTIONS;
    return RESOLUTION_OPTIONS.filter((group) => {
      return group.options.some((opt) => {
        if (opt.value === "auto") return true;
        const [width, height] = opt.value.split("x").map((v) => parseInt(v));
        return width <= maxResolution[0] && height <= maxResolution[1];
      })
    })
  }, [maxResolution]);

  useEffect(() => {
    const current = value ?? "auto";
    if (!groups.some((group) => group.options.some((option) => option.value === current))) {
      onValueChange(groups[0]?.options[0]?.value ?? "auto");
    }
  }, [groups, value]);

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
