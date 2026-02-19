import React, { useState } from "react";
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
import { AudioBitrateSelect } from "@/components/biz-form/AudioBitrateSelect";
import { AudioChannelSelect } from "@/components/biz-form/AudioChannelSelect";
import { AudioEncoderSelect } from "@/components/biz-form/AudioEncoderSelect";
import { AudioBitDepthSelect } from "@/components/biz-form/AudioBitDepthSelect";
import { CompressAudioTaskArgs } from "@/lib/bridge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info, Settings } from "lucide-react";
import type { SelectOption } from "@/types/options";
import { useTranslation } from "react-i18next";
import { getAudioCompressionPresetByRatio } from "./compressionPreset";
const AUDIO_BITRATES = [64, 96, 128, 160, 192, 256, 320];
const AUDIO_BITRATE_OPTIONS: SelectOption[] = [
  { value: "auto", label: "自动" },
  ...AUDIO_BITRATES.map((rate) => ({
    value: String(rate),
    label: `${rate} kbps`,
  })),
];
const AUDIO_CHANNEL_OPTIONS: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "2", label: "立体声" },
  { value: "1", label: "单声道" },
];

interface CompressionSettingsFormProps {
  config: CompressAudioTaskArgs;
  onConfigChange: (config: Partial<CompressAudioTaskArgs>) => void;
}

interface CompressionSettingsProps extends CompressionSettingsFormProps {
  onSave: (config: CompressAudioTaskArgs) => void;
  trigger?: React.ReactNode;
}

const CompressionSettingsForm: React.FC<CompressionSettingsFormProps> = ({
  config,
  onConfigChange,
}) => {
  const { t } = useTranslation("converter");
  const renderAudioFieldLabel = (text: string) => (
    <div className="flex items-center gap-2">
      <Info className="w-4 h-4 text-muted-foreground" />
      <Label className="text-muted-foreground">{text}</Label>
    </div>
  );

  const parseOptionalInt = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const parseOptionalFloat = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="space-y-4">
        <div className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              {renderAudioFieldLabel(t("settings.audio.fields.encoder"))}
              <AudioEncoderSelect
                format={config.format}
                value={config.audio_encoder}
                placeholder={t("settings.audio.fields.encoderPlaceholder")}
                onValueChange={(val) => onConfigChange({ audio_encoder: val })}
              />
            </div>
            <div className="space-y-2">
              <Label>采样率</Label>
              <Input
                type="number"
                placeholder="自动"
                value={config.sample_rate ?? ""}
                onChange={(e) =>
                  onConfigChange({
                    sample_rate: parseOptionalInt(e.target.value)
                  })
                }
              />
            </div>
            <div className="space-y-2">
              {renderAudioFieldLabel(t("settings.audio.fields.bitrate"))}
              <AudioBitrateSelect
                value={config.bitrate === undefined ? "auto" : String(config.bitrate)}
                options={AUDIO_BITRATE_OPTIONS}
                placeholder={t("settings.audio.fields.bitratePlaceholder")}
                onValueChange={(val) => {
                  if (val === "auto") {
                    onConfigChange({ bitrate: undefined });
                    return;
                  }
                  onConfigChange({ bitrate: parseOptionalInt(val) });
                }}
              />
            </div>

            <div className="space-y-2">
              {renderAudioFieldLabel(t("settings.audio.fields.channel"))}
              <AudioChannelSelect
                value={config.channels === undefined ? "auto" : String(config.channels)}
                options={AUDIO_CHANNEL_OPTIONS}
                placeholder={t("settings.audio.fields.channelPlaceholder")}
                onValueChange={(val) => {
                  if (val === "auto") {
                    onConfigChange({ channels: undefined });
                    return;
                  }
                  onConfigChange({ channels: parseOptionalInt(val) });
                }}
              />
            </div>
            <div className="space-y-2">
              {renderAudioFieldLabel(t("settings.audio.fields.bitDepth"))}
              <AudioBitDepthSelect
                value={config.bit_depth === undefined ? "auto" : String(config.bit_depth)}
                placeholder={t("settings.audio.fields.bitDepthPlaceholder")}
                onValueChange={(val) => {
                  if (val === "auto") {
                    onConfigChange({ bit_depth: undefined });
                    return;
                  }
                  onConfigChange({ bit_depth: parseOptionalInt(val) });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>静音阈值 (dB)</Label>
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
              <Label>音量增益 (dB)</Label>
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
              <Checkbox
                checked={config.remove_silence ?? false}
                onCheckedChange={(checked) =>
                  onConfigChange({ remove_silence: checked === true })
                }
              />
              <Label>移除静音</Label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const CompressionSettingsDialog: React.FC<CompressionSettingsProps> = ({ config, onConfigChange, onSave }) => {
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
              <DialogTitle>压缩设置</DialogTitle>
              <DialogDescription>仅修改当前任务的压缩参数</DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex overflow-hidden flex-col px-4">
            <ScrollArea className="flex-1">
              <div className="py-4">
                <Slider
                  value={[config.ratio]}
                  onValueChange={(ratio: number[]) => {
                    const next = getAudioCompressionPresetByRatio(
                      ratio[0],
                      config.format
                    );
                    onConfigChange(next.patch);
                  }}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              <CompressionSettingsForm
                config={config}
                onConfigChange={onConfigChange}
              />
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => {
              onSave(config)
              setOpen(false)
            }}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const CompressionSettingsPopover: React.FC<CompressionSettingsProps> = ({ trigger, config, onConfigChange, onSave }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex">
      <Slider
        value={[config.ratio]}
        onValueChange={(ratio: number[]) => {
          const next = getAudioCompressionPresetByRatio(
            ratio[0],
            config.format
          );
          onConfigChange(next.patch);
        }}
        min={10}
        max={100}
        step={5}
        className="w-full"
      />
      <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-[28rem] h-[72vh] p-0">
          <div className="flex flex-col h-full">
            <div className="space-y-1 pb-3 p-4">
              <div className="text-sm font-semibold">压缩设置</div>
              <div className="text-xs text-muted-foreground">
                修改全局压缩参数
              </div>
            </div>
            <ScrollArea className="flex-1 overflow-hidden min-h-0 px-4">
              <CompressionSettingsForm
                config={config}
                onConfigChange={onConfigChange}
              />
            </ScrollArea>
            <div
              className={` p-4 flex justify-end gap-2 border-t sticky bottom-0 bg-popover/95 backdrop-blur`}
            >
              <Button className="cursor-pointer" variant="outline" onClick={() => setIsSettingsOpen(false)}>
                取消
              </Button>
              <Button className="cursor-pointer" onClick={() => {
                onSave && onSave(config);
                setIsSettingsOpen(false);
              }}>保存</Button>
            </div>
          </div>

        </PopoverContent>

      </Popover>
    </div>

  );
};
