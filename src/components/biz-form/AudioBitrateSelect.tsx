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
import { AUDIO_BITRATES } from "@/data/audio_options";

interface AudioBitrateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

export const AudioBitrateSelect: React.FC<AudioBitrateSelectProps> = ({
  value,
  onValueChange,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Bit Rate :</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select bitrate" />
        </SelectTrigger>
        <SelectContent>
          {AUDIO_BITRATES.map((rate) => (
            <SelectItem key={rate.value} value={rate.value}>
              {rate.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
