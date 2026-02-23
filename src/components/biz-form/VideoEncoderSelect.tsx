import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIDEO_ENCODERS } from "@/data/encoders";
import { EncoderEnum } from "@/types/options";

interface VideoEncoderSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedEncoders?: string[];
}

export const VideoEncoderSelect: React.FC<VideoEncoderSelectProps> = ({
  value,
  onValueChange,
  allowedEncoders,
}) => {

  const filteredEncoders = allowedEncoders
    ? VIDEO_ENCODERS.filter(
      (e) => allowedEncoders.includes(e.value) || e.value === EncoderEnum.AUTO
    )
    : VIDEO_ENCODERS.filter((e) => [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.AUTO].includes(e.value));

  return (
    <Select value={value ?? EncoderEnum.AUTO} onValueChange={onValueChange}>
      <SelectTrigger className="cursor-pointer">
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
  );
};
