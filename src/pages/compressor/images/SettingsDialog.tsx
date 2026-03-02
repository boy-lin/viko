import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings } from "lucide-react";
import { CompressImageTaskArgs } from "@/lib/mediaTaskEvent";
import { getImageCompressionPresetByRatio } from "./compressionPreset";
import { FormatEnum } from "@/types/options";
import { DpiSelect } from "@/components/biz-form/DpiSelect";
import { ColorModeSelect } from "@/components/biz-form/ColorModeSelect";

interface CompressionSettingsFormProps {
  config: CompressImageTaskArgs;
  onConfigChange: (config: Partial<CompressImageTaskArgs>) => void;
}

interface CompressionSettingsProps extends CompressionSettingsFormProps {
  onSave: (config: CompressImageTaskArgs) => void;
  trigger?: React.ReactNode;
}

const CompressionSettingsForm: React.FC<CompressionSettingsFormProps> = ({
  config,
  onConfigChange,
}) => {
  return (
    <div className="grid grid-cols-2 gap-4 px-4">
      <div className="col-span-2 py-2">
        <Slider
          value={[config.ratio ?? config.quality ?? 50]}
          onValueChange={(value) => {
            const next = getImageCompressionPresetByRatio(
              value[0],
              config.format ?? FormatEnum.JPG,
            );
            onConfigChange(next.patch);
          }}
          min={10}
          max={100}
          step={5}
          className="w-full"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          压缩系数 {config.ratio ?? config.quality ?? 50}%（越高通常质量更好，体积更大）
        </p>
      </div>

      <div className="space-y-2">
        <Label>颜色模式</Label>
        <ColorModeSelect
          value={config.color_mode}
          onValueChange={(colorMode) => onConfigChange({ color_mode: colorMode })}
        />
      </div>

      <div className="space-y-2">
        <Label>DPI</Label>
        <DpiSelect
          value={config.dpi}
          onValueChange={(dpi) => onConfigChange({ dpi })}
        />
      </div>

      <div className="flex items-center gap-2 pt-6">
        <Checkbox
          checked={config.strip_metadata ?? true}
          onCheckedChange={(checked) =>
            onConfigChange({ strip_metadata: checked === true })
          }
        />
        <Label>移除元数据</Label>
      </div>

      <div className="flex items-center gap-2 pt-6">
        <Checkbox
          checked={config.keep_transparency ?? true}
          onCheckedChange={(checked) =>
            onConfigChange({ keep_transparency: checked === true })
          }
        />
        <Label>保留透明</Label>
      </div>

      <div className="flex items-center gap-2 pt-6">
        <Checkbox
          checked={config.crop_whitespace ?? false}
          onCheckedChange={(checked) =>
            onConfigChange({ crop_whitespace: checked === true })
          }
        />
        <Label>裁剪空白</Label>
      </div>
    </div>
  );
};

export const CompressionSettingsDialog: React.FC<CompressionSettingsProps> = ({
  config,
  onConfigChange,
  onSave,
}) => {
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
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 pb-4 pt-8">
            <div className="space-y-1">
              <DialogTitle>压缩设置</DialogTitle>
              <DialogDescription>仅修改当前任务的压缩参数</DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <CompressionSettingsForm config={config} onConfigChange={onConfigChange} />
            </ScrollArea>
          </div>

          <DialogFooter className="flex flex-row items-center justify-between space-y-0 border-b px-4 pb-2 pt-8">
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                onSave(config);
                setOpen(false);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const CompressionSettingsPopover: React.FC<CompressionSettingsProps> = ({
  trigger,
  config,
  onConfigChange,
  onSave,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex">
      <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <PopoverTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" className="h-9 w-[10em] cursor-pointer">
              <Slider
                value={[config.ratio ?? config.quality ?? 10]}
                disabled
                min={10}
                max={100}
                step={5}
                className="w-full"
              />
              <Settings className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </PopoverTrigger>

        <PopoverContent className="h-[72vh] w-[28rem] p-0">
          <div className="flex h-full flex-col">
            <div className="space-y-1 p-4 pb-3">
              <div className="text-sm font-semibold">压缩设置</div>
              <div className="text-xs text-muted-foreground">修改全局压缩参数</div>
            </div>

            <ScrollArea className="min-h-0 flex-1 overflow-hidden px-4">
              <CompressionSettingsForm config={config} onConfigChange={onConfigChange} />
            </ScrollArea>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-popover/95 p-4 backdrop-blur">
              <Button
                className="cursor-pointer"
                variant="outline"
                onClick={() => setIsSettingsOpen(false)}
              >
                取消
              </Button>
              <Button
                className="cursor-pointer"
                onClick={() => {
                  onSave(config);
                  setIsSettingsOpen(false);
                }}
              >
                应用到全部
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
