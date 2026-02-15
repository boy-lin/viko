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
import { CompressImageTaskArgs } from "@/lib/bridge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings } from "lucide-react";
const IMAGE_DPI = [72, 96, 150, 300, 600];

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
  console.log('config', config);
  const IMAGE_COLOR_MODES = ["RGB", "RGBA", "Gray", "CMYK"];

  const parseOptionalFloat = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

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
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            质量百分比: {config.quality}%
          </label>
          <Slider
            value={[config.quality]}
            onValueChange={(value) => {
              onConfigChange({ quality: value[0] });
            }}
            min={10}
            max={100}
            step={5}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">
            图片质量设置为 {config.quality}%（数值越高，质量越好，文件越大）
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {renderSelect(
            "颜色模式",
            config.color_mode,
            IMAGE_COLOR_MODES,
            "自动",
            (val) =>
              onConfigChange({
                color_mode: typeof val === "string" ? val : undefined,
              })
          )}
          {renderSelect(
            "DPI",
            config.dpi,
            IMAGE_DPI,
            "默认",
            (val) =>
              onConfigChange({
                dpi:
                  typeof val === "number" ? val : parseOptionalFloat(String(val)),
              })
          )}
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              checked={config.strip_metadata ?? true}
              onCheckedChange={(checked) =>
                onConfigChange({ strip_metadata: checked === true })
              }
            />
            <Label>去除元数据</Label>
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
