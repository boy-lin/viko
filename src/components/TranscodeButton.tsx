import React, { useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { bridge } from "@/lib/bridge";
import { generateFFmpegArgs } from "@/lib/ffmpeg";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { MediaFileInfo, TranscodeConfig } from "@/types/media";

interface Props {
  fileInfo: MediaFileInfo;
  config: TranscodeConfig;
  onProgress?: (value: string) => void;
  onComplete: (isOk: boolean) => void;
}

const TranscodeButton: React.FC<Props> = ({
  fileInfo,
  config,
  onProgress,
  onComplete,
}) => {
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState<string>("");

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    bridge
      .on("ffmpeg-progress", (payload) => {
        setProgress(payload);
        onProgress?.(payload);
      })
      .then((off) => {
        unlistenProgress = off;
      });

    bridge
      .on("ffmpeg-complete", () => {
        setIsTranscoding(false);
        setProgress("100%");
        onComplete(true);
      })
      .then((off) => {
        unlistenComplete = off;
      });

    return () => {
      unlistenProgress?.();
      unlistenComplete?.();
    };
  }, [onComplete, onProgress]);

  const handleTranscode = async () => {
    setIsTranscoding(true);
    setError("");
    setProgress("0%");
    onComplete(false);

    try {
      if (!config.outputName || !config.format) {
        throw new Error("请填写输出文件名和格式");
      }

      if (!config.outputDir) {
        throw new Error("请指定输出目录");
      }

      if (!fileInfo?.path || fileInfo.path === (fileInfo as any).file?.name) {
        throw new Error("请选择有效的视频文件");
      }

      const ffmpegArgs = generateFFmpegArgs({
        input: fileInfo.path,
        output: `${config.outputDir}/${config.outputName}`,
        resolution: config.resolution,
        quality: config.quality,
        format: config.format,
      });

    } catch (err: any) {
      const msg = err?.message || "转码失败";
      console.error(msg);
      setError(msg);
      setIsTranscoding(false);
    }
  };

  const numericProgress = Number(String(progress).replace("%", ""));
  const progressValue = Number.isFinite(numericProgress) ? numericProgress : 0;

  return (
    <div className="space-y-3">
      <Button
        variant="default"
        onClick={handleTranscode}
        disabled={isTranscoding}
        className="w-full md:w-auto"
      >
        {isTranscoding ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            转码中...
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            开始转码
          </>
        )}
      </Button>

      {error && <div className="text-sm text-destructive">错误：{error}</div>}

      {(isTranscoding || progress) && (
        <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3 shadow-inner">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">进度</span>
            <span className="font-semibold text-primary">
              {progress || "准备中"}
            </span>
          </div>
          <Progress value={progressValue} />
        </div>
      )}
    </div>
  );
};

export default TranscodeButton;

