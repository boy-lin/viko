import React from "react";
import { Label } from "@/components/ui/label";
import { AUDIO_ENCODERS } from "@/data/encoders";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AudioEncoderEnum } from "@/types/options";

interface AudioEncoderSelectProps {
  allowedEncoders?: AudioEncoderEnum[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioEncoderSelect: React.FC<AudioEncoderSelectProps> = ({
  allowedEncoders,
  value,
  onValueChange,
  placeholder,
  label,
  hideLabel = true,
  className,
}) => {
  const filteredEncoders = allowedEncoders && allowedEncoders.length 
  ? AUDIO_ENCODERS.filter((encoder) => allowedEncoders.includes(encoder.value)) 
  : AUDIO_ENCODERS;

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer">
          <SelectValue placeholder={placeholder ?? "Select encoder"} />
        </SelectTrigger>
        <SelectContent>
          {filteredEncoders.map((encoder) => (
            <SelectItem key={encoder.value} value={encoder.value}>
              {encoder.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
