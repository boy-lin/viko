import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageConfig } from "@/types/converter";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ImageSettingsSectionProps {
  image: ImageConfig;
  onImageChange: (image: ImageConfig) => void;
  onReset?: () => void;
}

export const ImageSettingsSection: React.FC<ImageSettingsSectionProps> = ({
  image,
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
          <Label className="text-muted-foreground">{t("settings.image.quality")}</Label>
          <Input
            type="text"
            value={image.quality || "80"}
            onChange={(e) =>
              onImageChange({ ...image, quality: e.target.value })
            }
            placeholder="80"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">{t("settings.image.resolution")}</Label>
          <Input
            type="text"
            value={image.resolution || "auto"}
            onChange={(e) =>
              onImageChange({ ...image, resolution: e.target.value })
            }
            placeholder="auto"
          />
        </div>
      </div>

      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
