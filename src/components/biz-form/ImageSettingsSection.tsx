import React from "react";
import { useTranslation } from "react-i18next";
import { ConvertImageTaskArgs } from "@/lib/mediaTaskEvent";
import { cn } from "@/lib/utils";
import { ImageResolutionSelect } from "@/components/biz-form/ImageResolutionSelect";

type ImageConfig = Pick<ConvertImageTaskArgs, "format" | "image_encoder" | "width" | "height">

interface ImageSettingsSectionProps extends ImageConfig {
  onChange: (config: Partial<ImageConfig>) => void;
  className?: string;
}

export const ImageSettingsSection: React.FC<ImageSettingsSectionProps> = ({
  // format,
  // image_encoder,
  width,
  height,
  onChange,
  className,
}) => {
  const { t } = useTranslation("common");
  const resolution = width && height ? `${width}x${height}` : "auto";

  return (
    <div className={cn("flex-1 overflow-hidden p-2 space-y-4", className)}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <ImageResolutionSelect
            label={t("settings.image.fields.resolution")}
            helpText={t("settings.image.fields.resolutionHelp")}
            value={resolution}
            onValueChange={(value) => {
              if (value === "auto") {
                onChange({ width: undefined, height: undefined });
                return;
              }
              const [width, height] = value.split("x").map(Number);
              onChange({ width, height })
            }}
          />
      </div>

      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
