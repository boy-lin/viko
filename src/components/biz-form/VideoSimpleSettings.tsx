import React, { useState } from "react";
import { BadgeQuestionMark } from "lucide-react";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { VideoQualitySelect } from "@/components/biz-form/VideoQualitySelect";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { VideoResolutionSection } from "@/components/biz-form/VideoResolutionSection";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface VideoSimpleSettingsProps {
  resolution?: string;
  video_bitrate?: number;
  crf?: number;
  onChange: (args: Partial<ConvertVideoTaskArgs>) => void;
}

export const VideoSimpleSettings: React.FC<VideoSimpleSettingsProps> = ({
  resolution,
  video_bitrate,
  crf,
  onChange,
}) => {

  const { t } = useTranslation("common");
  const [clarityMode, setClarityMode] = useState("quality");

  const applyResolution = (value: string) => {
    onChange({ resolution: value });
  };

  return (
    <div className="space-y-4 p-2">
      <div className="grid gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <Label>清晰度</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 whitespace-normal break-words">
                {t("videoCompressor.fields.clarityHelp")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-4">
            <RadioGroup
              className="flex items-center gap-4"
              value={clarityMode}
              onValueChange={setClarityMode}
            >
              {[
                { value: "quality", label: "画质" },
                { value: "bitrate", label: "按码率" },
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
                  <span className="whitespace-nowrap">{opt.label}</span>
                </Label>
              ))}
            </RadioGroup>

            {clarityMode === "bitrate" ? (
              <VideoBitrateSelect
                hideLabel={true}
                value={video_bitrate ? video_bitrate.toString() : "auto"}
                onValueChange={(val) => {
                  onChange({
                    video_bitrate: val === "auto" ? undefined : parseInt(val),
                    crf: undefined,
                    rc_mode: undefined
                  });
                }}
              />
            ) : (
              <VideoQualitySelect
                value={crf}
                onValueChange={(val) => {
                  onChange({
                    crf: val,
                    video_bitrate: undefined,
                    rc_mode: val !== undefined ? "crf" : undefined
                  });
                }}
              />
            )}
          </div>
        </div>

      </div>
      <VideoResolutionSection
        resolution={resolution}
        onChange={applyResolution}
        showMoreBtns={false} />
    </div>
  );
};
