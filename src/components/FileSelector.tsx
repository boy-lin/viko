import React, { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { formatFileSize } from "@/lib/file";
import { FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MediaFileInfo } from "@/types/media";

interface Props {
  onFileSelected: (info: MediaFileInfo) => void;
}

const FileSelector: React.FC<Props> = ({ onFileSelected }) => {
  const [fileInfo, setFileInfo] = useState<MediaFileInfo | null>(null);
  const [error, setError] = useState("");

  const handleSelect = async () => {
    setError("");
    try {
      const file = await open({
        multiple: false,
        directory: false,
      });

      if (!file) {
        throw new Error("尚未选择文件");
      }

      try {
        const info = await invoke<MediaFileInfo>("get_media_info", {
          path: file,
        });
        setFileInfo(info);
        onFileSelected(info);
      } catch (infoError: any) {
        const msg = infoError?.message || "读取文件信息失败";
        setError(msg);
        console.error(msg);
      }
    } catch (e: any) {
      const msg = e?.message || "文件选择失败";
      console.error(msg);
      setError(msg);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="h-full shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <FileVideo className="h-4 w-4" />
          </span>
          选择视频文件
        </CardTitle>
        <CardDescription>
          读取本地文件信息以生成转码参数与预览。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="default"
          className="flex w-full items-center justify-center gap-2 lg:w-auto"
          onClick={handleSelect}
        >
          <FileVideo className="h-5 w-5" />
          选择视频
        </Button>

        {fileInfo && (
          <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              文件信息
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-muted-foreground">文件路径</div>
                <div className="break-all font-medium">{fileInfo.path}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">文件大小</div>
                <div className="font-medium">{formatFileSize(fileInfo.size)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">格式 / 编解码</div>
                <div className="font-medium">
                  {fileInfo.format} · {fileInfo.codec || "未知"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">分辨率</div>
                <div className="font-medium">{fileInfo.resolution}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">时长</div>
                <div className="font-medium">{formatDuration(fileInfo.duration)}</div>
              </div>
              {fileInfo.bitrate && (
                <div className="space-y-1">
                  <div className="text-muted-foreground">比特率</div>
                  <div className="font-medium">{fileInfo.bitrate} bps</div>
                </div>
              )}
              {fileInfo.fps && (
                <div className="space-y-1">
                  <div className="text-muted-foreground">帧率</div>
                  <div className="font-medium">{fileInfo.fps} fps</div>
                </div>
              )}
              {fileInfo.audio_codec && (
                <div className="space-y-1">
                  <div className="text-muted-foreground">音频编码</div>
                  <div className="font-medium">{fileInfo.audio_codec}</div>
                </div>
              )}
              {fileInfo.audio_channels && (
                <div className="space-y-1">
                  <div className="text-muted-foreground">声道</div>
                  <div className="font-medium">{fileInfo.audio_channels}</div>
                </div>
              )}
              {fileInfo.audio_sample_rate && (
                <div className="space-y-1">
                  <div className="text-muted-foreground">采样率</div>
                  <div className="font-medium">{fileInfo.audio_sample_rate} Hz</div>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">错误：{error}</div>
        )}
      </CardContent>
    </Card>
  );
};

export default FileSelector;

