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
import { Input } from "@/components/ui/input";
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
import { DpiSelectGroup } from "@/components/biz-form/DpiSelectGroup";
import { ColorModeSelect } from "@/components/biz-form/ColorModeSelect";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("task");
  const currentRatio = config.ratio ?? config.quality ?? 50;
  return (
    <div className="grid grid-cols-2 gap-4 px-4">
      <div className="col-span-2 py-2">
        <Slider
          value={[currentRatio]}
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
          {t("imageCompressor.fields.ratioSummary", { ratio: currentRatio })}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t("imageCompressor.fields.colorMode")}</Label>
        <ColorModeSelect
          value={config.color_mode}
          onValueChange={(colorMode) => onConfigChange({ color_mode: colorMode })}
        />
      </div>

      {config.format?.toLowerCase() === FormatEnum.GIF && (
        <div className="space-y-2">
          <Label>GIF Colors</Label>
          <Input
            type="number"
            min={2}
            max={256}
            value={config.colors ?? ""}
            onChange={(e) => {
              const next = e.target.value ? Number(e.target.value) : undefined;
              onConfigChange({
                colors:
                  next === undefined || Number.isNaN(next)
                    ? undefined
                    : Math.min(256, Math.max(2, next)),
              });
            }}
            placeholder="2-256"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>{t("imageCompressor.fields.dpi")}</Label>
        <DpiSelectGroup
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
        <Label>{t("imageCompressor.fields.stripMetadata")}</Label>
      </div>

      <div className="flex items-center gap-2 pt-6">
        <Checkbox
          checked={config.keep_transparency ?? true}
          onCheckedChange={(checked) =>
            onConfigChange({ keep_transparency: checked === true })
          }
        />
        <Label>{t("imageCompressor.fields.keepTransparency")}</Label>
      </div>

      <div className="flex items-center gap-2 pt-6">
        <Checkbox
          checked={config.crop_whitespace ?? false}
          onCheckedChange={(checked) =>
            onConfigChange({ crop_whitespace: checked === true })
          }
        />
        <Label>{t("imageCompressor.fields.cropWhitespace")}</Label>
      </div>
    </div>
  );
};

export const CompressionSettingsDialog: React.FC<CompressionSettingsProps> = ({
  config,
  onConfigChange,
  onSave: _onSave,
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
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 pb-4 pt-8">
            <div className="space-y-1">
              <DialogTitle>{t("imageCompressor.title")}</DialogTitle>
              <DialogDescription>{t("imageCompressor.description")}</DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <CompressionSettingsForm config={config} onConfigChange={onConfigChange} />
            </ScrollArea>
          </div>

          <DialogFooter className="flex flex-row items-center justify-between space-y-0 border-b px-4 pb-2 pt-8">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("imageCompressor.actions.close")}
            </Button>
            {/* <Button
              onClick={() => {
                onSave(config);
                setOpen(false);
              }}
            >
              保存
            </Button> */}
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
  const { t } = useTranslation("task");
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
              <div className="text-sm font-semibold">{t("imageCompressor.title")}</div>
              <div className="text-xs text-muted-foreground">{t("imageCompressor.popoverDescription")}</div>
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
                {t("actions.cancel")}
              </Button>
              <Button
                className="cursor-pointer"
                onClick={() => {
                  onSave(config);
                  setIsSettingsOpen(false);
                }}
              >
                {t("imageCompressor.actions.applyAll")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
