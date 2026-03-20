import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { VideoColorDepthSelect } from "@/components/biz-form/VideoColorDepthSelect";
import { VideoEncoderSelect } from "@/components/biz-form/VideoEncoderSelect";
import { VideoFrameRateSelectGroup } from "@/components/biz-form/VideoFrameRateSelectGroup";
import { VideoFormatSelector } from "@/components/biz-form/VideoFormatSelector";
import { VideoGopSelect } from "@/components/biz-form/VideoGopSelect";
import { VideoPresetSelect } from "@/components/biz-form/VideoPresetSelect";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings } from "lucide-react";
import { getVideoCompressionPresetByRatio } from "./compressionPreset";
import { VIDEO_CONTAINER_DEFINITIONS, VIDEO_ENCODER_DEFINITIONS } from "@/data/capabilities";
import { parseOptionalInt } from "@/lib/utils";
import { FormatEnum, VideoEncoderEnum } from "@/types/options";
import { useTranslation } from "react-i18next";

interface CompressionSettingsFormProps {
  config: CompressVideoTaskArgs;
  onConfigChange: (config: Partial<CompressVideoTaskArgs>) => void;
}

interface CompressionSettingsProps extends CompressionSettingsFormProps {
  onSave: (config: Partial<CompressVideoTaskArgs>) => void;
}

const clampRatio = (ratio: number) => Math.max(10, Math.min(100, Math.round(ratio)));

const buildRatioAdjustedPatch = (
  config: CompressVideoTaskArgs,
  nextRatioRaw: number
) => {
  const nextRatio = clampRatio(nextRatioRaw);
  const format = config.format as FormatEnum;
  const nextPreset = getVideoCompressionPresetByRatio(
    nextRatio,
    format,
    config.source_audio_tracks ?? config.audio_tracks,
    {
      sourceCodec: config.codec,
      videoBitrateKbps: config.source_video_bitrate,
      frameRate: config.source_frame_rate,
      keyframeInterval: config.source_keyframe_interval,
    }
  ).patch;
  const presetPatch = { ...nextPreset };
  delete presetPatch.codec;
  const fallbackAudioTracks = config.source_audio_tracks ?? config.audio_tracks;

  return {
    ...presetPatch,
    ratio: nextRatio,
    audio_tracks: presetPatch.audio_tracks ?? fallbackAudioTracks,
  } satisfies Partial<CompressVideoTaskArgs>;
};

const CompressionSettingsForm: React.FC<CompressionSettingsFormProps> = ({
  config,
  onConfigChange,
}) => {
  const { t } = useTranslation("task");
  const formatDefinition = useMemo(() => {
    if (!config.format) return undefined;
    return VIDEO_CONTAINER_DEFINITIONS[config.format as FormatEnum];
  }, [config.format]);

  const encoderDef = useMemo(() => {
    const def = VIDEO_ENCODER_DEFINITIONS[config.codec as VideoEncoderEnum];
    return def;
  }, [config.codec]);

  return (
    <div className="grid grid-cols-2 gap-4 px-4 max-h-[62vh]">
      <div className="col-span-2 py-4">
        <Slider
          value={[config.ratio]}
          onValueChange={(ratio: number[]) => {
            onConfigChange(buildRatioAdjustedPatch(config, ratio[0]));
          }}
          min={10}
          max={100}
          step={5}
          className="w-full cursor-pointer"
        />
      </div>

      <VideoBitrateSelect
        className="space-y-2 w-full"
        label={t("video_advance.bitrate", "Bitrate")}
        helpText={t("videoCompressor.fields.bitrateHelp")}
        minBitrate={encoderDef?.video?.minBitrate}
        maxBitrate={encoderDef?.video?.maxBitrate}
        placeholder={`${t("common.auto")} (${encoderDef?.video?.minBitrate ?? 100}-${encoderDef?.video?.maxBitrate ?? 50000})`}
        value={config.bitrate === undefined ? "auto" : String(config.bitrate)}
        onValueChange={(val) =>
          onConfigChange({
            bitrate: val === "auto" ? undefined : parseOptionalInt(val),
          })
        }
      />
      <VideoFrameRateSelectGroup
        className="space-y-2 w-full"
        label={t("video_advance.frame_rate", "Frame Rate")}
        helpText={t("settings.video.fields.frameRateHelp")}
        maxFrameRate={encoderDef?.video?.maxFrameRate}
        value={config.frame_rate === undefined ? "auto" : String(config.frame_rate)}
        onValueChange={(val) =>
          onConfigChange({
            frame_rate: val || undefined,
          })
        }
      />
      <VideoGopSelect
        className="space-y-2 w-full"
        label={t("bizForm.videoGop.label")}
        hideLabel={false}
        gopOptions={encoderDef?.video?.gopOptions}
        value={config.keyframe_interval === undefined ? "auto" : String(config.keyframe_interval)}
        onValueChange={(val) =>
          onConfigChange({
            keyframe_interval: val === "auto" ? undefined : parseOptionalInt(val),
          })
        }
      />
      <VideoColorDepthSelect
        className="space-y-2 w-full"
        label={t("bizForm.videoColorDepth.label")}
        hideLabel={false}
        allowedColorDepths={encoderDef?.video?.allowedColorDepths}
        value={config.color_depth === undefined ? "auto" : String(config.color_depth)}
        onValueChange={(val) =>
          onConfigChange({
            color_depth: val === "auto" ? undefined : parseOptionalInt(val),
          })
        }
      />
      {/* <div className="space-y-2">
        <Label>音频码率 (kbps)</Label>
        <AudioBitrateSelect
          value={config.audio_tracks?.[0]?.bitrate === undefined ? "auto" : String(config.audio_tracks?.[0]?.bitrate)}
          onValueChange={(val) =>
            onConfigChange({
              audio_tracks: [{
                ...config.audio_tracks?.[0],
                bitrate: val === "auto" ? undefined : parseOptionalInt(val),
              }],
            })
          }
        />
      </div> */}
      <VideoPresetSelect
        className="space-y-2 w-full"
        label={t("bizForm.videoPreset.label")}
        hideLabel={false}
        value={config.preset}
        onValueChange={(val) =>
          onConfigChange({
            preset: val === "auto" ? undefined : val,
          })
        }
      />

      <div className="col-span-2 flex items-center gap-2">
        <Label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={config.remove_audio ?? false}
            onCheckedChange={(checked) =>
              onConfigChange({ remove_audio: checked === true })
            }
          />
          <span>
            {t("videoCompressor.fields.removeAudio")}
          </span>
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
          // checked={config.use_ultra_fast_speed ?? false}
          />
          <span>

          </span>
        </Label>
      </div>
      <div className="col-span-2 space-y-1">
        <div className="text-sm font-medium">{t("videoCompressor.advanced.title")}</div>
        <div className="text-xs text-muted-foreground">
          {t("videoCompressor.advanced.description")}
        </div>
      </div>
      <VideoFormatSelector
        className="space-y-2 w-full"
        value={config.format as FormatEnum}
        onValueChange={(val) => {
          if (!val) return;
          onConfigChange({
            format: val,
          });
        }}
      />
      <VideoEncoderSelect
        className="space-y-2 w-full"
        label={t("video_advance.encoder")}
        hideLabel={false}
        value={config.codec}
        allowedEncoders={formatDefinition?.video?.allowedEncoders}
        onValueChange={(val) =>
          onConfigChange({
            codec: val as VideoEncoderEnum,
          })
        }
      />
    </div>
  );
};

export const CompressionSettingsDialog: React.FC<CompressionSettingsProps> = ({ config, onConfigChange }) => {
  const { t } = useTranslation("task");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Settings className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pt-8 pb-4 px-4 border-b">
            <DialogTitle>{t("videoCompressor.title")}</DialogTitle>
          </DialogHeader>
          <div className="flex overflow-hidden flex-col py-2">
            <ScrollArea className="flex-1">
              <CompressionSettingsForm
                config={config}
                onConfigChange={onConfigChange}
              />
            </ScrollArea>
          </div>
          <DialogFooter className="flex flex-row items-center justify-between space-y-0 pt-2 pb-2 px-4 border-b">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("videoCompressor.actions.close")}
            </Button>
            {/* <Button onClick={() => {
              onSave(config)
              setOpen(false)
            }}>保存</Button> */}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const CompressionSettingsPopover: React.FC<CompressionSettingsProps> = ({ config, onConfigChange }) => {
  const { t } = useTranslation("task");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  return (
    <div className="flex">

      <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <PopoverTrigger className="cursor-pointer" asChild>
          <Button
            variant="ghost"
            className="h-9 w-[10em] cursor-pointer"
          >
            <Slider
              value={[config.ratio]}
              disabled
              min={10}
              max={100}
              step={5}
              className="w-full cursor-pointer"
            />
            <Settings className="w-4 h-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[28rem] h-[72vh] p-0">
          <div className="flex flex-col h-full">
            <div className="space-y-1 pb-3 p-4">
              <div className="text-sm font-semibold">{t("videoCompressor.title")}</div>
            </div>
            <ScrollArea className="flex-1 overflow-hidden min-h-0 px-4">
              <CompressionSettingsForm
                config={config}
                onConfigChange={onConfigChange}
              />
            </ScrollArea>
            <div
              className={` px-4 py-2 flex justify-end gap-2 sticky bottom-0 bg-popover/95 backdrop-blur`}
            >
              <Button className="cursor-pointer" variant="outline" onClick={() => setIsSettingsOpen(false)}>
                {t("videoCompressor.actions.close")}
              </Button>
              {/* <Button className="cursor-pointer" onClick={() => {
                onSave && onSave(config);
                setIsSettingsOpen(false);
              }}>应用到全部</Button> */}
            </div>
          </div>

        </PopoverContent>

      </Popover>
    </div>
  );
};
