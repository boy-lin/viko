import React from "react";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
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
}

export const AudioChannelSelect: React.FC<AudioChannelSelectProps> = ({
  value,
  onValueChange,
  options,
}) => {
  const channelOptions = options ?? AUDIO_CHANNELS;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-muted-foreground" />
        <Label className="text-muted-foreground">Channel:</Label>
      </div>
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer">
          <SelectValue placeholder="Select channels" />
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
