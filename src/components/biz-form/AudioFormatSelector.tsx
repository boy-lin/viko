import React from "react";
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
import { AUDIO_FORMAT_OPTIONS } from "@/data/formats";
import { FormatEnum } from "@/types/options";
import { cn } from "@/lib/utils";

interface AudioFormatSelectorProps {
  value?: FormatEnum;
  onValueChange: (value?: FormatEnum) => void;
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioFormatSelector: React.FC<AudioFormatSelectorProps> = ({
  value,
  onValueChange,
  placeholder,
  label,
  helpText,
  hideLabel = false,
  className,
}) => {
  const effectiveValue = value ?? (AUDIO_FORMAT_OPTIONS[0]?.id as FormatEnum | undefined);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select
        value={effectiveValue}
        onValueChange={(next) => onValueChange(next as FormatEnum)}
      >
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? "select audio format"} />
        </SelectTrigger>
        <SelectContent>
          {AUDIO_FORMAT_OPTIONS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
