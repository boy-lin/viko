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

interface VideoFrameRateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

export const VideoFrameRateSelect: React.FC<VideoFrameRateSelectProps> = ({
  value,
  onValueChange,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Frame Rate :</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select frame rate" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="original">Original</SelectItem>
          <SelectItem value="60">60 FPS</SelectItem>
          <SelectItem value="30">30 FPS</SelectItem>
          <SelectItem value="24">24 FPS</SelectItem>
          <SelectItem value="auto">Smart Fit</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
