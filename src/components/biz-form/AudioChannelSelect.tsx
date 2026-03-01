import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_CHANNELS } from "@/data/audio_options";
import { cn } from "@/lib/utils";

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
  const channelOptions = useMemo(() => {
    if (!allowedChannels || !allowedChannels.length) return AUDIO_CHANNELS;
    return AUDIO_CHANNELS.filter(opt => allowedChannels.includes(opt.value));
  }, [allowedChannels]);

  useEffect(() => {
    if (!channelOptions || !channelOptions.length) return;
    if (!channelOptions.some(opt => opt.value === value)) {
      onValueChange(channelOptions[0].value);
    }
  }, [channelOptions, value]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
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
