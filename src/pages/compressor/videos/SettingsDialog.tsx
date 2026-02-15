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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CompressVideoTaskArgs } from "@/lib/bridge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings } from "lucide-react";

interface CompressionSettingsFormProps {
  config: CompressVideoTaskArgs;
  onConfigChange: (config: Partial<CompressVideoTaskArgs>) => void;
}

interface CompressionSettingsProps extends CompressionSettingsFormProps {
  onSave: (config: CompressVideoTaskArgs) => void;
  trigger?: React.ReactNode;
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

  const parseOptionalFloat = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const handleVideoCompressionChange = (ratio: number[]) => {
    onConfigChange({
      ratio: ratio[0],
    });
  };

  const VIDEO_BITRATES = [500, 800, 1000, 1500, 2000, 2500, 4000, 6000, 8000];
  const VIDEO_CODECS = [
    "libx264",
    "h264",
    "libx265",
    "hevc",
    "libvpx-vp9",
    "libaom-av1",
  ];
  const GOP_OPTIONS = [12, 15, 18, 24, 30, 48, 60, 120, 250];
  const COLOR_DEPTHS = [8, 10, 12];
  const VIDEO_PRESETS = ["ultrafast", "fast", "medium", "slow"];
  const AUDIO_BITRATES = [64, 96, 128, 160, 192, 256, 320];

  const renderSelect = (
    label: string,
    value: string | number | undefined,
    options: Array<string | number>,
    placeholder: string,
    onChange: (val?: string | number) => void
  ) => {
    const selectValue = value === undefined ? "auto" : String(value);
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (v === "auto") {
              onChange(undefined);
              return;
            }
            const matchNumber = options.find((opt) => String(opt) === v);
            onChange(matchNumber ?? v);
          }}
        >
          <SelectTrigger className="w-full" size="sm">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自动</SelectItem>
            {options.map((opt) => (
              <SelectItem key={String(opt)} value={String(opt)}>
                {String(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">
          压缩百分比: {config.ratio}%
        </label>
        <Slider
          value={[config.ratio]}
          onValueChange={handleVideoCompressionChange}
          min={10}
          max={100}
          step={5}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          压缩到原文件大小的 {config.ratio}%
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {renderSelect(
          "码率 (kbps)",
          config.video_bitrate,
          VIDEO_BITRATES,
          "自动",
          (val) =>
            onConfigChange({
              video_bitrate:
                typeof val === "number" ? val : parseOptionalInt(String(val)),
            })
        )}
        <div className="space-y-2">
          <Label>帧率</Label>
          <Input
            type="number"
            placeholder="自动"
            value={config.frame_rate ?? ""}
            onChange={(e) =>
              onConfigChange({ frame_rate: parseOptionalFloat(e.target.value) })
            }
          />
        </div>
        {renderSelect(
          "编码器",
          config.video_encoder,
          VIDEO_CODECS,
          "自动",
          (val) =>
            onConfigChange({
              video_encoder: typeof val === "string" ? val : undefined,
            })
        )}
        {renderSelect(
          "GOP 间隔",
          config.keyframe_interval,
          GOP_OPTIONS,
          "默认",
          (val) =>
            onConfigChange({
              keyframe_interval:
                typeof val === "number" ? val : parseOptionalInt(String(val)),
            })
        )}
        {renderSelect(
          "色深 (bit)",
          config.color_depth,
          COLOR_DEPTHS,
          "自动",
          (val) =>
            onConfigChange({
              color_depth:
                typeof val === "number" ? val : parseOptionalInt(String(val)),
            })
        )}
        {renderSelect(
          "音频码率 (kbps)",
          config.audio_bitrate,
          AUDIO_BITRATES,
          "默认",
          (val) =>
            onConfigChange({
              audio_bitrate:
                typeof val === "number" ? val : parseOptionalInt(String(val)),
            })
        )}
        {renderSelect(
          "预设",
          config.preset,
          VIDEO_PRESETS,
          "默认",
          (val) =>
            onConfigChange({
              preset: typeof val === "string" ? val : undefined,
            })
        )}

        <div className="col-span-2 flex items-center gap-2">

          <Label className="flex items-center gap-2">
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


          <Label className="flex items-center gap-2">
            <Checkbox
              checked={config.use_hardware_acceleration ?? false}
              onCheckedChange={(checked) =>
                onConfigChange({ use_hardware_acceleration: checked === true })
              }
            />
            硬件加速
          </Label>
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
  );
};
