import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { ConvertImageTaskArgs } from "@/lib/mediaTaskEvent";
import { cn } from "@/lib/utils";

type ImageConfig = Pick<ConvertImageTaskArgs, "format" | "image_encoder" | "resolution">

interface ImageSettingsSectionProps extends ImageConfig {
  onChange: (config: Partial<ImageConfig>) => void;
  className?: string;
}

export const ImageSettingsSection: React.FC<ImageSettingsSectionProps> = ({
  format,
  image_encoder,
  resolution,
  onChange,
  className,
}) => {
  const { t } = useTranslation("converter");
  console.log('format, image_encoder', { format, image_encoder })
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
          <Input
            type="text"
            value={resolution || "auto"}
            onChange={(e) =>
              onChange({ resolution: e.target.value })
            }
            placeholder="auto"
          />
        </div>
      </div>

      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
