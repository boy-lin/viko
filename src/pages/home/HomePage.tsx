import React, { useEffect, useState } from "react";
import { downloadDir } from "@tauri-apps/api/path";
import { Link } from "react-router-dom";
import FileSelector from "@/components/FileSelector";
import VideoPreview from "@/components/VideoPreview";
import ConfigCard from "@/components/ConfigCard";
import FFmpegCommand from "@/components/FFmpegCommand";
import TranscodeButton from "@/components/TranscodeButton";
import OutputPreview from "@/components/OutputPreview";

const HomePage: React.FC = () => {
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [config, setConfig] = useState<any>({
    outputName: "output",
    outputDir: "",
    format: "mp4",
  });
  const [progress, setProgress] = useState<string>("0");
  const [isOk, setOutputFile] = useState<boolean>(false);

  // 首次渲染时自动获取 Downloads 目录
  useEffect(() => {
    if (!config.outputDir) {
      downloadDir().then((dir) => {
        setConfig((cfg: any) => ({ ...cfg, outputDir: dir }));
      });
    }
  }, [config.outputDir]);

  return (
    <>
      <div className="px-6 py-4 border-b border-white/10 bg-white/5 backdrop-blur flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">audio_video_kit 视频转码</div>
          <div className="text-sm text-white/70">管理转码任务与依赖模块</div>
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

      <div className="container m-auto p-4">
        <div className="bg-white text-slate-900 rounded-2xl shadow-2xl p-6">
          <h1 className="text-2xl font-bold mb-6">视频转码工具</h1>
          <div className="flex gap-4 flex-col md:flex-row">
            <FileSelector onFileSelected={setFileInfo} />
            <VideoPreview filePath={`${fileInfo?.path}`} />
          </div>
          <div className="flex gap-4 flex-col md:flex-row mt-4">
            <div className="flex-1">
              <ConfigCard config={config} setConfig={setConfig} />
            </div>
            <div className="flex-1">
              <FFmpegCommand fileInfo={fileInfo} config={config} />
            </div>
          </div>
          {fileInfo && (
            <div className="mt-4">
              <TranscodeButton
                fileInfo={fileInfo}
                config={config}
                onProgress={setProgress}
                onComplete={setOutputFile}
              />
            </div>
          )}
          {/* 进度条简单展示 */}
          {progress !== "0" && (
            <div className="mb-4 mt-2">
              <div className="text-sm">转码进度：{progress}</div>
            </div>
          )}
          {isOk && <OutputPreview config={config} />}
        </div>
      </div>
    </>
  );
};

export default HomePage;
