import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_CHANNELS } from "@/data/audio_options";

interface AudioChannelSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedChannels?: string[];
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioChannelSelect: React.FC<AudioChannelSelectProps> = ({
  value,
  onValueChange,
  allowedChannels,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const channelOptions = allowedChannels && allowedChannels.length > 0
    ? AUDIO_CHANNELS.filter(opt => allowedChannels.includes(opt.value))
    : AUDIO_CHANNELS;

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
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
    </div>
  );
};
