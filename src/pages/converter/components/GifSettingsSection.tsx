import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageResolutionSelect } from "@/components/biz-form/ImageResolutionSelect";
import { DpiSelect } from "@/components/biz-form/DpiSelect";
import { ColorModeSelect } from "@/components/biz-form/ColorModeSelect";
import { ConvertGifTaskArgs } from "@/lib/mediaTaskEvent";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type GifConfig = Pick<
  ConvertGifTaskArgs,
  | "format"
  | "width"
  | "height"
  | "frame_rate"
  | "quality"
  | "preserve_transparency"
  | "color_mode"
  | "dpi"
  | "loop_count"
  | "frame_delay"
  | "colors"
  | "preserve_extensions"
  | "sharpen"
  | "denoise"
>;

interface GifSettingsSectionProps extends GifConfig {
  onChange: (config: Partial<GifConfig>) => void;
  className?: string;
}

const parseNumberOrUndefined = (value: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const GifSettingsSection: React.FC<GifSettingsSectionProps> = ({
  width,
  height,
  frame_rate,
  quality,
  preserve_transparency,
  color_mode,
  dpi,
  loop_count,
  frame_delay,
  colors,
  preserve_extensions,
  sharpen,
  denoise,
  onChange,
  className,
}) => {
  const { t } = useTranslation("converter");
  const resolution = width && height ? `${width}x${height}` : "auto";

  return (
    <div className={cn("flex-1 overflow-hidden p-2 space-y-4", className)}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t("settings.image.resolution")}</Label>
          <ImageResolutionSelect
            value={resolution}
            onValueChange={(value) => {
              if (value === "auto") {
                onChange({ width: undefined, height: undefined });
                return;
              }
              const [nextWidth, nextHeight] = value.split("x").map(Number);
              onChange({ width: nextWidth, height: nextHeight });
            }}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">{t("settings.image.quality")}</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={quality ?? ""}
            onChange={(e) => onChange({ quality: parseNumberOrUndefined(e.target.value) })}
            placeholder="1-100"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Frame Rate</Label>
          <Input
            type="number"
            min={1}
            value={frame_rate ?? ""}
            onChange={(e) => onChange({ frame_rate: parseNumberOrUndefined(e.target.value) })}
            placeholder="e.g. 12"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Loop Count</Label>
          <Input
            type="number"
            min={0}
            value={loop_count ?? ""}
            onChange={(e) => onChange({ loop_count: parseNumberOrUndefined(e.target.value) })}
            placeholder="0 = infinite"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Frame Delay (ms)</Label>
          <Input
            type="number"
            min={0}
            value={frame_delay ?? ""}
            onChange={(e) => onChange({ frame_delay: parseNumberOrUndefined(e.target.value) })}
            placeholder="e.g. 80"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Colors</Label>
          <Input
            type="number"
            min={2}
            max={256}
            value={colors ?? ""}
            onChange={(e) => onChange({ colors: parseNumberOrUndefined(e.target.value) })}
            placeholder="2-256"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">DPI</Label>
          <DpiSelect
            value={dpi}
            onValueChange={(nextDpi) => onChange({ dpi: nextDpi })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Color Mode</Label>
          <ColorModeSelect
            value={color_mode}
            onValueChange={(nextColorMode) => onChange({ color_mode: nextColorMode })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={preserve_transparency ?? false}
            onCheckedChange={(checked) => onChange({ preserve_transparency: checked === true })}
          />
          Preserve Transparency
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={preserve_extensions ?? false}
            onCheckedChange={(checked) => onChange({ preserve_extensions: checked === true })}
          />
          Preserve Extensions
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={sharpen ?? false}
            onCheckedChange={(checked) => onChange({ sharpen: checked === true })}
          />
          Sharpen
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={denoise ?? false}
            onCheckedChange={(checked) => onChange({ denoise: checked === true })}
          />
          Denoise
        </label>
      </div>

      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
