import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { BadgeQuestionMark } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VIDEO_ENCODERS } from "@/data/encoders";
import { EncoderEnum } from "@/types/options";
import { cn } from "@/lib/utils";

interface VideoEncoderSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedEncoders?: string[];
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoEncoderSelect: React.FC<VideoEncoderSelectProps> = ({
  value,
  onValueChange,
  allowedEncoders,
  label,
  helpText,
  hideLabel = true,
  className,
}) => {

  const filteredEncoders = useMemo(() => {
    return allowedEncoders
      ? VIDEO_ENCODERS.filter(
        (e) => allowedEncoders.includes(e.value) || e.value === EncoderEnum.AUTO
      )
      : VIDEO_ENCODERS.filter((e) => [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.AUTO].includes(e.value));
  }, [allowedEncoders]);

  useEffect(() => {
    if (value && !filteredEncoders.some((e) => e.value === value)) {
      onValueChange(EncoderEnum.AUTO);
    }
  }, [filteredEncoders, value])

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && label && (
        <div className="flex items-center gap-1">
          <Label>{label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value ?? EncoderEnum.AUTO} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
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
