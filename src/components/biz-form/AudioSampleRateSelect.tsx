import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_SAMPLE_RATES } from "@/data/audio_options";

interface AudioSampleRateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  maxSampleRate?: number;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioSampleRateSelect: React.FC<AudioSampleRateSelectProps> = ({
  value,
  onValueChange,
  maxSampleRate,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const rateOptions = maxSampleRate ? AUDIO_SAMPLE_RATES.filter(opt => opt.value === "auto" || opt.value <= maxSampleRate) : AUDIO_SAMPLE_RATES;

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
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
    </div>
  );
};
