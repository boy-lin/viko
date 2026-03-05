import React, { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { BadgeQuestionMark } from "lucide-react";
import { AUDIO_ENCODERS } from "@/data/encoders";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AudioEncoderEnum } from "@/types/options";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface AudioEncoderSelectProps {
  allowedEncoders?: AudioEncoderEnum[];
  value?: AudioEncoderEnum;
  onValueChange: (value: AudioEncoderEnum) => void;
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioEncoderSelect: React.FC<AudioEncoderSelectProps> = ({
  allowedEncoders,
  value,
  onValueChange,
  placeholder,
  label,
  helpText,
  hideLabel = false,
  className,
}) => {
  const { t } = useTranslation("task");
  const filteredEncoders = React.useMemo(() => {
    return allowedEncoders && allowedEncoders.length
      ? AUDIO_ENCODERS.filter((encoder) => allowedEncoders.includes(encoder.value) || encoder.value === "auto")
      : AUDIO_ENCODERS;
  }, [allowedEncoders]);

  useEffect(() => {
    if (!allowedEncoders || !allowedEncoders.length) return;
    if (!value || !allowedEncoders.includes(value)) {
      onValueChange(allowedEncoders[0]);
    }
  }, [allowedEncoders, value]);
  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("settings.audio.fields.encoder")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.audio.fields.encoderHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value ?? allowedEncoders?.[0]} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? t("settings.audio.fields.encoderPlaceholder")} />
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
