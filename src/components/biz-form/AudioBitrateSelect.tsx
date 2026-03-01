import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_BITRATES } from "@/data/audio_options";
import { cn } from "@/lib/utils";

interface AudioBitrateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  maxBitrate?: number;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioBitrateSelect: React.FC<AudioBitrateSelectProps> = ({
  value,
  onValueChange,
  maxBitrate,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const bitrateOptions = useMemo(() => {
    if (!maxBitrate) return AUDIO_BITRATES;
    return AUDIO_BITRATES.filter(opt => opt.value === "auto" || opt.value <= maxBitrate);
  }, [maxBitrate]);

  useEffect(() => {
    if (!bitrateOptions || !bitrateOptions.length) return;
    if (!bitrateOptions.some(opt => opt.value === value)) {
      onValueChange(bitrateOptions[0].value);
    }
  }, [bitrateOptions, value]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? "Select bitrate"} />
        </SelectTrigger>
        <SelectContent>
          {bitrateOptions.map((rate) => (
            <SelectItem key={rate.value} value={rate.value}>
              {rate.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
