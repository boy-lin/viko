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

interface VideoResolutionSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

export const VideoResolutionSelect: React.FC<VideoResolutionSelectProps> = ({
  value,
  onValueChange,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Resolution :</Label>
        <Info className="w-4 h-4 text-muted-foreground" />
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select resolution" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="original">Original</SelectItem>
          <SelectItem value="1920x1080">1920x1080</SelectItem>
          <SelectItem value="1280x720">1280x720</SelectItem>
          <SelectItem value="720x576">720x576</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
