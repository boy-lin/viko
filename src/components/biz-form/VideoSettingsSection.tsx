import { useMemo } from "react";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VideoResolutionGroup } from "@/components/biz-form/VideoResolutionGroup";
import { VideoEncoderSelect } from "./VideoEncoderSelect";
import { VIDEO_CONTAINER_DEFINITIONS, VIDEO_ENCODER_DEFINITIONS } from "@/data/capabilities";
import { FormatEnum, VideoEncoderEnum } from "@/types/options";
import { VideoFrameRateSelectGroup } from "./VideoFrameRateSelectGroup";
import { ColorSpaceSelect } from "./ColorSpaceSelect";
import { ColorRangeSelect } from "./ColorRangeSelect";
import VideoBitrateModeGroup from "./VideoBitrateModeGroup";

export default function VideoSettingsSection({
  format,
  video_encoder,
  rc_mode,
  crf,
  video_bitrate,
  min_bitrate,
  max_bitrate,
  resolution,
  frame_rate,
  color_space,
  color_range,
  onChange,
}: {
  format: FormatEnum;
  video_encoder: VideoEncoderEnum;
  rc_mode?: string;
  crf?: number;
  video_bitrate?: number;
  min_bitrate?: number;
  max_bitrate?: number;
  resolution?: string;
  frame_rate?: string;
  color_space?: string;
  color_range?: string;
  onChange: (next: Partial<ConvertVideoTaskArgs>) => void;
}) {
  const { t } = useTranslation("task");

  const formatDefinition = useMemo(() => {
    if (!format) return undefined;
    return VIDEO_CONTAINER_DEFINITIONS[format as FormatEnum];
  }, [format]);

  const encoderDef = useMemo(() => {
    const def = VIDEO_ENCODER_DEFINITIONS[video_encoder as VideoEncoderEnum];
    return def;
  }, [video_encoder]);


  if (!format || !video_encoder) {
    console.log("format or encoder is not set", format, video_encoder);
    return <div>{t("video_advance.missing", "format or encoder is not set")}</div>
  }

  if (!formatDefinition || !encoderDef) {
    console.log("format or encoder is not set", {
      formatDefinition, encoderDef, video_encoder
    });
    return <div>{t("video_advance.missing", "format or encoder is not set")}</div>
  }

  return <ScrollArea className="flex-1 min-h-0 overflow-hidden">
    <div className="grid grid-cols-2 gap-4 space-y-4 p-2">
      <VideoBitrateModeGroup
        rc_mode={rc_mode}
        crf={crf}
        video_bitrate={video_bitrate}
        min_bitrate={min_bitrate}
        max_bitrate={max_bitrate}
        onChange={onChange}
      />
      <VideoResolutionGroup
        className="col-span-2"
        label={t("settings.video.fields.resolution")}
        helpText={t("settings.video.fields.resolutionHelp")}
        resolution={resolution}
        onChange={(value) => onChange({ resolution: value })}
        showMoreBtns={true}
      />
      <div className="col-span-2 space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
        <div className="text-sm font-medium text-foreground">
          {t("bizForm.videoSettings.mode.advanced")}
        </div>
        <div className="grid grid-cols-2 gap-4">

          <VideoEncoderSelect
            className="space-y-2"
            label={t("video_advance.encoder", "Encoder")}
            helpText={t("videoCompressor.fields.encoderHelp")}
            hideLabel={false}
            value={video_encoder}
            onValueChange={(v) => onChange?.({ video_encoder: v })}
            allowedEncoders={formatDefinition.video?.allowedEncoders}
          />
          <VideoFrameRateSelectGroup
            className="space-y-2"
            label={t("video_advance.frame_rate", "Frame Rate")}
            helpText={t("settings.video.fields.frameRateHelp")}
            hideLabel={false}
            value={frame_rate}
            onValueChange={(v) => onChange?.({ frame_rate: v })}
            maxFrameRate={encoderDef?.maxFrameRate}
          />
          <ColorSpaceSelect
            className="space-y-2"
            label={t("video_advance.color_space", "Color Space")}
            helpText={t("video_advance.colorSpaceHelp")}
            hideLabel={false}
            value={color_space}
            onValueChange={(v) => onChange?.({ color_space: v })}
            allowedColorSpaces={encoderDef?.colorSpaces}
          />
          <ColorRangeSelect
            className="space-y-2"
            label={t("video_advance.color_range", "Color Range")}
            helpText={t("video_advance.colorRangeHelp")}
            hideLabel={false}
            value={color_range}
            onValueChange={(v) => onChange?.({ color_range: v })}
            allowedColorRanges={encoderDef?.allowedColorRanges}
            placeholder={t("video_advance.color_range", "Color Range")}
          />
        </div>
      </div>
    </div>
  </ScrollArea>
}
