import React, { useEffect, useState } from "react";
import { downloadDir } from "@tauri-apps/api/path";
import { Link } from "react-router-dom";
import { Sparkles, Wand2 } from "lucide-react";
import FileSelector from "@/components/FileSelector";
import VideoPreview from "@/components/VideoPreview";
import ConfigCard from "@/components/ConfigCard";
import FFmpegCommand from "@/components/FFmpegCommand";
import TranscodeButton from "@/components/TranscodeButton";
import OutputPreview from "@/components/OutputPreview";
import { Badge } from "@/components/ui/badge";
import type { MediaFileInfo, TranscodeConfig } from "@/types/media";

const HomePage: React.FC = () => {
  const [fileInfo, setFileInfo] = useState<MediaFileInfo | null>(null);
  const [config, setConfig] = useState<TranscodeConfig>({
    outputName: "output",
    outputDir: "",
    format: "mp4",
  });
  const [progress, setProgress] = useState<string>("");
  const [isOk, setOutputFile] = useState<boolean>(false);

  useEffect(() => {
    if (!config.outputDir) {
      downloadDir().then((dir) => {
        setConfig((cfg) => ({ ...cfg, outputDir: dir }));
      });
    }
  }, [config.outputDir]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-24 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 shadow-xl">
          <div className="absolute left-10 top-10 h-40 w-40 rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute right-0 top-0 h-48 w-48 translate-x-1/3 -translate-y-1/3 rounded-full bg-secondary/40 blur-3xl" />
          <div className="relative grid gap-4 p-6 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit">
                TurboTranscode · 桌面端
              </Badge>
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
                音视频转码工作台
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground">
                按设计系统的色彩与层次优化界面，快速完成文件选择、参数配置、命令预览与转码控制。
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-primary">
                  <Sparkles className="h-4 w-4" />
                  轻量 UI，一致的主题色
                </div>
                {progress && (
                  <div className="inline-flex items-center gap-2 rounded-full bg-secondary/60 px-3 py-1">
                    <Wand2 className="h-4 w-4 text-primary" />
                    当前进度：{progress}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10 transition"
              >
                back
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <FileSelector
              onFileSelected={(info) => {
                setFileInfo(info);
                setProgress("");
                setOutputFile(false);
              }}
            />
            <ConfigCard config={config} setConfig={setConfig} />
            {fileInfo && (
              <TranscodeButton
                fileInfo={fileInfo}
                config={config}
                onProgress={setProgress}
                onComplete={setOutputFile}
              />
            )}
          </div>

          <div className="space-y-6">
            <VideoPreview filePath={fileInfo?.path} />
            {fileInfo && <FFmpegCommand fileInfo={fileInfo} config={config} />}
            {isOk && <OutputPreview config={config} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
