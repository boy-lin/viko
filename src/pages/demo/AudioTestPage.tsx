// 音频播放器测试页面
// 用于测试独立的音频播放器组件

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { open } from "@tauri-apps/plugin-dialog";
import MusicPlayer from "@/components/player/MusicPlayer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const AudioTestPage: React.FC = () => {
  const [filePath, setFilePath] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [artist, setArtist] = useState<string>("");

  // 选择音频文件
  const handleSelectFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "音频文件",
            extensions: ["mp3", "wav", "aac", "flac", "m4a", "ogg", "opus"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        setFilePath(selected);
        // 从文件路径提取文件名作为标题
        const fileName = selected.split("/").pop() || "";
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
        setTitle(nameWithoutExt);
        setArtist(""); // 可以后续从音频元数据中提取
      }
    } catch (err) {
      console.error("选择文件失败:", err);
    }
  }, []);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>音频播放器测试</CardTitle>
          <CardDescription>
            测试独立的音频播放器组件，验证音频播放逻辑是否正常工作
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 文件选择区域 */}
          <div className="mb-6">
            <Button
              onClick={handleSelectFile}
              variant="default"
              size="lg"
              className="w-full"
            >
              选择音频文件
            </Button>
            {filePath && (
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">当前文件：</p>
                <p className="text-sm text-muted-foreground truncate">
                  {filePath}
                </p>
              </div>
            )}
          </div>

          {/* 音乐播放器 */}
          <MusicPlayer
            filePath={filePath}
            title={title}
            artist={artist}
            autoPlay={false}
          />

          {/* 使用说明 */}
          <div className="mt-8 p-4 bg-muted rounded-lg">
            <h3 className="text-sm font-semibold mb-2">使用说明：</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                点击"选择音频文件"按钮，选择一个音频文件（支持 mp3, wav, aac,
                flac, m4a, ogg, opus）
              </li>
              <li>选择文件后，可以使用播放、暂停、停止按钮控制播放</li>
              <li>使用快退/快进按钮可以跳转 ±10 秒</li>
              <li>使用音量滑块调整音量（0-150%）</li>
              <li>点击音量图标可以快速静音/取消静音</li>
            </ul>
          </div>

          {/* 技术说明 */}
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h3 className="text-sm font-semibold mb-2">技术说明：</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                音频播放器使用{" "}
                <code className="bg-background px-1 rounded">ffmpeg-next</code>{" "}
                进行音频解码
              </li>
              <li>
                使用 <code className="bg-background px-1 rounded">cpal</code>{" "}
                进行音频输出
              </li>
              <li>支持实时重采样和格式转换</li>
              <li>所有音频处理在 Rust 后端完成，前端通过 Tauri 命令调用</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AudioTestPage;
