import React from "react";
import VideoPreview from "./VideoPlayer";
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
}

const OutputPreview: React.FC<Props> = ({ config }) => {
  const filePath = `${config.outputDir}/${config.outputName}.${config.format}`;
  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">输出预览</CardTitle>
        <CardDescription>确认输出路径并快速回看转码结果。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-secondary/30 p-3 text-sm text-foreground">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            输出路径
          </div>
          <div className="break-all font-medium text-primary">{filePath}</div>
        </div>

        <VideoPreview filePath={filePath} />
      </CardContent>
    </Card>
  );
};

export default OutputPreview;
