import { open } from "@tauri-apps/plugin-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Type, Image as ImageIcon, Upload, Settings2, LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { positionOptions, type WatermarkEditorConfig } from "./types";

type SettingsPanelProps = {
  config: WatermarkEditorConfig;
  onChange: (patch: Partial<WatermarkEditorConfig>) => void;
  className?: string;
};

export function SettingsPanel({ config, onChange, className }: SettingsPanelProps) {
  const { t } = useTranslation("watermark");
  const getDefaultOffsets = (anchor: string) => {
    const isCenterX = !anchor.includes("l") && !anchor.includes("r");
    const isCenterY = !anchor.includes("t") && !anchor.includes("b");
    return {
      offsetX: isCenterX ? 0 : 10,
      offsetY: isCenterY ? 0 : 10,
      offsetUnit: "px" as const,
    };
  };

  const handleSelectWatermarkImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: t("settings.image.filterName"), extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (selected && typeof selected === "string") {
        onChange({ imagePath: selected });
      }
    } catch (err) {
      console.error("Failed to select image:", err);
    }
  };

  return (
    <div className={cn("w-full overflow-y-auto bg-card p-6", className)}>
      <div className="flex items-center gap-2 mb-6">
        <Settings2 className="w-5 h-5" />
        <h2 className="font-semibold text-lg">{t("settings.title")}</h2>
      </div>

      <Tabs value={config.type} className="w-full" onValueChange={(v) => onChange({ type: v as "text" | "image" })}>
        <TabsList className="w-full grid grid-cols-2 mb-6">
          <TabsTrigger value="text" className="flex gap-2">
            <Type className="w-4 h-4" /> {t("settings.tabs.text")}
          </TabsTrigger>
          <TabsTrigger value="image" className="flex gap-2">
            <ImageIcon className="w-4 h-4" /> {t("settings.tabs.image")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="space-y-6">
          <div className="space-y-2">
            <Label>{t("settings.text.content")}</Label>
            <Input
              value={config.text}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder={t("settings.text.contentPlaceholder")}
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>{t("settings.text.fontSize", { value: config.size })}</Label>
            </div>
            <Slider value={[config.size]} min={10} max={200} step={1} onValueChange={(v) => onChange({ size: v[0] })} />
          </div>
        </TabsContent>

        <TabsContent value="image" className="space-y-6">
          <div
            onClick={handleSelectWatermarkImage}
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer relative overflow-hidden"
          >
            {config.imagePath ? (
              <div className="relative z-10">
                <p className="text-xs truncate max-w-full px-2">{config.imagePath}</p>
                <Button variant="ghost" size="sm" className="mt-2 h-6">
                  {t("settings.image.change")}
                </Button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("settings.image.clickToUpload")}</p>
              </>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>{t("settings.image.scale", { value: config.size })}</Label>
            </div>
            <Slider value={[config.size]} min={10} max={200} step={1} onValueChange={(v) => onChange({ size: v[0] })} />
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 space-y-6 border-t pt-6">
        <div className="space-y-4">
          <div className="flex justify-between">
            <Label>{t("settings.common.opacity", { value: config.opacity })}</Label>
          </div>
          <Slider value={[config.opacity]} max={100} step={1} onValueChange={(v) => onChange({ opacity: v[0] })} />
        </div>

        <div className="space-y-4" title={t("settings.common.notSupported")}>
          <div className="flex justify-between">
            <Label>{t("settings.common.rotation", { value: config.rotation })}</Label>
          </div>
          <Slider value={[config.rotation]} min={-180} max={180} step={5} onValueChange={(v) => onChange({ rotation: v[0] })} />
        </div>

        <div className="space-y-2">
          <Label>{t("settings.common.position")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {positionOptions.map((pos) => (
              <Button
                key={pos}
                variant={config.position === pos ? "default" : "outline"}
                size="sm"
                className="h-8"
                onClick={() => onChange({ position: pos, ...getDefaultOffsets(pos) })}
              >
                <LayoutTemplate className="w-3 h-3" />
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
