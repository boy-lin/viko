import React, { useEffect, useState } from "react";
import { downloadDir } from "@tauri-apps/api/path"; // 获取下载目录 Cursor Write It
import { invoke } from "@tauri-apps/api/core";
import FileSelector from "./components/FileSelector";
import VideoPreview from "./components/VideoPreview";
import ConfigCard from "./components/ConfigCard";
import FFmpegCommand from "./components/FFmpegCommand";
import TranscodeButton from "./components/TranscodeButton";
import OutputPreview from "./components/OutputPreview";
import SelfCheck from "./components/SelfCheck";
import ModuleManager from "./components/moduleManager/List";

type SelfCheckResult = {
  ffmpeg_installed: boolean;
  ffprobe_installed: boolean;
  fs_permission: boolean;
};

const App: React.FC = () => {
  // 全局状态管理 Cursor Write It
  const [, setChecksPassed] = useState(false);
  const [selfCheckVisible, setSelfCheckVisible] = useState(false);
  const [activeView, setActiveView] = useState<"main" | "modules">("main");
  const [fileInfo, setFileInfo] = useState<any>(null); // 文件信息 Cursor Write It
  const [config, setConfig] = useState<any>({
    outputName: "output",
    outputDir: "", // 初始为空，后续自动设置 Cursor Write It
    format: "mp4",
  }); // 转码配置 Cursor Write It
  const [progress, setProgress] = useState<string>("0"); // 转码进度 Cursor Write It
  const [isOk, setOutputFile] = useState<boolean>(false); // 输出文件路径 Cursor Write It

  // 首次渲染时自动获取 Downloads 目录 Cursor Write It
  useEffect(() => {
    if (!config.outputDir) {
      downloadDir().then((dir) => {
        setConfig((cfg: any) => ({ ...cfg, outputDir: dir }));
      });
    }
  }, [config.outputDir]);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await invoke<SelfCheckResult>("run_self_check");
        if (
          res.ffmpeg_installed &&
          res.ffprobe_installed &&
          res.fs_permission
        ) {
          setChecksPassed(true);
          setSelfCheckVisible(false);
        } else {
          setChecksPassed(false);
          setSelfCheckVisible(true);
        }
      } catch (err) {
        console.error("self check failed", err);
        setChecksPassed(false);
        setSelfCheckVisible(true);
      }
    };
    check();
  }, []);

  // 暂时移除事件监听器，避免 Tauri 事件系统初始化问题 Cursor Write It
  // 后续可以通过轮询或其他方式获取转码进度

  if (activeView === "modules") {
    return <ModuleManager onBack={() => setActiveView("main")} />;
  }

  return (
    <div className="h-full bg-slate-950 text-white">
      <div className="px-6 py-4 border-b border-white/10 bg-white/5 backdrop-blur flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">FigureX 视频转码</div>
          <div className="text-sm text-white/70">管理转码任务与依赖模块</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView("modules")}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10 transition"
          >
            模块管理
          </button>
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

      {selfCheckVisible && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="w-full h-full md:h-auto md:max-w-5xl md:max-h-[90vh] overflow-auto md:rounded-2xl md:border md:border-white/10 md:bg-white/5">
            <SelfCheck
              onPassed={() => {
                setChecksPassed(true);
                setSelfCheckVisible(false);
                setActiveView("main");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
