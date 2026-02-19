import { open } from "@tauri-apps/plugin-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Type, Image as ImageIcon, Upload, Settings2, LayoutTemplate } from "lucide-react";
import { positionOptions, type WatermarkEditorConfig } from "./types";

type SettingsPanelProps = {
  config: WatermarkEditorConfig;
  onChange: (patch: Partial<WatermarkEditorConfig>) => void;
};

export function SettingsPanel({ config, onChange }: SettingsPanelProps) {
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
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (selected && typeof selected === "string") {
        onChange({ imagePath: selected });
      }
    } catch (err) {
      console.error("Failed to select image:", err);
    }
  };

  return (
    <div className="w-80 border-r bg-card p-6 overflow-y-auto hidden md:block">
      <div className="flex items-center gap-2 mb-6">
        <Settings2 className="w-5 h-5" />
        <h2 className="font-semibold text-lg">Configuration</h2>
      </div>

      <Tabs value={config.type} className="w-full" onValueChange={(v) => onChange({ type: v as "text" | "image" })}>
        <TabsList className="w-full grid grid-cols-2 mb-6">
          <TabsTrigger value="text" className="flex gap-2">
            <Type className="w-4 h-4" /> Text
          </TabsTrigger>
          <TabsTrigger value="image" className="flex gap-2">
            <ImageIcon className="w-4 h-4" /> Image
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="space-y-6">
          <div className="space-y-2">
            <Label>Content</Label>
            <Input
              value={config.text}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder="Enter watermark text"
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>Font Size ({config.size}px)</Label>
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
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to upload image</p>
              </>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>Scale ({config.size}%)</Label>
            </div>
            <Slider value={[config.size]} min={10} max={200} step={1} onValueChange={(v) => onChange({ size: v[0] })} />
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 space-y-6 border-t pt-6">
        <div className="space-y-4">
          <div className="flex justify-between">
            <Label>Opacity ({config.opacity}%)</Label>
          </div>
          <Slider value={[config.opacity]} max={100} step={1} onValueChange={(v) => onChange({ opacity: v[0] })} />
        </div>

        <div className="space-y-4 opacity-50 cursor-not-allowed" title="Not supported in backend yet">
          <div className="flex justify-between">
            <Label>Rotation ({config.rotation}°)</Label>
          </div>
          <Slider disabled value={[config.rotation]} min={-180} max={180} step={5} onValueChange={(v) => onChange({ rotation: v[0] })} />
        </div>

        <div className="space-y-2">
          <Label>Position</Label>
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
