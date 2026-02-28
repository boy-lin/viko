import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_BITRATES } from "@/data/audio_options";

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
  const bitrateOptions = maxBitrate ? AUDIO_BITRATES.filter(opt => opt.value === "auto" || opt.value <= maxBitrate) : AUDIO_BITRATES;

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer">
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
