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

interface VideoEncoderSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  allowedEncoders?: string[];
}

export const VideoEncoderSelect: React.FC<VideoEncoderSelectProps> = ({
  value,
  onValueChange,
  allowedEncoders,
}) => {
  // 定义所有支持的编码器
  const allEncoders = [
    { value: "auto", label: "Auto" },
    { value: "h264", label: "H.264" },
    { value: "hevc", label: "HEVC (H.265)" },
    { value: "vp9", label: "VP9" },
    { value: "av1", label: "AV1" },
    { value: "mpeg4", label: "MPEG-4" },
    { value: "mpeg2video", label: "MPEG-2" },
    { value: "wmv2", label: "WMV2" },
    { value: "vpc", label: "VP8" },
    { value: "theora", label: "Theora" },
    { value: "flv1", label: "FLV1" },
    { value: "h263", label: "H.263" },
    { value: "prores", label: "ProRes" },
    { value: "dnxhd", label: "DNxHD" },
    { value: "mpeg1video", label: "MPEG-1" },
    { value: "mpeg2video", label: "MPEG-2" },

  ];

  const filteredEncoders = allowedEncoders
    ? allEncoders.filter(
      (e) => allowedEncoders.includes(e.value) || e.value === "auto"
    )
    : allEncoders.filter((e) => ["h264", "hevc", "vp9", "auto"].includes(e.value)); // default simplified list

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
