import React from "react";
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
  placeholder?: string;
}

export const AudioSampleRateSelect: React.FC<AudioSampleRateSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
}) => {
  const rateOptions = options ?? AUDIO_SAMPLE_RATES;

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="cursor-pointer">
        <SelectValue placeholder={placeholder ?? "Select sample rate"} />
      </SelectTrigger>
      <SelectContent>
        {rateOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
