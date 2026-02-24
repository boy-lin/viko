import React from "react";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { ConvertImageTaskArgs } from "@/lib/mediaTaskEvent";
import { cn } from "@/lib/utils";
import { ImageResolutionSelect } from "@/components/biz-form/ImageResolutionSelect";

type ImageConfig = Pick<ConvertImageTaskArgs, "format" | "image_encoder" | "width" | "height" | "quality">

interface ImageSettingsSectionProps extends ImageConfig {
  onChange: (config: Partial<ImageConfig>) => void;
  className?: string;
}

export const ImageSettingsSection: React.FC<ImageSettingsSectionProps> = ({
  // format,
  // image_encoder,
  width,
  height,
  // quality,
  onChange,
  className,
}) => {
  const { t } = useTranslation("converter");
  const resolution = width && height ? `${width}x${height}` : "auto";

  return (
    <div className={cn("flex-1 overflow-hidden p-2 space-y-4", className)}>
      {/* <div className="flex items-center justify-between border-b bg-muted/10">
        <h3 className="font-bold text-lg">{t("settings.image.title")}</h3>
        {onReset && (
          <Button variant="ghost" size="icon" onClick={onReset}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div> */}

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t("settings.image.resolution")}</Label>
          <ImageResolutionSelect
            value={resolution}
            onValueChange={(value) => {
              const [width, height] = value.split("x").map(Number);
              onChange({ width, height })
            }}
          />
        </div>
      </div>

      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
