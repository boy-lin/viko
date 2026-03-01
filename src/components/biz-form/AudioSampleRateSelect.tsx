import React, { useMemo, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIO_SAMPLE_RATES } from "@/data/audio_options";
import { cn } from "@/lib/utils";

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
  const rateOptions = useMemo(() => {
    if (!maxSampleRate) return AUDIO_SAMPLE_RATES;
    return AUDIO_SAMPLE_RATES.filter(opt => opt.value === "auto" || opt.value <= maxSampleRate);
  }, [maxSampleRate]);

  useEffect(() => {
    if (!rateOptions || !rateOptions.length) return;
    if (!rateOptions.some(opt => opt.value === value)) {
      onValueChange(rateOptions[0].value);
    }
  }, [rateOptions]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
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
