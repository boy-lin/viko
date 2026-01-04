// 视频预览组件 - 基于 ffmpeg-next 的视频播放器
// YouTube 风格的视频播放器 UI

import React, { useRef, useEffect, useState, useCallback } from "react";
import { bridge } from "@/lib/bridge";
import { Button } from "@/components/ui/button";
interface Props {
  filePath?: string;
  title?: string;
  className?: string;
}

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

const FullscreenIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
);

const VideoPreview: React.FC<Props> = ({ filePath }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{
    width: number;
    height: number;
  }>({
    width: 640,
    height: 360,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const lastInitKeyRef = useRef<string>("");
  const cacheValueRef = useRef<{
    duration: number;
    isDragging: boolean;
  }>({
    duration: 0,
    isDragging: false,
  });

  useEffect(() => {
    cacheValueRef.current.duration = duration;
  }, [duration]);

  // 根据容器尺寸更新预览目标分辨率（限定最大 1280x720）
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const maxW = 1280;
        const maxH = 720;
        const w = Math.round(Math.min(rect.width, maxW));
        const h = Math.round(Math.min(rect.height, maxH));
        const next = { width: w, height: h };
        setPreviewSize((prev) =>
          prev.width === next.width && prev.height === next.height ? prev : next
        );
      }
    };

    updateSize();
  }, []);

  // 初始化视频播放器
  useEffect(() => {
    if (
      !filePath ||
      filePath === "undefined" ||
      previewSize.width <= 0 ||
      previewSize.height <= 0
    ) {
      return;
    }

    const initKey = `${filePath}-${previewSize.width}x${previewSize.height}`;
    if (lastInitKeyRef.current === initKey) {
      return;
    }
    lastInitKeyRef.current = initKey;

    const initPlayer = async () => {
      try {
        setIsLoading(true);
        await bridge.invoke("video_player_open", {
          path: filePath,
          preview: {
            width: previewSize.width,
            height: previewSize.height,
          },
        });
        const dur = await bridge.invoke<number>("video_player_get_duration");
        setDuration(dur);
      } catch (error) {
        console.error("初始化视频播放器失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initPlayer();

    return () => {
      bridge.invoke("video_player_close").catch(console.error);
    };
  }, [filePath, previewSize]);

  // 监听视频帧事件
  useEffect(() => {
    if (!filePath || !canvasRef.current) return;
    let unlistenFrame: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;
    let unlistenState: (() => void) | undefined;

    bridge
      .on("video-frame", (payload) => {
        const { width, height, data } = payload;
        if (!width || !height) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        // 只在尺寸变化时更新，避免不必要的清空
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const buffer =
          data instanceof Uint8Array ? data : new Uint8Array(data ?? []);
        const imageData = new ImageData(
          new Uint8ClampedArray(buffer),
          width,
          height
        );
        ctx.putImageData(imageData, 0, 0);
      })
      .then((off) => {
        unlistenFrame = off;
      });

    bridge
      .on("video-complete", () => {
        setIsPlaying(false);
        setCurrentPosition(cacheValueRef.current.duration);
        console.log(
          `video-complete duration: ${cacheValueRef.current.duration}`
        );
      })
      .then((off) => {
        unlistenComplete = off;
      });

    bridge
      .on("player-state-update", (payload) => {
        if (!payload || typeof payload !== "object") return;
        const state = payload as {
          position: number;
          duration: number;
          state: string;
          volume: number;
        };

        if (!cacheValueRef.current.isDragging) {
          console.log(`player-state-update position: ${state.position}`);
          setCurrentPosition(state.position);
        }
        setDuration(state.duration);
        setIsPlaying(state.state === "playing");
        setVolume(state.volume);
        setIsMuted(state.volume === 0);
      })
      .then((off) => {
        unlistenState = off;
      });

    return () => {
      unlistenFrame?.();
      unlistenComplete?.();
      unlistenState?.();
    };
  }, [filePath]);

  // 控制栏自动隐藏
  useEffect(() => {
    if (!isHovering && isPlaying) {
      const timer = setTimeout(() => {
        setShowControls(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowControls(true);
    }
  }, [isHovering, isPlaying]);

  const handlePlay = useCallback(async () => {
    try {
      if (duration > 0 && currentPosition >= duration) {
        await bridge.invoke("video_player_seek", { position: 0 });
        setCurrentPosition(0);
      }
      await bridge.invoke("video_player_play");
      setIsPlaying(true);
    } catch (error) {
      console.error("播放失败:", error);
    }
  }, []);

  const handlePause = useCallback(async () => {
    try {
      await bridge.invoke("video_player_pause");
      setIsPlaying(false);
    } catch (error) {
      console.error("暂停失败:", error);
    }
  }, []);

  const handleSeek = useCallback(async (newPosition: number) => {
    try {
      await bridge.invoke("video_player_seek", { position: newPosition });
      setCurrentPosition(newPosition);
    } catch (error) {
      console.error("跳转失败:", error);
    }
  }, []);

  const handleVolumeChange = useCallback(async (value: number) => {
    const nextVolume = Math.max(0, Math.min(1.5, value));
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
    try {
      await bridge.invoke("video_player_set_volume", { volume: nextVolume });
    } catch (error) {
      console.error("调整音量失败:", error);
    }
  }, []);

  const handleMuteToggle = useCallback(async () => {
    if (isMuted) {
      await handleVolumeChange(volume > 0 ? volume : 0.5);
    } else {
      await handleVolumeChange(0);
    }
  }, [isMuted, volume, handleVolumeChange]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || duration === 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newPosition = percentage * duration;
      handleSeek(newPosition);
    },
    [duration, handleSeek]
  );

  const handleProgressDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || duration === 0) return;
      cacheValueRef.current.isDragging = true;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const newPosition = percentage * duration;
      setCurrentPosition(newPosition);
    },
    [duration]
  );

  const handleProgressDragEnd = useCallback(() => {
    cacheValueRef.current.isDragging = false;
    if (duration > 0) {
      handleSeek(currentPosition);
    }
  }, [duration, currentPosition, handleSeek]);

  const handleSkip = useCallback(
    async (seconds: number) => {
      const newPosition = Math.max(
        0,
        Math.min(duration, currentPosition + seconds)
      );
      await handleSeek(newPosition);
    },
    [currentPosition, duration, handleSeek]
  );

  const progressPercentage =
    duration > 0 ? (currentPosition / duration) * 100 : 0;

  if (!filePath || filePath === "undefined") {
    return (
      <div className="mb-4 p-4 border rounded shadow-sm bg-card">
        <div className="mb-2 font-semibold">视频预览</div>
        <div className="text-muted-foreground">请先选择视频文件</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mb-4 p-4 border rounded shadow-sm bg-card">
        <div className="mb-2 font-semibold">视频预览</div>
        <div className="text-muted-foreground">正在加载视频...</div>
      </div>
    );
  }

  console.log(
    `progressPercentage: ${progressPercentage} duration: ${duration} currentPosition: ${currentPosition}`
  );

  return (
    <div className="mb-4 w-full">
      <div
        ref={containerRef}
        className="relative w-full bg-black rounded-lg overflow-hidden group"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={() => setIsHovering(true)}
      >
        {/* 视频画布 */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full object-contain" />

          {/* 中央播放按钮 */}
          {!isPlaying && showControls && (
            <div className="absolute flex items-center justify-center z-10">
              <button
                aria-label="播放"
                className="rounded-full flex items-center justify-center"
                onClick={handlePlay}
              >
                <PlayIcon className="w-6 h-6 text-black ml-1" />
              </button>
            </div>
          )}
        </div>

        {/* 底部控制栏 - YouTube 风格 */}
        <div
          className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

          {/* 控制内容 */}
          <div className="relative px-4 pb-3 pt-6">
            {/* 进度条 */}
            <div
              ref={progressBarRef}
              className="relative h-1.5 bg-white/30 rounded-full mb-4 cursor-pointer group/progress hover:h-2 transition-all"
              onClick={handleProgressClick}
              onMouseDown={(e) => {
                handleProgressDrag(e);
                const handleMouseMove = (e: MouseEvent) => {
                  if (progressBarRef.current && duration > 0) {
                    const rect = progressBarRef.current.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percentage = Math.max(
                      0,
                      Math.min(1, clickX / rect.width)
                    );
                    const newPosition = percentage * duration;
                    setCurrentPosition(newPosition);
                  }
                };
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                  handleProgressDragEnd();
                };
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
            >
              {/* 进度条背景 */}
              <div className="absolute inset-0 bg-white/30 rounded-full" />
              {/* 已播放进度 */}
              <div
                className="absolute left-0 top-0 h-full bg-red-600 rounded-full transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
              {/* 进度条拖拽点 */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-red-600 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity -translate-x-1/2 shadow-lg"
                style={{ left: `${progressPercentage}%` }}
              />
            </div>

            {/* 控制按钮栏 */}
            <div className="flex items-center gap-1">
              {/* 播放/暂停按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="bg-transparent p-0"
                onClick={isPlaying ? handlePause : handlePlay}
                aria-label={isPlaying ? "暂停" : "播放"}
              >
                {isPlaying ? (
                  <PauseIcon className="w-6 h-6" />
                ) : (
                  <PlayIcon className="w-6 h-6 ml-0.5" />
                )}
              </Button>

              {/* 快退按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="bg-transparent p-0"
                onClick={() => handleSkip(-10)}
                aria-label="快退 10 秒"
              >
                <SkipBackIcon className="w-5 h-5" />
              </Button>

              {/* 快进按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="bg-transparent p-0"
                onClick={() => handleSkip(10)}
                aria-label="快进 10 秒"
              >
                <SkipForwardIcon className="w-5 h-5" />
              </Button>

              {/* 音量控制 */}
              <div className="flex items-center gap-2 ml-2 group/volume">
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-transparent p-0"
                  onClick={handleMuteToggle}
                  aria-label={isMuted ? "取消静音" : "静音"}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeMutedIcon className="w-5 h-5" />
                  ) : (
                    <VolumeIcon className="w-5 h-5" />
                  )}
                </Button>
                <div className="w-0 opacity-0 group-hover/volume:w-24 group-hover/volume:opacity-100 transition-all duration-200 overflow-hidden">
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #dc2626 0%, #dc2626 ${
                        ((isMuted ? 0 : volume) / 1.5) * 100
                      }%, rgba(255,255,255,0.3) ${
                        ((isMuted ? 0 : volume) / 1.5) * 100
                      }%, rgba(255,255,255,0.3) 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* 时间显示 */}
              <div className="flex items-center gap-1 text-white text-xs font-medium ml-auto mr-2 select-none">
                <span>{formatTime(currentPosition)}</span>
                <span className="text-white/70">/</span>
                <span className="text-white/70">{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 格式化时间（秒 -> HH:MM:SS 或 MM:SS）
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
}

export default VideoPreview;
