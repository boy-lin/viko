import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AudioFormatSelector } from "@/components/biz-form/AudioFormatSelector";
import { AudioBitrateSelect } from "@/components/biz-form/AudioBitrateSelect";
import { AudioChannelSelect } from "@/components/biz-form/AudioChannelSelect";
import { AudioEncoderSelect } from "@/components/biz-form/AudioEncoderSelect";
import { AudioBitDepthSelect } from "@/components/biz-form/AudioBitDepthSelect";
import { AudioSampleRateSelect } from "@/components/biz-form/AudioSampleRateSelect";
import { CompressAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AUDIO_ENCODER_DEFINITIONS,
  AUDIO_CONTAINER_DEFINITIONS,
} from "@/data/capabilities";
import { parseOptionalInt } from "@/lib/utils";
import { AudioEncoderEnum } from "@/types/options";
import { MediaDetailsWithResolve } from "@/types/tasks";
import { getAudioEstimatedOutputSizeLabel } from "../estimateOutputSize";

interface CompressionSettingsFormProps {
  config: CompressAudioTaskArgs;
  mediaDetails?: MediaDetailsWithResolve;
  onConfigChange: (config: Partial<CompressAudioTaskArgs>) => void;
}

interface CompressionSettingsProps extends CompressionSettingsFormProps {
  onSave?: (config: CompressAudioTaskArgs) => void;
}

const CompressionSettingsForm: React.FC<CompressionSettingsFormProps> = ({
  config,
  mediaDetails,
  onConfigChange,
}) => {
  const { t } = useTranslation("task");
  const formatDefinition = useMemo(() => {
    if (!config.format) return undefined;
    return AUDIO_CONTAINER_DEFINITIONS[config.format];
  }, [config.format]);

  const encoderDefinition = useMemo(() => {
    const def = AUDIO_ENCODER_DEFINITIONS[config.codec as AudioEncoderEnum]
    return def;
  }, [config.codec]);

  const parseOptionalFloat = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const estimatedSizeLabel = useMemo(
    () => getAudioEstimatedOutputSizeLabel(config, mediaDetails),
    [config, mediaDetails],
  );

  return (
    <div className="flex flex-col space-y-4 px-4 max-h-[60vh]">
      <div className="space-y-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 py-4">
              <Slider
                value={[config.ratio]}
                onValueChange={(ratio: number[]) => {
                  onConfigChange({ ratio: ratio[0] });
                }}
                min={10}
                max={100}
                step={5}
                className="w-full"
              />
              {estimatedSizeLabel ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  预估输出大小 {estimatedSizeLabel}
                </p>
              ) : null}
            </div>
            <AudioSampleRateSelect
              className="space-y-2 w-full"
              label={t("settings.audio.fields.sampleRate")}
              helpText={t("settings.audio.fields.sampleRateHelp")}
              value={config.sample_rate === undefined ? undefined : String(config.sample_rate)}
              maxSampleRate={encoderDefinition?.maxSampleRate}
              onValueChange={(val) => {
                if (val === "auto") {
                  onConfigChange({ sample_rate: undefined });
                  return;
                }
                onConfigChange({ sample_rate: parseOptionalInt(val) });
              }}
            />
            <AudioBitrateSelect
              className="space-y-2 w-full"
              label={t("settings.audio.fields.bitrate")}
              helpText={t("audioCompressor.fields.bitrateHelp")}
              
              value={config.bitrate === undefined ? undefined : String(config.bitrate)}
              maxBitrate={encoderDefinition?.maxBitrate}
              onValueChange={(val) => {
                if (val === "auto") {
                  onConfigChange({ bitrate: undefined });
                  return;
                }
                onConfigChange({ bitrate: parseOptionalInt(val) });
              }}
            />

            <AudioChannelSelect
              className="space-y-2 w-full"
              label={t("settings.audio.fields.channel")}
              helpText={t("audioCompressor.fields.channelHelp")}
              
              value={config.channels === undefined ? undefined : String(config.channels)}
              allowedChannels={encoderDefinition?.allowedChannels}
              onValueChange={(val) => {
                if (val === "auto") {
                  onConfigChange({ channels: undefined });
                  return;
                }
                onConfigChange({ channels: parseOptionalInt(val) });
              }}
            />
            <AudioBitDepthSelect
              className="space-y-2 w-full"
              label={t("settings.audio.fields.bitDepth")}
              helpText={t("audioCompressor.fields.bitDepthHelp")}
              
              value={config.bit_depth === undefined ? undefined : String(config.bit_depth)}
              allowedBitDepths={encoderDefinition?.allowedBitDepths}
              autoLabel={t("common.auto")}
              onValueChange={(val) => {
                if (val === "auto") {
                  onConfigChange({ bit_depth: undefined });
                  return;
                }
                onConfigChange({ bit_depth: parseOptionalInt(val) });
              }}
            />
            <div className="space-y-2">
              <Label>{t("audioCompressor.fields.silenceThreshold")}</Label>
              <Input
                type="number"
                placeholder="-50"
                value={config.silence_threshold ?? ""}
                onChange={(e) =>
                  onConfigChange({
                    silence_threshold: parseOptionalFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("audioCompressor.fields.volumeGain")}</Label>
              <Input
                type="number"
                placeholder="0"
                value={config.volume_gain ?? ""}
                onChange={(e) =>
                  onConfigChange({ volume_gain: parseOptionalFloat(e.target.value) })
                }
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Label>{t("audioCompressor.fields.removeSilence")}</Label>
              <Checkbox
                checked={config.remove_silence ?? false}
                onCheckedChange={(checked) =>
                  onConfigChange({ remove_silence: checked === true })
                }
              />
            </div>
            <div className="col-span-2 space-y-1">
              <div className="text-sm font-medium">{t("audioCompressor.advanced.title")}</div>
              <div className="text-xs text-muted-foreground">
                {t("audioCompressor.advanced.description")}
              </div>
            </div>
            <div className="space-y-2">
              <AudioFormatSelector
                className="w-full"
                label={t("settings.audio.fields.format")}
                helpText={t("settings.audio.fields.formatHelp")}
                
                value={config.format}
                onValueChange={(nextFormat) => {
                  if (!nextFormat) return;
                  onConfigChange({
                    format: nextFormat,
                  });
                }}
              />
            </div>
            <AudioEncoderSelect
              className="space-y-2 w-full"
              label={t("settings.audio.fields.encoder")}
              helpText={t("setting.audio.fields.encoderHelp")}
              allowedEncoders={formatDefinition?.allowedEncoders}
              value={config.codec}
              onValueChange={(val) => onConfigChange({ codec: val })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const CompressionSettingsDialog: React.FC<CompressionSettingsProps> = ({
  config,
  mediaDetails,
  onConfigChange,
}) => {
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
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pt-8 pb-4 px-4 border-b">
            <div className="space-y-1">
              <DialogTitle>{t("audioCompressor.title")}</DialogTitle>
              <DialogDescription>{t("audioCompressor.description")}</DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex overflow-hidden flex-col">
            <ScrollArea className="flex-1">
              <CompressionSettingsForm
                config={config}
                mediaDetails={mediaDetails}
                onConfigChange={onConfigChange}
              />
            </ScrollArea>
          </div>
          <DialogFooter className="flex flex-row items-center justify-between space-y-0 pt-8 pb-2 px-4 border-b">
            {/* <Button variant="outline" onClick={() => setOpen(false)}>
              {t("audioCompressor.actions.close")}
            </Button> */}
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

export const CompressionSettingsPopover: React.FC<CompressionSettingsProps> = ({
  config,
  mediaDetails,
  onConfigChange,
  onSave,
}) => {
  const { t } = useTranslation("task");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex">

      <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <PopoverTrigger asChild>
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
              className="w-full"
            />
            <Settings className="w-4 h-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[28rem] h-[72vh] p-0">
          <div className="flex flex-col h-full">
            <div className="space-y-1 pb-3 p-4">
              <div className="text-sm font-semibold">{t("audioCompressor.title")}</div>
              <div className="text-xs text-muted-foreground">
                {t("audioCompressor.popoverDescription")}
              </div>
            </div>
            <ScrollArea className="flex-1 overflow-hidden min-h-0 px-4">
              <CompressionSettingsForm
                config={config}
                mediaDetails={mediaDetails}
                onConfigChange={onConfigChange}
              />
            </ScrollArea>
            <div
              className={` p-4 flex justify-end gap-2 border-t sticky bottom-0 bg-popover/95 backdrop-blur`}
            >
              <Button className="cursor-pointer" variant="outline" onClick={() => setIsSettingsOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button className="cursor-pointer" onClick={() => {
                onSave && onSave(config);
                setIsSettingsOpen(false);
              }}>{t("common.apply_all")}</Button>
            </div>
          </div>

        </PopoverContent>

      </Popover>
    </div>

  );
};
