// 文件选择组件，负责选择视频文件并展示基本信息 Cursor Write It

import React, { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { formatFileSize } from "@/lib/file";
import { FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileInfo {
  path: string;
  size: number;
  format: string;
  format_long_name?: string;
  codec: string;
  codec_long_name?: string;
  resolution: string;
  width: number;
  height: number;
  duration: number;
  output_dir: string;
  bitrate?: string;
  fps?: string;
  avg_frame_rate?: string;
  nb_frames?: number;
  pix_fmt?: string;
  color_space?: string;
  color_range?: string;
  audio_codec?: string;
  audio_codec_long_name?: string;
  audio_channels?: string;
  audio_channel_layout?: string;
  audio_sample_rate?: string;
  audio_bitrate?: string;
  audio_bits_per_sample?: string;
  audio_sample_fmt?: string;
  format_bitrate?: string;
  format_tags?: Record<string, any>;
}

interface Props {
  onFileSelected: (info: FileInfo) => void;
}

const FileSelector: React.FC<Props> = ({ onFileSelected }) => {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState("");

  // 选择文件并生成预览 Cursor Write It
  const handleSelect = async () => {
    setError("");
    try {
      const file = await open({
        multiple: false,
        directory: false,
      });

      console.log(`file path2: ${file}`);

      if (!file) {
        throw new Error("未选择文件");
      }
      // 获取文件详细信息 Cursor Write It
      try {
        const info = await invoke<FileInfo>("get_media_info", { path: file });
        console.log(`file info: ${JSON.stringify(info)}`);
        setFileInfo(info);

        // 读取二进制内容并生成 Blob URL
        // const data = await readFile(file);
        // const blob = new Blob([new Uint8Array(data)], { type: "video/mp4" }); // 可根据实际类型调整
        // const url = URL.createObjectURL(blob);
        onFileSelected(info);
      } catch (infoError) {
        console.error(`获取文件信息失败:${infoError}`);
      }
    } catch (e: any) {
      const msg = e.message || "文件选择失败";
      console.error(msg);
      setError(msg);
    }
  };

  // 格式化时长显示 Cursor Write It
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }
  };

  return (
    <div className="mb-4 p-4 border rounded shadow-sm bg-white">
      <Button
        variant="default"
        className="flex items-center gap-2"
        onClick={handleSelect}
      >
        <FileVideo className="w-5 h-5" />
        选择视频文件
      </Button>
      {fileInfo && (
        <div className="mt-4 text-sm space-y-2 w-full">
          <div className="font-semibold text-gray-800">文件信息</div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>文件路径：</div>
            <div className="break-all">{fileInfo.path}</div>

            <div>文件大小：</div>
            <div>{formatFileSize(fileInfo.size)}</div>

            <div>文件格式：</div>
            <div>{fileInfo.format}</div>

            <div>视频编码：</div>
            <div>{fileInfo.codec || "未知"}</div>

            <div>分辨率：</div>
            <div>{fileInfo.resolution}</div>

            <div>时长：</div>
            <div>{formatDuration(fileInfo.duration)}</div>

            {fileInfo.bitrate && (
              <>
                <div>比特率：</div>
                <div>{fileInfo.bitrate} bps</div>
              </>
            )}

            {fileInfo.fps && (
              <>
                <div>帧率：</div>
                <div>{fileInfo.fps} fps</div>
              </>
            )}

            {fileInfo.audio_codec && (
              <>
                <div>音频编码：</div>
                <div>{fileInfo.audio_codec}</div>
              </>
            )}

            {fileInfo.audio_channels && (
              <>
                <div>音频声道：</div>
                <div>{fileInfo.audio_channels}</div>
              </>
            )}

            {fileInfo.audio_sample_rate && (
              <>
                <div>采样率：</div>
                <div>{fileInfo.audio_sample_rate} Hz</div>
              </>
            )}
          </div>
        </div>
      )}
      {error && <div className="mt-2 text-red-600 text-sm">错误：{error}</div>}
    </div>
  );
};

export default FileSelector;
