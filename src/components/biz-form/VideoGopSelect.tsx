import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GOP_OPTIONS } from "@/data/video_options";
import { cn } from "@/lib/utils";


interface VideoGopSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
  gopOptions?: string[];
}

export const VideoGopSelect: React.FC<VideoGopSelectProps> = ({
  value,
  onValueChange,
  placeholder,
  label,
  hideLabel = true,
  className,
  gopOptions,
}) => {
  const options = useMemo(() => {
    const source = gopOptions ? gopOptions : GOP_OPTIONS.map((option) => option.value as string);
    return source.map((value) => ({ value, label: value }));
  }, [gopOptions]);

  useEffect(() => {
    if (value && !options.some((option) => option.value === value)) {
      onValueChange("auto");
    }
  }, [options, value])

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? "选择 GOP"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem key="auto" value="auto">
            Auto
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
