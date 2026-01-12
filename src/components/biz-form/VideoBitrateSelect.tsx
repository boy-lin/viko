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

interface VideoBitrateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

export const VideoBitrateSelect: React.FC<VideoBitrateSelectProps> = ({
  value,
  onValueChange,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Bit Rate :</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select bitrate" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Smart Fit</SelectItem>
          <SelectItem value="5000k">5000 kbps</SelectItem>
          <SelectItem value="2000k">2000 kbps</SelectItem>
          <SelectItem value="1000k">1000 kbps</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
