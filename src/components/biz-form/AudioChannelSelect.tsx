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
import { AUDIO_CHANNELS } from "@/data/audio_options";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface AudioChannelSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedChannels?: string[];
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

export const AudioChannelSelect: React.FC<AudioChannelSelectProps> = ({
  value,
  onValueChange,
  allowedChannels,
  placeholder,
  label,
  helpText,
  hideLabel = false,
  className,
}) => {
  const { t } = useTranslation("task");
  const channelOptions = useMemo(() => {
    if (!allowedChannels || !allowedChannels.length) return AUDIO_CHANNELS;
    return AUDIO_CHANNELS.filter(opt => allowedChannels.includes(opt.value));
  }, [allowedChannels]);

  useEffect(() => {
    if (!channelOptions || !channelOptions.length) return;
    if (!channelOptions.some(opt => opt.value === value)) {
      onValueChange(channelOptions[0].value);
    }
  }, [channelOptions, value]);

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? t("bizForm.audioChannel.label")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("settings.audio.fields.channelHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? t("settings.audio.fields.channelPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {channelOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
