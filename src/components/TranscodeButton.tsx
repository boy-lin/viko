// 转码按钮组件，负责调用后端转码并显示进度 Cursor Write It

import React, { useState, useEffect } from "react";
import { bridge } from "@/lib/bridge";
import { generateFFmpegArgs } from "@/lib/ffmpeg";
import { Button } from "@/components/ui/button";

interface Props {
  fileInfo: any;
  config: any;
  onProgress?: Function;
  onComplete: (isOk: boolean) => void;
}

const TranscodeButton: React.FC<Props> = ({ fileInfo, config, onComplete }) => {
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState<string>("");

  // 监听转码进度事件 Cursor Write It
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    bridge
      .on("ffmpeg-progress", (payload) => {
        setProgress(payload);
        console.log("转码进度:", payload);
      })
      .then((off) => {
        unlistenProgress = off;
      });

    bridge
      .on("ffmpeg-complete", () => {
        setIsTranscoding(false);
        onComplete(true);
      })
      .then((off) => {
        unlistenComplete = off;
      });

    return () => {
      unlistenProgress?.();
      unlistenComplete?.();
    };
  }, [onComplete]);

  // 启动转码 Cursor Write It
  const handleTranscode = async () => {
    setIsTranscoding(true);
    setError("");
    setProgress("");
    onComplete(false);
    try {
      // 检查配置是否完整 Cursor Write It
      if (!config.outputName || !config.format) {
        throw new Error("请先配置输出文件名和格式");
      }

      // 检查文件路径是否有效 Cursor Write It
      if (!fileInfo.path || fileInfo.path === fileInfo.file?.name) {
        throw new Error("请选择有效的视频文件");
      }

      // 尝试调用 Tauri invoke 进行真实转码 Cursor Write It

      console.log("开始真实转码..."); // 调试信息 Cursor Write It
      console.log("输入文件:", fileInfo.path); // 调试信息 Cursor Write It
      // 生成 ffmpeg 命令 Cursor Write It
      const ffmpegArgs = generateFFmpegArgs({
        input: fileInfo.path,
        output: `${config.outputDir}/${config.outputName}`,
        resolution: config.resolution,
        quality: config.quality,
        format: config.format,
      });
      await bridge.invoke("ffmpeg_exec", { ffmpegArgs });
      console.log("转码命令已发送"); // 调试信息 Cursor Write It
      // 注意：实际的转码完成会通过事件监听器处理
    } catch (error) {
      console.error("转码时出错:", error);
      setError(error instanceof Error ? error.message : "转码失败");
      setIsTranscoding(false);
    }
  };

  return (
    <div className="mb-4">
      <Button
        variant="default"
        onClick={handleTranscode}
        disabled={isTranscoding}
      >
        {isTranscoding ? "转码中..." : "开始转码"}
      </Button>

      {error && <div className="mt-2 text-red-600 text-sm">错误：{error}</div>}

      {isTranscoding && (
        <div className="mt-2">
          <div className="text-sm text-gray-600 mb-1">正在转码，请稍候...</div>
          {progress && (
            <div className="w-full bg-gray-200 rounded h-2">
              <div
                className="bg-green-500 h-2 rounded transition-all duration-300"
                style={{ width: progress.includes("%") ? progress : "50%" }}
              />
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1">{progress}</div>
        </div>
      )}
    </div>
  );
};

export default TranscodeButton;
