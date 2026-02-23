import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_CHANNELS } from "@/data/audio_options";
import type { SelectOption } from "@/types/options";

interface AudioChannelSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
}

export const AudioChannelSelect: React.FC<AudioChannelSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
}) => {
  const channelOptions = options ?? AUDIO_CHANNELS;

  return (
    <Select value={value ?? "auto"} onValueChange={onValueChange}>
      <SelectTrigger className="cursor-pointer">
        <SelectValue placeholder={placeholder ?? "Select channels"} />
      </SelectTrigger>
      <SelectContent>
        {channelOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
