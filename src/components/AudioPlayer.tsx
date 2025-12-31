// 音频播放器组件 - 用于测试音频播放逻辑
// 独立于视频播放器的音频播放器

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { bridge } from "@/lib/bridge";
import { open } from "@tauri-apps/plugin-dialog";
import { Square } from "lucide-react";

// SVG 图标组件
const PlayIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
  </svg>
);

const VolumeIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

const VolumeMutedIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
  </svg>
);

const SkipBackIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
  </svg>
);

const SkipForwardIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
  </svg>
);

const AudioPlayer: React.FC = () => {
  const [filePath, setFilePath] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

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
        setError("");
        setIsPlaying(false);

        // 打开音频文件
        try {
          setIsLoading(true);
          console.log("正在打开音频文件:", selected);
          await bridge.invoke("audio_player_open", { path: selected });
          console.log("音频文件打开成功，获取时长...");
          // 获取音频时长
          const dur = await bridge.invoke<number>("audio_player_get_duration");
          console.log("获取音频时长:", dur, typeof dur);
          if (dur !== undefined && dur !== null && !isNaN(dur)) {
            setDuration(dur);
            setCurrentPosition(0);
          } else {
            console.warn("获取到的音频时长为无效值:", dur);
            setError("无法获取音频时长");
          }
        } catch (err) {
          setError(`打开文件失败: ${err}`);
          console.error("打开音频文件失败:", err);
        } finally {
          setIsLoading(false);
        }
      }
    } catch (err) {
      console.error("选择文件失败:", err);
      setError(`选择文件失败: ${err}`);
    }
  }, []);

  // 播放
  const handlePlay = useCallback(async () => {
    try {
      await bridge.invoke("audio_player_play");
      setIsPlaying(true);
      setError("");
    } catch (err) {
      setError(`播放失败: ${err}`);
      console.error("播放失败:", err);
    }
  }, []);

  // 暂停
  const handlePause = useCallback(async () => {
    try {
      await bridge.invoke("audio_player_pause");
      setIsPlaying(false);
    } catch (err) {
      setError(`暂停失败: ${err}`);
      console.error("暂停失败:", err);
    }
  }, []);

  // 停止
  const handleStop = useCallback(async () => {
    try {
      await bridge.invoke("audio_player_stop");
      setIsPlaying(false);
      setFilePath("");
    } catch (err) {
      setError(`停止失败: ${err}`);
      console.error("停止失败:", err);
    }
  }, []);

  // 快退/快进
  const handleSkip = useCallback(
    async (seconds: number) => {
      try {
        const current = await bridge.invoke<number>(
          "audio_player_get_position"
        );
        const newPosition = Math.max(0, Math.min(duration, current + seconds));
        await bridge.invoke("audio_player_seek", { position: newPosition });
        setCurrentPosition(newPosition);
      } catch (err) {
        console.error("跳转失败:", err);
      }
    },
    [duration]
  );

  // 进度条点击
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || duration === 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newPosition = percentage * duration;
      handleSeek(newPosition);
    },
    [duration]
  );

  // 跳转到指定位置
  const handleSeek = useCallback(async (newPosition: number) => {
    try {
      await bridge.invoke("audio_player_seek", { position: newPosition });
      setCurrentPosition(newPosition);
    } catch (err) {
      console.error("跳转失败:", err);
    }
  }, []);

  // 格式化时间
  const formatTime = useCallback((seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // 更新播放位置
  useEffect(() => {
    if (!isPlaying || isDragging) return;

    const interval = setInterval(async () => {
      try {
        const pos = await bridge.invoke<number>("audio_player_get_position");
        setCurrentPosition(pos);

        // 如果播放完成，自动暂停
        if (duration > 0 && pos >= duration) {
          setIsPlaying(false);
        }
      } catch (err) {
        console.error("获取播放位置失败:", err);
      }
    }, 500); // 每500ms更新一次

    return () => clearInterval(interval);
  }, [isPlaying, duration, isDragging]);

  // 音量控制
  const handleVolumeChange = useCallback(async (value: number) => {
    const nextVolume = Math.max(0, Math.min(1.5, value));
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
    try {
      await bridge.invoke("audio_player_set_volume", { volume: nextVolume });
    } catch (err) {
      console.error("调整音量失败:", err);
    }
  }, []);

  const handleMuteToggle = useCallback(async () => {
    if (isMuted) {
      await handleVolumeChange(volume > 0 ? volume : 0.5);
    } else {
      await handleVolumeChange(0);
    }
  }, [isMuted, volume, handleVolumeChange]);

  // 清理：组件卸载时停止播放
  useEffect(() => {
    return () => {
      bridge.invoke("audio_player_stop").catch(console.error);
    };
  }, []);

  return (
    <div className="mb-4 p-4 border rounded shadow-sm bg-card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">音频播放器测试</h3>
        <p className="text-sm text-muted-foreground mb-4">
          用于测试独立的音频播放逻辑
        </p>
      </div>

      {/* 文件选择 */}
      <div className="mb-4">
        <Button onClick={handleSelectFile} variant="outline" className="w-full">
          选择音频文件
        </Button>
        {filePath && (
          <div className="mt-2 text-sm text-muted-foreground truncate">
            文件: {filePath.split("/").pop()}
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 加载状态 */}
      {isLoading && (
        <div className="mb-4 text-sm text-muted-foreground">正在加载...</div>
      )}

      {/* 播放控制 */}
      {filePath && (
        <div className="space-y-4">
          {/* 进度条 */}
          <div className="space-y-2">
            <div
              ref={progressBarRef}
              onClick={handleProgressClick}
              className="w-full h-2 bg-gray-200 rounded-full cursor-pointer relative group"
            >
              <div
                className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${
                    duration > 0 ? (currentPosition / duration) * 100 : 0
                  }%`,
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  left: `calc(${
                    duration > 0 ? (currentPosition / duration) * 100 : 0
                  }% - 8px)`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentPosition)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="icon"
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={isLoading}
              aria-label={isPlaying ? "暂停" : "播放"}
            >
              {isPlaying ? (
                <PauseIcon className="w-5 h-5" />
              ) : (
                <PlayIcon className="w-5 h-5 ml-0.5" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => handleSkip(-10)}
              disabled={isLoading}
              aria-label="快退 10 秒"
            >
              <SkipBackIcon className="w-5 h-5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => handleSkip(10)}
              disabled={isLoading}
              aria-label="快进 10 秒"
            >
              <SkipForwardIcon className="w-5 h-5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleStop}
              disabled={isLoading}
              aria-label="停止"
            >
              <Square className="w-4 h-4" />
            </Button>
          </div>

          {/* 音量控制 */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMuteToggle}
              aria-label={isMuted ? "取消静音" : "静音"}
            >
              {isMuted || volume === 0 ? (
                <VolumeMutedIcon className="w-5 h-5" />
              ) : (
                <VolumeIcon className="w-5 h-5" />
              )}
            </Button>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${
                    ((isMuted ? 0 : volume) / 1.5) * 100
                  }%, rgba(0,0,0,0.1) ${
                    ((isMuted ? 0 : volume) / 1.5) * 100
                  }%, rgba(0,0,0,0.1) 100%)`,
                }}
              />
            </div>
            <span className="text-sm text-muted-foreground w-12 text-right">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>

          {/* 状态显示 */}
          <div className="text-sm text-muted-foreground">
            <div>状态: {isPlaying ? "播放中" : "已暂停"}</div>
            <div>音量: {Math.round((isMuted ? 0 : volume) * 100)}%</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioPlayer;
