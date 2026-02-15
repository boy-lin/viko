import React from "react";
import { VideoEncoderSelect } from "@/components/biz-form/VideoEncoderSelect";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoFrameRateSelect } from "@/components/biz-form/VideoFrameRateSelect";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { ColorSpaceSelect } from "@/components/biz-form/ColorSpaceSelect";
import { getVideoOptionsByEncoder, formatToDefinition } from "@/data/capabilities";
import { ConvertVideoTaskArgs } from "@/lib/bridge";

import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

export type VideoConversionConfig = Pick<ConvertVideoTaskArgs, "format" | "video_encoder" | "video_bitrate" | "resolution" | "frame_rate">

export interface VideoSettingsSectionProps extends VideoConversionConfig {
  onChange?: (config: Partial<VideoConversionConfig>) => void;
}

export const VideoAdvanceSetting: React.FC<VideoSettingsSectionProps> = ({
  format,
  video_encoder,
  video_bitrate,
  resolution,
  frame_rate,
  onChange,
}) => {
  const { t } = useTranslation("common");
  if (!format || !video_encoder) {
    console.log("format or encoder is not set", format, video_encoder);
    return <div>{t("video_advance.missing", "format or encoder is not set")}</div>
  }
  const containerDefinition = formatToDefinition.get(format);
  const videoOptions = getVideoOptionsByEncoder(video_encoder);

  if (!containerDefinition || !videoOptions) {
    console.log("format or encoder or videoOptions is not set", {
      containerDefinition, videoOptions, video_encoder
    });
    return <div>{t("video_advance.missing", "format or encoder is not set")}</div>
  }

  return (
    <div className="flex-1 p-2 space-y-4">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <Info className="w-4 h-4 text-muted-foreground" />
            <Label className="text-muted-foreground">
              {t("video_advance.encoder", "Encoder")}
            </Label>
          </div>
          <VideoEncoderSelect
            value={video_encoder}
            onValueChange={(v) => onChange?.({ video_encoder: v })}
            allowedEncoders={containerDefinition.video?.allowedEncoders}
          />
        </div>

        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <Info className="w-4 h-4 text-muted-foreground" />
            <Label className="text-muted-foreground">
              {t("video_advance.resolution", "Resolution")}
            </Label>
          </div>
          <VideoResolutionSelect
            value={resolution}
            onValueChange={(v) => onChange?.({ resolution: v })}
            groups={videoOptions.resolutions}
          />
        </div>


        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <Info className="w-4 h-4 text-muted-foreground" />
            <Label className="text-muted-foreground">
              {t("video_advance.frame_rate", "Frame Rate")}
            </Label>
          </div>
          <VideoFrameRateSelect
            value={frame_rate}
            onValueChange={(v) => onChange?.({ frame_rate: v })}
            options={videoOptions.frameRates}
          />
        </div>

        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <Info className="w-4 h-4 text-muted-foreground" />
            <Label className="text-muted-foreground">
              {t("video_advance.bitrate", "Bitrate")}
            </Label>
          </div>
          <VideoBitrateSelect
            value={String(video_bitrate || "auto")}
            onValueChange={(v) => onChange?.({ video_bitrate: parseInt(v) })}
            options={videoOptions.bitrates}
          />
        </div>

        <div className="space-y-2 pr-4">
          <div className="flex gap-2 items-center">
            <Info className="w-4 h-4 text-muted-foreground" />
            <Label className="text-muted-foreground">
              {t("video_advance.color_space", "Color Space")}
            </Label>
          </div>
          <ColorSpaceSelect
            value="auto"
            onValueChange={() => { }}
            options={videoOptions.colorSpaces}
          />
        </div>

      </div>



      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
