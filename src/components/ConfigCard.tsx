// 配置卡片组件，选择分辨率、尺寸、质量、输出格式 Cursor Write It

import React from "react";
import { RESOLUTIONS, OUTPUT_FORMATS } from "../constants/video";

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
          <label className="block mb-1">分辨率</label>
          <select
            className="w-full border rounded px-2 py-1"
            value={config.resolution || ""}
            onChange={(e) =>
              setConfig({ ...config, resolution: e.target.value })
            }
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1">输出格式</label>
          <select
            className="w-full border rounded px-2 py-1"
            value={config.format || ""}
            onChange={(e) => {
              console.log(`e.target.value ${e.target.value}`);
              setConfig({ ...config, format: e.target.value });
            }}
          >
            <option value="">请选择</option>
            {OUTPUT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1">视频质量（比特率）</label>
          <input
            className="w-full border rounded px-2 py-1"
            type="text"
            placeholder="如 2M"
            value={config.quality || ""}
            onChange={(e) => setConfig({ ...config, quality: e.target.value })}
          />
        </div>
        <div>
          <label className="block mb-1">输出文件名</label>
          <input
            className="w-full border rounded px-2 py-1"
            type="text"
            placeholder="output"
            value={config.outputName}
            onChange={(e) =>
              setConfig({ ...config, outputName: e.target.value })
            }
          />
        </div>
        <div>
          <label className="block mb-1">输出目录</label>
          <input
            className="w-full border rounded px-2 py-1"
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
