import React from "react";
import { FileVideo, FileAudio } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OutputFormatSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
}

export const OutputFormatSelect: React.FC<OutputFormatSelectProps> = ({
  value = "mp4",
  onValueChange,
}) => {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-8 w-[100px] bg-background">
        <span className="flex items-center gap-2">
          {value === "mp3" ? (
            <FileAudio className="w-3 h-3" />
          ) : (
            <FileVideo className="w-3 h-3" />
          )}
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mp4">MP4</SelectItem>
        <SelectItem value="mp3">MP3</SelectItem>
      </SelectContent>
    </Select>
  );
};
