import React, { useState } from "react";
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
import { VideoFrameRateSelect } from "@/components/biz-form/VideoFrameRateSelect";
import { VideoGopSelect } from "@/components/biz-form/VideoGopSelect";
import { VideoPresetSelect } from "@/components/biz-form/VideoPresetSelect";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings } from "lucide-react";
import { getVideoCompressionPresetByRatio } from "./compressionPreset";
import { formatToDefinition, getVideoOptionsByEncoder } from "@/data/capabilities";
import type { SelectOption } from "@/types/options";

interface CompressionSettingsFormProps {
  config: CompressVideoTaskArgs;
  onConfigChange: (config: Partial<CompressVideoTaskArgs>) => void;
}

interface CompressionSettingsProps extends CompressionSettingsFormProps {
  onSave: (config: CompressVideoTaskArgs) => void;
}

const CompressionSettingsForm: React.FC<CompressionSettingsFormProps> = ({
  config,
  onConfigChange,
}) => {

  const parseOptionalInt = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  };


  const GOP_OPTIONS: SelectOption[] = [
    { value: "auto", label: "自动" },
    { value: "12", label: "12" },
    { value: "15", label: "15" },
    { value: "18", label: "18" },
    { value: "24", label: "24" },
    { value: "30", label: "30" },
    { value: "48", label: "48" },
    { value: "60", label: "60" },
    { value: "120", label: "120" },
    { value: "250", label: "250" },
  ];
  const COLOR_DEPTHS: SelectOption[] = [
    { value: "auto", label: "自动" },
    { value: "8", label: "8-bit" },
    { value: "10", label: "10-bit" },
    { value: "12", label: "12-bit" },
  ];
  const VIDEO_PRESETS: SelectOption[] = [
    { value: "auto", label: "默认" },
    { value: "ultrafast", label: "ultrafast" },
    { value: "fast", label: "fast" },
    { value: "medium", label: "medium" },
    { value: "slow", label: "slow" },
  ];
  const containerDefinition = formatToDefinition.get(config.format);
  const effectiveVideoEncoder = config.codec || containerDefinition?.video?.defaultEncoder;
  const videoOptions = getVideoOptionsByEncoder(effectiveVideoEncoder);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 py-4">
        <Slider
          value={[config.ratio]}
          onValueChange={(ratio: number[]) => {
            const next = getVideoCompressionPresetByRatio(
              ratio[0],
              config.format,
              config.audio_tracks
            );
            onConfigChange(next.patch);
          }}
          min={10}
          max={100}
          step={5}
          className="w-full cursor-pointer"
        />
      </div>
      <div className="space-y-2">
        <Label>码率 (kbps)</Label>
        <VideoBitrateSelect
          value={config.bitrate === undefined ? "auto" : String(config.bitrate)}
          options={videoOptions.bitrates}
          onValueChange={(val) =>
            onConfigChange({
              bitrate: val === "auto" ? undefined : parseOptionalInt(val),
            })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>帧率</Label>
        <VideoFrameRateSelect
          value={config.frame_rate === undefined ? "auto" : String(config.frame_rate)}
          options={videoOptions.frameRates}
          onValueChange={(val) =>
            onConfigChange({
              frame_rate: val === "auto" ? undefined : Number.parseFloat(val),
            })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>编码器</Label>
        <VideoEncoderSelect
          value={config.codec}
          allowedEncoders={containerDefinition?.video?.allowedEncoders}
          onValueChange={(val) =>
            onConfigChange({
              codec: val,
            })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>GOP 间隔</Label>
        <VideoGopSelect
          value={config.keyframe_interval === undefined ? "auto" : String(config.keyframe_interval)}
          options={GOP_OPTIONS}
          onValueChange={(val) =>
            onConfigChange({
              keyframe_interval: val === "auto" ? undefined : parseOptionalInt(val),
            })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>色深 (bit)</Label>
        <VideoColorDepthSelect
          value={config.color_depth === undefined ? "auto" : String(config.color_depth)}
          options={COLOR_DEPTHS}
          onValueChange={(val) =>
            onConfigChange({
              color_depth: val === "auto" ? undefined : parseOptionalInt(val),
            })
          }
        />
      </div>
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
      <div className="space-y-2">
        <Label>压缩模式</Label>
        <VideoPresetSelect
          value={config.preset}
          options={VIDEO_PRESETS}
          onValueChange={(val) =>
            onConfigChange({
              preset: val === "auto" ? undefined : val,
            })
          }
        />
      </div>

      <div className="col-span-2 flex items-center gap-2">

        <Label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={config.remove_audio ?? false}
            onCheckedChange={(checked) =>
              onConfigChange({ remove_audio: checked === true })
            }
          />
          <span>
            移除音轨
          </span>
        </Label>
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
            <DialogTitle>压缩设置</DialogTitle>
          </DialogHeader>
          <div className="flex overflow-hidden flex-col px-4">
            <ScrollArea className="flex-1">
              <CompressionSettingsForm
                config={config}
                onConfigChange={onConfigChange}
              />
            </ScrollArea>
          </div>
          <DialogFooter className="flex flex-row items-center justify-between space-y-0 pt-8 pb-2 px-4 border-b">
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

export const CompressionSettingsPopover: React.FC<CompressionSettingsProps> = ({ config, onConfigChange, onSave }) => {
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
              <div className="text-sm font-semibold">压缩设置</div>
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
                取消
              </Button>
              <Button className="cursor-pointer" onClick={() => {
                onSave && onSave(config);
                setIsSettingsOpen(false);
              }}>应用到全部</Button>
            </div>
          </div>

        </PopoverContent>

      </Popover>
    </div>
  );
};
