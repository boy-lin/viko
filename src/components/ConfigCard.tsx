import React from "react";
import { RESOLUTIONS, OUTPUT_FORMATS } from "../constants/video";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TranscodeConfig } from "@/types/media";

interface Props {
  config: TranscodeConfig;
  setConfig: (cfg: TranscodeConfig) => void;
}

const ConfigCard: React.FC<Props> = ({ config, setConfig }) => {
  return (
    <Card className="h-full shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">转码参数</CardTitle>
        <CardDescription>
          选定目标规格后会自动生成 ffmpeg 命令，便于复制和复用。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">分辨率</Label>
          <Select
            value={config.resolution || ""}
            onValueChange={(value) => setConfig({ ...config, resolution: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择分辨率" />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">输出格式</Label>
          <Select
            value={config.format}
            onValueChange={(value) => setConfig({ ...config, format: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择输出格式" />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">视频质量（比特率）</Label>
          <Input
            type="text"
            placeholder="例如 2M"
            value={config.quality || ""}
            onChange={(e) => setConfig({ ...config, quality: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            不填写则沿用源文件默认质量。
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">输出文件名</Label>
          <Input
            type="text"
            placeholder="output"
            value={config.outputName}
            onChange={(e) => setConfig({ ...config, outputName: e.target.value })}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label className="text-sm text-muted-foreground">输出目录</Label>
          <Input
            type="text"
            placeholder="如 C:\\Users\\你\\Downloads"
            value={config.outputDir}
            onChange={(e) => setConfig({ ...config, outputDir: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ConfigCard;

