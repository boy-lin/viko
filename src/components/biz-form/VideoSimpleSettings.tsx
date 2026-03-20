import React, { useMemo } from "react";
import { BadgeQuestionMark } from "lucide-react";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { VideoQualitySelect } from "@/components/biz-form/VideoQualitySelect";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { VideoResolutionGroup } from "@/components/biz-form/VideoResolutionGroup";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface VideoSimpleSettingsProps {
  resolution?: string;
  video_bitrate?: number;
  min_bitrate?: number;
  max_bitrate?: number;
  crf?: number;
  rc_mode?: string;
  onChange: (args: Partial<ConvertVideoTaskArgs>) => void;
}

export const VideoSimpleSettings: React.FC<VideoSimpleSettingsProps> = ({
  resolution,
  video_bitrate,
  min_bitrate,
  max_bitrate,
  crf,
  rc_mode,
  onChange,
}) => {

  const { t } = useTranslation("task");
  const currentMode = useMemo(() => {
    const normalized = rc_mode?.toLowerCase();
    if (normalized === "cbr" || normalized === "vbr" || normalized === "crf") {
      return normalized;
    }
    if (typeof crf === "number") return "crf";
    return "vbr";
  }, [crf, rc_mode]);

  const effectiveBitrate = useMemo(
    () => video_bitrate ?? max_bitrate ?? min_bitrate,
    [max_bitrate, min_bitrate, video_bitrate],
  );

  return (
    <div className="space-y-4 p-2">
      <div className="grid gap-4">
        <div className="space-y-2">
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
                value={effectiveBitrate ? effectiveBitrate.toString() : "auto"}
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

      </div>
      <VideoResolutionGroup
        label={t("settings.video.fields.resolution")}
        helpText={t("settings.video.fields.resolutionHelp")}
        resolution={resolution}
        onChange={(value) => onChange({ resolution: value })}
        showMoreBtns={true} />
    </div>
  );
};
