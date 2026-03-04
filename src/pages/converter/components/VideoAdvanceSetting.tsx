import React, { useMemo } from "react";
import { VideoEncoderSelect } from "@/components/biz-form/VideoEncoderSelect";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoFrameRateSelect } from "@/components/biz-form/VideoFrameRateSelect";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { ColorSpaceSelect } from "@/components/biz-form/ColorSpaceSelect";
import { ColorRangeSelect } from "@/components/biz-form/ColorRangeSelect";
import { VIDEO_CONTAINER_DEFINITIONS, VIDEO_ENCODER_DEFINITIONS } from "@/data/capabilities";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useTranslation } from "react-i18next";
import { FormatEnum, VideoEncoderEnum } from "@/types/options";

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

  const formatDefinition = useMemo(() => {
    if (!format) return undefined;
    return VIDEO_CONTAINER_DEFINITIONS[format as FormatEnum];
  }, [format]);

  const encoderDef = useMemo(() => {
    const def = VIDEO_ENCODER_DEFINITIONS[video_encoder as VideoEncoderEnum];
    return def;
  }, [video_encoder]);

  if (!formatDefinition || !encoderDef) {
    console.log("format or encoder is not set", {
      formatDefinition, encoderDef, video_encoder
    });
    return <div>{t("video_advance.missing", "format or encoder is not set")}</div>
  }

  return (
    <div className="flex-1 p-2 space-y-4">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <VideoEncoderSelect
          className="space-y-2"
          label={t("video_advance.encoder", "Encoder")}
          helpText={t("videoCompressor.fields.encoderHelp")}
          hideLabel={false}
          value={video_encoder}
          onValueChange={(v) => onChange?.({ video_encoder: v })}
          allowedEncoders={formatDefinition.video?.allowedEncoders}
        />

        <VideoResolutionSelect
          wrapperClassName="space-y-2"
          label={t("video_advance.resolution", "Resolution")}
          helpText={t("videoCompressor.fields.resolutionHelp")}
          value={resolution}
          onValueChange={(v) => onChange?.({ resolution: v })}
          maxResolution={encoderDef.video?.maxResolution}
        />

        <VideoFrameRateSelect
          className="space-y-2"
          label={t("video_advance.frame_rate", "Frame Rate")}
          helpText={t("setting.video.fields.frameRateHelp")}
          value={frame_rate}
          onValueChange={(v) => onChange?.({ frame_rate: v })}
          maxFrameRate={encoderDef.video?.maxFrameRate}
        />

        <VideoBitrateSelect
          className="space-y-2"
          label={t("video_advance.bitrate", "Bitrate")}
          helpText={t("videoCompressor.fields.bitrateHelp")}
          value={String(video_bitrate || "auto")}
          onValueChange={(v) => onChange?.({ video_bitrate: parseInt(v) })}
          maxBitrate={encoderDef.video?.maxBitrate}
        />

        <ColorSpaceSelect
          className="space-y-2"
          label={t("video_advance.color_space", "Color Space")}
          helpText={t("video_advance.colorSpaceHelp", "Controls color space for output and compatibility. Use auto unless your workflow requires a specific standard.")}
          hideLabel={false}
          value={color_space}
          onValueChange={(v) => onChange?.({ color_space: v })}
          allowedColorSpaces={encoderDef.video?.colorSpaces}
        />

        <ColorRangeSelect
          className="space-y-2"
          label={t("video_advance.color_range", "Color Range")}
          helpText={t("video_advance.colorRangeHelp", "Controls luminance range mapping. Full range is common for PC graphics, limited range is common for TV/video workflows.")}
          hideLabel={false}
          value={color_range}
          onValueChange={(v) => onChange?.({ color_range: v })}
          allowedColorRanges={encoderDef.video?.allowedColorRanges}
          placeholder={t("video_advance.color_range", "Color Range")}
        />
      </div>
    </div>
  );
};
