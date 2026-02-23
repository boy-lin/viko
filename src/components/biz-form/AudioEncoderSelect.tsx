import React from "react";
import { AUDIO_ENCODERS } from "@/data/encoders";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatToDefinition } from "@/data/capabilities";
import { EncoderEnum } from "@/types/options";

interface AudioEncoderSelectProps {
  format?: string;
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export const AudioEncoderSelect: React.FC<AudioEncoderSelectProps> = ({
  format,
  value,
  onValueChange,
  placeholder,
}) => {
  const filteredEncoders = React.useMemo(() => {
    if (!format) return AUDIO_ENCODERS;
    const containerDefinition = formatToDefinition.get(format);
    if (!containerDefinition) {
      return AUDIO_ENCODERS;
    }
    return AUDIO_ENCODERS.filter((encoder) => {
      return containerDefinition.audio?.allowedEncoders.includes(encoder.value as EncoderEnum);
    });
  }, [format]);

  return (
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
  );
};
