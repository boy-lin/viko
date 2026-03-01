import React, { useEffect } from "react";
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
import { cn } from "@/lib/utils";

interface AudioEncoderSelectProps {
  allowedEncoders?: AudioEncoderEnum[];
  value?: AudioEncoderEnum;
  onValueChange: (value: AudioEncoderEnum) => void;
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
  const filteredEncoders = React.useMemo(() => {
    return allowedEncoders && allowedEncoders.length
      ? AUDIO_ENCODERS.filter((encoder) => allowedEncoders.includes(encoder.value) || encoder.value === "auto")
      : AUDIO_ENCODERS;
  }, [allowedEncoders]);

  useEffect(() => {
    console.log("filteredEncoders", value, allowedEncoders);

    if (!allowedEncoders || !allowedEncoders.length) return;

    if (!value || !allowedEncoders.includes(value)) {

      onValueChange(allowedEncoders[0]);
    }
  }, [allowedEncoders, value]);
  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
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
