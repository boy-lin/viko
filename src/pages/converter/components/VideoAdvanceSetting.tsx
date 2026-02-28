import React from "react";
import { VideoEncoderSelect } from "@/components/biz-form/VideoEncoderSelect";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoFrameRateSelect } from "@/components/biz-form/VideoFrameRateSelect";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { ColorSpaceSelect } from "@/components/biz-form/ColorSpaceSelect";
import { ColorRangeSelect } from "@/components/biz-form/ColorRangeSelect";
import { getVideoOptionsByEncoder, formatToDefinition } from "@/data/capabilities";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useTranslation } from "react-i18next";

export type VideoConversionConfig = Pick<ConvertVideoTaskArgs, "format" | "video_encoder" | "video_bitrate" | "resolution" | "frame_rate" | "color_space" | "color_range">

export interface VideoSettingsSectionProps extends VideoConversionConfig {
  onChange?: (config: Partial<VideoConversionConfig>) => void;
}

export const VideoAdvanceSetting: React.FC<VideoSettingsSectionProps> = ({
  format,
  video_encoder,
  video_bitrate,
  resolution,
  frame_rate,
  color_space,
  color_range,
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
        <VideoEncoderSelect
          className="space-y-2"
          label={t("video_advance.encoder", "Encoder")}
          hideLabel={false}
          value={video_encoder}
          onValueChange={(v) => onChange?.({ video_encoder: v })}
          allowedEncoders={containerDefinition.video?.allowedEncoders}
        />

        <VideoResolutionSelect
          wrapperClassName="space-y-2"
          label={t("video_advance.resolution", "Resolution")}
          hideLabel={false}
          value={resolution}
          onValueChange={(v) => onChange?.({ resolution: v })}
          groups={videoOptions.resolutions}
        />


        <VideoFrameRateSelect
          className="space-y-2"
          label={t("video_advance.frame_rate", "Frame Rate")}
          hideLabel={false}
          value={frame_rate}
          onValueChange={(v) => onChange?.({ frame_rate: v })}
          options={videoOptions.frameRates}
        />

        <VideoBitrateSelect
          className="space-y-2"
          label={t("video_advance.bitrate", "Bitrate")}
          hideLabel={false}
          value={String(video_bitrate || "auto")}
          onValueChange={(v) => onChange?.({ video_bitrate: parseInt(v) })}
          options={videoOptions.bitrates}
        />

        <ColorSpaceSelect
          className="space-y-2 pr-4"
          label={t("video_advance.color_space", "Color Space")}
          hideLabel={false}
          value={color_space}
          onValueChange={(v) => onChange?.({ color_space: v })}
          options={videoOptions.colorSpaces}
        />

        <ColorRangeSelect
          className="space-y-2 pr-4"
          label={t("video_advance.color_range", "Color Range")}
          hideLabel={false}
          value={color_range}
          onValueChange={(v) => onChange?.({ color_range: v })}
          placeholder={t("video_advance.color_range", "Color Range")}
          autoLabel={t("video_advance.auto", "Auto")}
          limitedLabel={t("video_advance.limited", "Limited (TV/MPEG)")}
          fullLabel={t("video_advance.full", "Full (PC/JPEG)")}
        />
      </div>
    </div>
  );
};
