// 配置卡片组件，选择分辨率、尺寸、质量、输出格式 Cursor Write It

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

interface Props {
  config: any;
  setConfig: (cfg: any) => void;
}

const ConfigCard: React.FC<Props> = ({ config, setConfig }) => {
  return (
    <div className="mb-4 p-4 border rounded shadow-sm bg-white">
      <div className="font-semibold mb-2">转码参数配置</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="block mb-1">分辨率</Label>
          <Select
            value={config.resolution || ""}
            onValueChange={(value) =>
              setConfig({ ...config, resolution: value })
            }
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
        <div>
          <Label className="block mb-1">输出格式</Label>
          <Select
            value={config.format}
            onValueChange={(value) => {
              console.log(`e.target.value ${value}`);
              setConfig({ ...config, format: value });
            }}
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
        <div>
          <Label className="block mb-1">视频质量（比特率）</Label>
          <Input
            type="text"
            placeholder="如 2M"
            value={config.quality || ""}
            onChange={(e) => setConfig({ ...config, quality: e.target.value })}
          />
        </div>
        <div>
          <Label className="block mb-1">输出文件名</Label>
          <Input
            type="text"
            placeholder="output"
            value={config.outputName}
            onChange={(e) =>
              setConfig({ ...config, outputName: e.target.value })
            }
          />
        </div>
        <div>
          <Label className="block mb-1">输出目录</Label>
          <Input
            type="text"
            placeholder="如"
            value={config.outputDir}
            onChange={(e) =>
              setConfig({ ...config, outputDir: e.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
};

export default ConfigCard;
