// Shaka Player 风格的现代化视频播放器组件
import React, { useRef, useEffect, useState, useCallback } from "react";
import { bridge } from "@/lib/bridge";
import { getBridgeErrorMessage } from "@/lib/bridgeError";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { PlayIcon } from "@/components/icons/play";
import { PauseIcon } from "@/components/icons/pause";
import { VolumeIcon } from "@/components/icons/volume";
import { VolumeMutedIcon } from "@/components/icons/volume-muted";
import { SkipBackIcon } from "@/components/icons/skip-back";
import { SkipForwardIcon } from "@/components/icons/skip-forward";
import { FullscreenIcon } from "@/components/icons/fullscreen";
import { FullscreenExitIcon } from "@/components/icons/fullscreen-exit";
import { SettingsIcon } from "@/components/icons/settings";
import { cn } from "@/lib/utils";

interface ShakaPlayerProps {
  filePath?: string;
  title?: string;
  className?: string;
  autoPlay?: boolean;
  showControls?: boolean;
}

type FrameImageDataCache = {
  width: number;
  height: number;
  imageData: ImageData;
};

const SEEK_GUARD_MS = 2000;
const SEEK_POSITION_TOLERANCE_SEC = 0.08;

// 格式化时间
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const ShakaPlayer: React.FC<ShakaPlayerProps> = ({
  filePath,
  className,
  autoPlay = false,
  showControls: initialShowControls = true,
}) => {
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
  const [showControls, setShowControls] = useState(initialShowControls);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState("");
  const lastInitKeyRef = useRef<string>("");
  const frameSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const latestFrameRef = useRef<ArrayBuffer | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const imageDataCacheRef = useRef<FrameImageDataCache | null>(null);
  const cacheValueRef = useRef<{
    duration: number;
    isDragging: boolean;
  }>({
    duration: 0,
    isDragging: false,
  });
  const seekGuardRef = useRef<{
    target: number;
    expiresAt: number;
  }>({
    target: 0,
    expiresAt: 0,
  });

  useEffect(() => {
    cacheValueRef.current.duration = duration;
  }, [duration]);

  useEffect(() => {
    cacheValueRef.current.isDragging = isDragging;
  }, [isDragging]);

  const stopFrameRenderLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    latestFrameRef.current = null;
    imageDataCacheRef.current = null;
  }, []);

  const startFrameRenderLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    const draw = () => {
      rafIdRef.current = requestAnimationFrame(draw);

      const frameBuffer = latestFrameRef.current;
      if (!frameBuffer) return;
      latestFrameRef.current = null;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width, height } = frameSizeRef.current;
      if (!width || !height) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        imageDataCacheRef.current = null;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let cache = imageDataCacheRef.current;
      if (!cache || cache.width !== width || cache.height !== height) {
        cache = { width, height, imageData: new ImageData(width, height) };
        imageDataCacheRef.current = cache;
      }

      const source = new Uint8ClampedArray(frameBuffer);
      if (source.length !== cache.imageData.data.length) return;
      cache.imageData.data.set(source);
      ctx.putImageData(cache.imageData, 0, 0);
    };
    rafIdRef.current = requestAnimationFrame(draw);
  }, []);

  // 根据容器尺寸更新预览目标分辨率
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
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
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
        latestFrameRef.current = null;
        imageDataCacheRef.current = null;
        await bridge.videoPlayerOpen(
          {
            path: filePath,
            preview: {
              width: previewSize.width,
              height: previewSize.height,
            },
          },
          (frameBuffer) => {
            latestFrameRef.current = frameBuffer;
          }
        );
        const size = await bridge.videoPlayerGetSize();
        frameSizeRef.current = size;
        if (canvasRef.current) {
          canvasRef.current.width = size.width;
          canvasRef.current.height = size.height;
        }
        startFrameRenderLoop();
        const dur = await bridge.videoPlayerGetDuration();
        setDuration(dur);
        if (autoPlay) {
          await bridge.videoPlayerPlay();
          setIsPlaying(true);
        }
        setError("");
      } catch (error) {
        setError(getBridgeErrorMessage(error, "初始化视频播放器失败"));
        console.error("初始化视频播放器失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initPlayer();

    return () => {
      stopFrameRenderLoop();
      bridge.videoPlayerClose().catch(console.error);
    };
  }, [filePath, previewSize, autoPlay, startFrameRenderLoop, stopFrameRenderLoop]);

  // 监听播放器状态事件
  useEffect(() => {
    if (!filePath) return;
    let unlistenComplete: (() => void) | undefined;
    let unlistenState: (() => void) | undefined;

    bridge
      .on("video-complete", () => {
        setIsPlaying(false);
        setCurrentPosition(cacheValueRef.current.duration);
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
          const now = Date.now();
          const seekGuard = seekGuardRef.current;
          const guardActive = now < seekGuard.expiresAt;
          if (!guardActive && seekGuard.expiresAt > 0) {
            seekGuardRef.current = { target: 0, expiresAt: 0 };
          }
          const isSeekRollback =
            guardActive &&
            state.position + SEEK_POSITION_TOLERANCE_SEC < seekGuard.target;

          if (!isSeekRollback) {
            setCurrentPosition(state.position);
            if (
              guardActive &&
              state.position + SEEK_POSITION_TOLERANCE_SEC >= seekGuard.target
            ) {
              seekGuardRef.current = { target: 0, expiresAt: 0 };
            }
          }
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
      unlistenComplete?.();
      unlistenState?.();
    };
  }, [filePath]);

  // 控制栏自动隐藏
  useEffect(() => {
    if (!isHovering && isPlaying && !isDragging) {
      const timer = setTimeout(() => {
        setShowControls(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowControls(true);
    }
  }, [isHovering, isPlaying, isDragging]);

  const handlePlay = useCallback(async () => {
    try {
      if (duration > 0 && currentPosition >= duration) {
        await bridge.videoPlayerSeek(0);
        setCurrentPosition(0);
      }
      await bridge.videoPlayerPlay();
      setIsPlaying(true);
      setError("");
    } catch (error) {
      setError(getBridgeErrorMessage(error, "播放失败"));
      console.error("播放失败:", error);
    }
  }, [duration, currentPosition]);

  const handlePause = useCallback(async () => {
    try {
      await bridge.videoPlayerPause();
      setIsPlaying(false);
      setError("");
    } catch (error) {
      setError(getBridgeErrorMessage(error, "暂停失败"));
      console.error("暂停失败:", error);
    }
  }, []);

  const handleSeek = useCallback(async (newPosition: number) => {
    const clampedPosition =
      duration > 0 ? Math.max(0, Math.min(duration, newPosition)) : newPosition;
    seekGuardRef.current = {
      target: clampedPosition,
      expiresAt: Date.now() + SEEK_GUARD_MS,
    };
    setCurrentPosition(clampedPosition);

    try {
      await bridge.videoPlayerSeek(clampedPosition);
      setError("");
    } catch (error) {
      seekGuardRef.current = { target: 0, expiresAt: 0 };
      setError(getBridgeErrorMessage(error, "跳转失败"));
      console.error("跳转失败:", error);
    }
  }, [duration]);

  const handleVolumeChange = useCallback(async (value: number[]) => {
    const nextVolume = Math.max(0, Math.min(1.5, value[0]));
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
    try {
      await bridge.videoPlayerSetVolume(nextVolume);
      setError("");
    } catch (error) {
      setError(getBridgeErrorMessage(error, "调整音量失败"));
      console.error("调整音量失败:", error);
    }
  }, []);

  const handleMuteToggle = useCallback(async () => {
    if (isMuted) {
      await handleVolumeChange([volume > 0 ? volume : 0.5]);
    } else {
      await handleVolumeChange([0]);
    }
  }, [isMuted, volume, handleVolumeChange]);

  const handleProgressChange = useCallback(
    (value: number[]) => {
      if (duration > 0) {
        const newPosition = (value[0] / 100) * duration;
        setCurrentPosition(newPosition);
        setIsDragging(true);
      }
    },
    [duration]
  );

  const handleProgressCommit = useCallback(
    (value: number[]) => {
      if (duration > 0) {
        const newPosition = (value[0] / 100) * duration;
        void handleSeek(newPosition).finally(() => {
          setIsDragging(false);
        });
      } else {
        setIsDragging(false);
      }
    },
    [duration, handleSeek]
  );

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

  const handlePlaybackRateChange = useCallback(async (rate: number) => {
    setPlaybackRate(rate);
    // 注意: 这里需要后端支持播放速度调整
    // await bridge.invoke("video_player_set_playback_rate", { rate });
  }, []);

  const handleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!isFullscreen) {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (error) {
      console.error("全屏切换失败:", error);
    }
  }, [isFullscreen]);


  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const progressPercentage =
    duration > 0 ? (currentPosition / duration) * 100 : 0;

  if (!filePath || filePath === "undefined") {
    return (
      <div
        className={cn("mb-4 p-4 border rounded shadow-sm bg-card", className)}
      >
        <div className="mb-2 font-semibold">视频预览</div>
        <div className="text-muted-foreground">请先选择视频文件</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={cn("mb-4 p-4 border rounded shadow-sm bg-card", className)}
      >
        <div className="mb-2 font-semibold">视频预览</div>
        <div className="text-muted-foreground">正在加载视频...</div>
      </div>
    );
  }

  return (
    <div className={cn("mb-4 w-full", className)}>
      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        className="relative w-full bg-foreground rounded-lg overflow-hidden group"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={() => setIsHovering(true)}
      >
        {/* 视频画布 */}
        <div className="relative w-full aspect-video bg-foreground flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full object-contain" />

          {/* 中央播放按钮 */}
          {!isPlaying && showControls && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <button
                aria-label="播放"
                className="rounded-full bg-background/90 hover:bg-background p-4 flex items-center justify-center transition-all group shadow-lg cursor-pointer"
                onClick={handlePlay}
              >
                <PlayIcon className="w-12 h-12 text-foreground ml-1" />
              </button>
            </div>
          )}
        </div>

        {/* 底部控制栏 - Shaka Player 风格 */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 z-[10] transition-all duration-300",
            showControls
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          )}
        >
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/60 to-transparent pointer-events-none" />

          {/* 控制内容 */}
          <div className="relative px-4 pb-4 pt-6">
            {/* 进度条 */}
            <div ref={progressBarRef} className="mb-3">
              <Slider
                value={[progressPercentage]}
                min={0}
                max={100}
                step={0.1}
                onValueChange={handleProgressChange}
                onValueCommit={handleProgressCommit}
                className="cursor-pointer"
              />
            </div>

            {/* 控制按钮栏 */}
            <div className="flex items-center gap-2">
              {/* 播放/暂停按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="bg-transparent hover:bg-white/20 text-white hover:text-white p-0 h-9 w-9"
                onClick={isPlaying ? handlePause : handlePlay}
                aria-label={isPlaying ? "暂停" : "播放"}
              >
                {isPlaying ? (
                  <PauseIcon className="w-5 h-5" />
                ) : (
                  <PlayIcon className="w-5 h-5 ml-0.5" />
                )}
              </Button>

              {/* 快退按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="bg-transparent hover:text-white hover:bg-white/20 text-white p-0 h-9 w-9"
                onClick={() => handleSkip(-10)}
                aria-label="快退 10 秒"
              >
                <SkipBackIcon className="w-4 h-4" />
              </Button>

              {/* 快进按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="bg-transparent hover:text-white hover:bg-white/20 text-white p-0 h-9 w-9"
                onClick={() => handleSkip(10)}
                aria-label="快进 10 秒"
              >
                <SkipForwardIcon className="w-4 h-4" />
              </Button>

              {/* 音量控制 */}
              <HoverCard openDelay={0} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="bg-transparent hover:text-white hover:bg-white/20 text-white p-0 h-9 w-9"
                    onClick={handleMuteToggle}
                    aria-label={isMuted ? "取消静音" : "静音"}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeMutedIcon className="w-5 h-5" />
                    ) : (
                      <VolumeIcon className="w-5 h-5" />
                    )}
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent
                  side="top"
                  align="center"
                  sideOffset={8}
                  className="w-auto p-3 bg-foreground/90 border-background/20"
                >
                  <Slider
                    value={[isMuted ? 0 : volume * 100]}
                    min={0}
                    max={150}
                    step={1}
                    orientation="vertical"
                    onValueChange={(value) =>
                      handleVolumeChange([value[0] / 100])
                    }
                    className="h-24"
                  />
                </HoverCardContent>
              </HoverCard>

              {/* 时间显示 */}
              <div className="flex items-center gap-1 text-background text-sm font-medium ml-2 select-none">
                <span>{formatTime(currentPosition)}</span>
                <span className="text-background/70">/</span>
                <span className="text-background/70">{formatTime(duration)}</span>
              </div>

              {/* 播放速度 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled
                    className="bg-transparent hover:bg-background/20 text-background hover:text-background  ml-auto h-9 px-2"
                  >
                    {playbackRate}x
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                    <DropdownMenuItem
                      key={rate}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={cn(
                        "cursor-pointer",
                        playbackRate === rate && "bg-accent"
                      )}
                    >
                      {rate}x
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 设置按钮 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled
                    className=" bg-transparent hover:bg-background/20 text-background p-0 h-9 w-9 hover:text-background "
                    aria-label="设置"
                  >
                    <SettingsIcon className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="cursor-pointer">
                    字幕
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">
                    画质
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">
                    音频轨道
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 全屏按钮 */}
              <Button
                variant="ghost"
                size="icon"
                disabled
                className="bg-transparent hover:bg-background/20 text-background p-0 h-9 w-9 hover:text-background "
                onClick={handleFullscreen}
                aria-label={isFullscreen ? "退出全屏" : "全屏"}
              >
                {isFullscreen ? (
                  <FullscreenExitIcon className="w-5 h-5" />
                ) : (
                  <FullscreenIcon className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShakaPlayer;
