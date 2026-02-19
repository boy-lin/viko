import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_BITRATES } from "@/data/audio_options";
import type { SelectOption } from "@/types/options";

interface AudioBitrateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
}

export const AudioBitrateSelect: React.FC<AudioBitrateSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
}) => {
  const bitrateOptions = options ?? AUDIO_BITRATES;

  return (
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
  );
};
