import React from "react";
import { generateFFmpegCommand } from "@/lib/ffmpeg";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MediaFileInfo, TranscodeConfig } from "@/types/media";

interface Props {
  fileInfo: MediaFileInfo | null;
  config: TranscodeConfig;
}

const FFmpegCommand: React.FC<Props> = ({ fileInfo, config }) => {
  if (!fileInfo) return null;
  const outputPath = `${config.outputDir}/${config.outputName}`;

  const cmd = generateFFmpegCommand({
    input: fileInfo.path,
    output: outputPath,
    resolution: config.resolution,
    quality: config.quality,
    format: config.format,
  });

  return (
    <Card className="h-full shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">ffmpeg 命令预览</CardTitle>
        <CardDescription>实时同步当前配置，可直接复制到终端执行。</CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="overflow-auto rounded-lg bg-muted px-4 py-3 text-sm text-foreground shadow-inner">
          ffmpeg {cmd}
        </pre>
      </CardContent>
    </Card>
  );
};

export default FFmpegCommand;

