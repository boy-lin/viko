import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VideoResolutionSection } from "@/components/biz-form/VideoResolutionSection";
import { DpiSelect } from "@/components/biz-form/DpiSelect";
import { ColorModeSelect } from "@/components/biz-form/ColorModeSelect";
import { ConvertGifTaskArgs } from "@/lib/mediaTaskEvent";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { BadgeQuestionMark } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

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

const FieldLabelWithHelp = ({ label, helpText }: { label: string; helpText: string }) => (
  <div className="flex items-center gap-1">
    <Label className="text-muted-foreground">{label}</Label>
    <Tooltip>
      <TooltipTrigger asChild>
        <BadgeQuestionMark className="h-[1em] w-[1em] cursor-help text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 whitespace-normal break-words">
        {helpText}
      </TooltipContent>
    </Tooltip>
  </div>
);

export const GifSettingsSection: React.FC<GifSettingsSectionProps> = ({
  width,
  height,
  frame_rate,
  quality,
  preserve_transparency,
  color_mode,
  dpi,
  loop_count,
  // frame_delay,
  colors,
  preserve_extensions,
  sharpen,
  denoise,
  onChange,
  className,
}) => {
  const { t } = useTranslation("task");
  const resolution = width && height ? `${width}x${height}` : "auto";

  return (
    <ScrollArea className={cn("flex-1 overflow-hidden p-2 space-y-4", className)}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <VideoResolutionSection
          className="col-span-2"
          label={t("settings.image.fields.resolution")}
          helpText={t("settings.image.fields.resolutionHelp")}
          resolution={resolution}
          onChange={(value) => {
            if (value === "auto") {
              onChange({ width: undefined, height: undefined });
              return;
            }
            const [nextWidth, nextHeight] = value.split("x").map(Number);
            onChange({ width: nextWidth, height: nextHeight });
          }}
        />

        <div className="space-y-2">
          <FieldLabelWithHelp
            label={t("settings.image.fields.quality")}
            helpText={t("settings.gif.fields.qualityHelp")}
          />
          <Input
            type="number"
            min={1}
            max={100}
            value={quality ?? ""}
            onChange={(e) => onChange({ quality: parseNumberOrUndefined(e.target.value) })}
            placeholder={t("settings.gif.placeholders.quality")}
          />
        </div>

        <div className="space-y-2">
          <FieldLabelWithHelp
            label={t("settings.gif.fields.frameRate")}
            helpText={t("settings.gif.fields.frameRateHelp")}
          />
          <Input
            type="number"
            min={1}
            value={frame_rate ?? ""}
            onChange={(e) => onChange({ frame_rate: parseNumberOrUndefined(e.target.value) })}
            placeholder={t("settings.gif.placeholders.frameRate")}
          />
        </div>

        <div className="space-y-2">
          <FieldLabelWithHelp
            label={t("settings.gif.fields.loopCount")}
            helpText={t("settings.gif.fields.loopCountHelp")}
          />
          <Input
            type="number"
            min={0}
            value={loop_count ?? ""}
            onChange={(e) => onChange({ loop_count: parseNumberOrUndefined(e.target.value) })}
            placeholder={t("settings.gif.placeholders.loopCount")}
          />
        </div>

        {/* <div className="space-y-2">
          <Label className="text-muted-foreground">Frame Delay (ms)</Label>
          <Input
            type="number"
            min={0}
            value={frame_delay ?? ""}
            onChange={(e) => onChange({ frame_delay: parseNumberOrUndefined(e.target.value) })}
            placeholder={t("settings.gif.placeholders.frameDelay")}
          />
        </div> */}

        <div className="space-y-2">
          <FieldLabelWithHelp
            label={t("settings.gif.fields.colors")}
            helpText={t("settings.gif.fields.colorsHelp")}
          />
          <Input
            type="number"
            min={2}
            max={256}
            value={colors ?? ""}
            onChange={(e) => onChange({ colors: parseNumberOrUndefined(e.target.value) })}
            placeholder={t("settings.gif.placeholders.colors")}
          />
        </div>

        <div className="space-y-2">
          <FieldLabelWithHelp
            label={t("settings.gif.fields.dpi")}
            helpText={t("settings.gif.fields.dpiHelp")}
          />
          <DpiSelect
            value={dpi}
            onValueChange={(nextDpi) => onChange({ dpi: nextDpi })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabelWithHelp
            label={t("settings.gif.fields.colorMode")}
            helpText={t("settings.gif.fields.colorModeHelp")}
          />
          <ColorModeSelect
            value={color_mode}
            onValueChange={(nextColorMode) => onChange({ color_mode: nextColorMode })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 pt-2 mb-2 gap-x-8 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={preserve_transparency ?? false}
            onCheckedChange={(checked) => onChange({ preserve_transparency: checked === true })}
          />
          <span className="inline-flex items-center gap-1">
            {t("settings.gif.fields.preserveTransparency")}
            <Tooltip>
              <TooltipTrigger asChild>
                <BadgeQuestionMark className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 whitespace-normal break-words">
                {t("settings.gif.fields.preserveTransparencyHelp")}
              </TooltipContent>
            </Tooltip>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={preserve_extensions ?? false}
            onCheckedChange={(checked) => onChange({ preserve_extensions: checked === true })}
          />
          <span className="inline-flex items-center gap-1">
            {t("settings.gif.fields.preserveExtensions")}
            <Tooltip>
              <TooltipTrigger asChild>
                <BadgeQuestionMark className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 whitespace-normal break-words">
                {t("settings.gif.fields.preserveExtensionsHelp")}
              </TooltipContent>
            </Tooltip>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={sharpen ?? false}
            onCheckedChange={(checked) => onChange({ sharpen: checked === true })}
          />
          <span className="inline-flex items-center gap-1">
            {t("settings.gif.fields.sharpen")}
            <Tooltip>
              <TooltipTrigger asChild>
                <BadgeQuestionMark className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 whitespace-normal break-words">
                {t("settings.gif.fields.sharpenHelp")}
              </TooltipContent>
            </Tooltip>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={denoise ?? false}
            onCheckedChange={(checked) => onChange({ denoise: checked === true })}
          />
          <span className="inline-flex items-center gap-1">
            {t("settings.gif.fields.denoise")}
            <Tooltip>
              <TooltipTrigger asChild>
                <BadgeQuestionMark className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 whitespace-normal break-words">
                {t("settings.gif.fields.denoiseHelp")}
              </TooltipContent>
            </Tooltip>
          </span>
        </label>
      </div>
    </ScrollArea>
  );
};
