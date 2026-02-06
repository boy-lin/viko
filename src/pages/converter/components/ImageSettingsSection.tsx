import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConvertImageTaskArgs } from "@/lib/bridge";

type ImageConfig = Pick<ConvertImageTaskArgs, "format" | "image_encoder" | "resolution">

interface ImageSettingsSectionProps extends ImageConfig {
  onImageChange: (image: Partial<ImageConfig>) => void;
  onReset?: () => void;
}

export const ImageSettingsSection: React.FC<ImageSettingsSectionProps> = ({
  format,
  image_encoder,
  resolution,
  onImageChange,
  onReset,
}) => {
  const { t } = useTranslation("converter");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">{t("settings.image.title")}</h3>
        {onReset && (
          <Button variant="ghost" size="icon" onClick={onReset}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t("settings.image.resolution")}</Label>
          <Input
            type="text"
            value={resolution || "auto"}
            onChange={(e) =>
              onImageChange({ resolution: e.target.value })
            }
            placeholder="auto"
          />
        </div>
      </div>

      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
