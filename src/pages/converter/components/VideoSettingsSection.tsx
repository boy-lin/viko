import React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { VideoEncoderSelect } from "@/components/biz-form/VideoEncoderSelect";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoFrameRateSelect } from "@/components/biz-form/VideoFrameRateSelect";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { ColorSpaceSelect } from "@/components/biz-form/ColorSpaceSelect";
import { getVideoOptionsByEncoder, encoderToDefinition, formatToDefinition } from "@/data/capabilities";
import { useTranslation } from "react-i18next";
import { ConvertVideoTaskArgs } from "@/lib/bridge";

type VideoConversionConfig = Pick<ConvertVideoTaskArgs, "format" | "video_encoder" | "video_bitrate" | "resolution" | "frame_rate">

interface VideoSettingsSectionProps extends VideoConversionConfig {
  onChange?: (config: Partial<VideoConversionConfig>) => void;
  onReset?: () => void;
}

export const VideoSettingsSection: React.FC<VideoSettingsSectionProps> = ({
  format,
  video_encoder,
  video_bitrate,
  resolution,
  frame_rate,
  onChange,
}) => {
  const { t } = useTranslation("converter");
  if (!format || !video_encoder) {
    return <div> format or encoder is not set </div>
  }
  const containerDefinition = formatToDefinition.get(format);
  const definition = encoderToDefinition.get(video_encoder);
  const videoOptions = getVideoOptionsByEncoder(video_encoder);

  if (!containerDefinition || !definition || !videoOptions) {
    return <div> format or encoder is not set </div>
  }

  const onReset = () => {
    if (onChange) {
      if (!containerDefinition?.video?.defaultEncoder) {
        console.error("No default encoder found for container", containerDefinition);
        return;
      }
      onChange({
        video_encoder: containerDefinition?.video?.defaultEncoder,
        video_bitrate: definition?.defaultBitrate,
        resolution: definition?.defaultResolution,
        frame_rate: definition?.defaultFrameRate.toString(),
      });
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">{t("settings.video.title")}</h3>
        {onReset && (
          <Button variant="ghost" size="icon" onClick={onReset}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <VideoEncoderSelect
          value={video_encoder}
          onValueChange={(v) => onChange?.({ video_encoder: v })}
          allowedEncoders={containerDefinition.video?.allowedEncoders}
        />

        <VideoResolutionSelect
          value={resolution}
          onValueChange={(v) => onChange?.({ resolution: v })}
          options={videoOptions.resolutions}
        />

        <VideoFrameRateSelect
          value={frame_rate}
          onValueChange={(v) => onChange?.({ frame_rate: v })}
          options={videoOptions.frameRates}
        />

        <VideoBitrateSelect
          value={String(video_bitrate)}
          onValueChange={(v) => onChange?.({ video_bitrate: parseInt(v) })}
          options={videoOptions.bitrates}
        />
      </div>

      <ColorSpaceSelect
        value="auto"
        onValueChange={() => { }}
        options={videoOptions.colorSpaces}
      />

      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
