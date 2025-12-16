// 视频预览组件，支持播放、暂停、拖拽进度 Cursor Write It

import { readFile } from "@tauri-apps/plugin-fs";
import React, { useRef, useState } from "react";
import { getTypeByPath } from "@/lib/file";
import { Button } from "@/components/ui/button";

interface Props {
  filePath?: string;
}

const VideoPreview: React.FC<Props> = ({ filePath }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");

  // 当 fileInfo 变化时，创建视频 URL Cursor Write It
  React.useEffect(() => {
    if (!filePath || filePath === "undefined") return;

    let url: string | null = null;
    async function createVideoUrl() {
      if (!filePath) return;
      console.log(`filePath: ${typeof filePath} ${filePath} `);
      const data = await readFile(filePath);
      const type = getTypeByPath(filePath);
      const blob = new Blob([new Uint8Array(data)], {
        type: `video/${type}`,
      });
      url = URL.createObjectURL(blob);
      setVideoUrl(url);
    }

    createVideoUrl().catch((err) => {
      console.error(`创建视频 URL 失败:${err} ${filePath}`);
    });
    // 清理函数，组件卸载时释放 URL Cursor Write It
    return () => {
      url && URL.revokeObjectURL(url);
    };
  }, [filePath]);

  // 控制播放/暂停 Cursor Write It
  const handlePlay = () => videoRef.current?.play();
  const handlePause = () => videoRef.current?.pause();

  if (!videoUrl) {
    return (
      <div className="mb-4 p-4 border rounded shadow-sm bg-white">
        <div className="mb-2 font-semibold">视频预览</div>
        <div className="text-gray-500">需要先文件</div>
      </div>
    );
  }

  return (
    <div className="mb-4 p-4 border rounded shadow-sm bg-white">
      <div className="mb-2 font-semibold">视频预览</div>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="w-full max-h-64 rounded"
      />
      <div className="flex gap-2 mt-2">
        <Button variant="default" size="sm" onClick={handlePlay}>
          播放
        </Button>
        <Button variant="secondary" size="sm" onClick={handlePause}>
          暂停
        </Button>
      </div>
    </div>
  );
};

export default VideoPreview;
