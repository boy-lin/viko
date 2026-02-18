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
import { AUDIO_SAMPLE_RATES } from "@/data/audio_options";
import type { SelectOption } from "@/types/options";

interface AudioSampleRateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
}

export const AudioSampleRateSelect: React.FC<AudioSampleRateSelectProps> = ({
  value,
  onValueChange,
  options,
}) => {
  const rateOptions = options ?? AUDIO_SAMPLE_RATES;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-muted-foreground" />
        <Label className="text-muted-foreground">Sample Rate:</Label>
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer">
          <SelectValue placeholder="Select sample rate" />
        </SelectTrigger>
        <SelectContent>
          {rateOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
