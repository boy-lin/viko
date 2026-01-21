import React from "react";
import { AUDIO_ENCODERS } from "@/data/encoders";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AudioEncoderSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  format?: string;
}

export const AudioEncoderSelect: React.FC<AudioEncoderSelectProps> = ({
  value,
  onValueChange,
  format,
}) => {
  const filteredEncoders = React.useMemo(() => {
    if (!format) return AUDIO_ENCODERS;
    return AUDIO_ENCODERS.filter((encoder) => {
      if (encoder.formats) {
        return encoder.formats.includes(format.toLowerCase());
      }
      return true;
    });
  }, [format]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Encoder :</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select encoder" />
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
