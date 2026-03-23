import { useMemo } from "react";
import { BadgeQuestionMark } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { VideoBitrateSelect } from "./VideoBitrateSelect";
import { VideoQualitySelect } from "./VideoQualitySelect";
import { cn } from "@/lib/utils";

interface VideoBitrateModeGroupProps {
  className?: string;
  rc_mode?: string;
  crf?: number;
  video_bitrate?: number;
  min_bitrate?: number;
  max_bitrate?: number;
  placeholder?: string;
  onChange: (next: Partial<ConvertVideoTaskArgs>) => void;
}

export default function VideoBitrateModeGroup({
  className,
  rc_mode,
  crf,
  video_bitrate,
  min_bitrate,
  max_bitrate,
  placeholder,
  onChange,
}: VideoBitrateModeGroupProps) {
  const { t } = useTranslation("task");

  const currentMode = useMemo(() => {
    const normalized = rc_mode?.toLowerCase();
    if (normalized === "cbr" || normalized === "vbr" || normalized === "crf") {
      return normalized;
    }
    if (typeof crf === "number") return "crf";
    return "vbr";
  }, [crf, rc_mode]);

  console.log('currentMode', currentMode, rc_mode, crf, video_bitrate, min_bitrate, max_bitrate);

  const effectiveBitrate = useMemo(
    () => video_bitrate ?? max_bitrate ?? min_bitrate,
    [max_bitrate, min_bitrate, video_bitrate],
  );

  return (
    <div className={cn("col-span-2 space-y-2", className)}>
      <div className="flex items-center gap-1">
        <Label>{t("videoSimpleSettings.clarity")}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64 whitespace-normal break-words">
            {t("videoCompressor.fields.clarityHelp")}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="space-y-2">
        <RadioGroup
          className="flex items-center gap-4"
          value={currentMode}
          onValueChange={(nextMode) => {
            if (nextMode === "cbr") {
              onChange({
                rc_mode: "cbr",
                crf: undefined,
                min_bitrate: effectiveBitrate,
                max_bitrate: effectiveBitrate,
              });
              return;
            }

            if (nextMode === "vbr") {
              onChange({
                rc_mode: "vbr",
                crf: undefined,
                min_bitrate: undefined,
                max_bitrate: undefined,
              });
              return;
            }

            onChange({
              rc_mode: "crf",
              video_bitrate: undefined,
              min_bitrate: undefined,
              max_bitrate: undefined,
            });
          }}
        >
          {[
            { value: "cbr", labelKey: "videoSimpleSettings.mode.cbr" },
            { value: "vbr", labelKey: "videoSimpleSettings.mode.vbr" },
            { value: "crf", labelKey: "videoSimpleSettings.mode.crf" },
          ].map((opt) => (
            <Label
              key={opt.value}
              className="flex items-center gap-2 cursor-pointer"
              htmlFor={`clarity-mode-${opt.value}`}
            >
              <RadioGroupItem
                className="cursor-pointer"
                value={opt.value}
                id={`clarity-mode-${opt.value}`}
              />
              <span className="whitespace-nowrap">{t(opt.labelKey)}</span>
            </Label>
          ))}
        </RadioGroup>
        {currentMode === "crf" ? (
          <VideoQualitySelect
            value={crf}
            onValueChange={(val) => {
              onChange({
                crf: val,
                video_bitrate: undefined,
                min_bitrate: undefined,
                max_bitrate: undefined,
                rc_mode: val !== undefined ? "crf" : undefined,
              });
            }}
          />
        ) : (
          <VideoBitrateSelect
            hideLabel
            className="inline-block"
            value={effectiveBitrate ? effectiveBitrate.toString() : placeholder ?? "auto"}
            onValueChange={(val) => {
              const nextBitrate = val === "auto" ? undefined : parseInt(val);
              onChange({
                video_bitrate: nextBitrate,
                crf: undefined,
                rc_mode: currentMode,
                min_bitrate: currentMode === "cbr" ? nextBitrate : undefined,
                max_bitrate: currentMode === "cbr" ? nextBitrate : undefined,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
