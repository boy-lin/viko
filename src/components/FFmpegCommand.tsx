import React from "react";
import { generateFFmpegCommand } from "../utils/ffmpeg";

interface Props {
  fileInfo: any;
  config: any;
}

const FFmpegCommand: React.FC<Props> = ({ fileInfo, config }) => {
  if (!fileInfo || !config) return null;
  const outputPath = `${config.outputDir}/${config.outputName}`;

  const cmd = generateFFmpegCommand({
    input: fileInfo.path,
    output: outputPath,
    resolution: config.resolution,
    quality: config.quality,
    format: config.format,
  });

  return (
    <div className="mb-4 p-4 border rounded shadow-sm bg-white">
      <div className="font-semibold mb-2">ffmpeg 命令预览</div>
      <pre className="bg-gray-100 p-2 rounded text-xs">ffmpeg {cmd}</pre>
    </div>
  );
};

export default FFmpegCommand;
