// 现代化音乐播放器组件
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { bridge } from "@/lib/bridge";
import { getBridgeErrorMessage } from "@/lib/bridgeError";
import { PlayIcon } from "@/components/icons/play";
import { PauseIcon } from "@/components/icons/pause";
import { VolumeIcon } from "@/components/icons/volume";
import { VolumeMutedIcon } from "@/components/icons/volume-muted";
import { SkipBackIcon } from "@/components/icons/skip-back";
import { SkipForwardIcon } from "@/components/icons/skip-forward";
import { cn } from "@/lib/utils";

interface MusicPlayerProps {
  filePath?: string;
  title?: string;
  artist?: string;
  coverImage?: string;
  className?: string;
  autoPlay?: boolean;
}

// 格式化时间
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  filePath,
  title,
  artist,
  coverImage,
  className,
  autoPlay = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const initSeqRef = useRef(0);
  const instanceIdRef = useRef(
    `music-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
  const log = useCallback(
    (message: string, extra?: unknown) => {
      console.info(`[MusicPlayer:${instanceIdRef.current}] ${message}`, extra ?? "");
    },
    []
  );

  // 初始化音频文件
  useEffect(() => {
    const seq = ++initSeqRef.current;
    let cancelled = false;
    log("effect:init triggered", { filePath, autoPlay });
    if (!filePath || filePath === "undefined") {
      setIsPlaying(false);
      setIsReady(false);
      setDuration(0);
      setCurrentPosition(0);
      log("effect:init skipped due to empty filePath");
      return;
    }

    const initAudio = async () => {
      try {
        setIsLoading(true);
        setIsReady(false);
        setError("");
        log("audioPlayerOpen start", { filePath, seq });
        await bridge.audioPlayerOpen(filePath);
        if (cancelled || seq !== initSeqRef.current) {
          log("audioPlayerOpen ignored (stale init)", { seq, current: initSeqRef.current });
          return;
        }
        setIsReady(true);
        log("audioPlayerOpen success");
        const dur = await bridge.audioPlayerGetDuration();
        if (cancelled || seq !== initSeqRef.current) {
          log("audioPlayerGetDuration ignored (stale init)", { seq, current: initSeqRef.current });
          return;
        }
        log("audioPlayerGetDuration result", { dur });
        if (dur !== undefined && dur !== null && !isNaN(dur)) {
          setDuration(dur);
          setCurrentPosition(0);
          if (autoPlay) {
            log("autoPlay start");
            await bridge.audioPlayerPlay();
            if (cancelled || seq !== initSeqRef.current) {
              log("autoPlay ignored (stale init)", { seq, current: initSeqRef.current });
              return;
            }
            setIsPlaying(true);
            log("autoPlay success");
          }
        } else {
          setError("无法获取音频时长");
          log("duration invalid", { dur });
        }
      } catch (err) {
        setIsReady(false);
        setIsPlaying(false);
        setError(getBridgeErrorMessage(err, "打开文件失败"));
        console.error(`[MusicPlayer:${instanceIdRef.current}] 打开音频文件失败:`, err);
      } finally {
        setIsLoading(false);
        log("effect:init finished");
      }
    };

    initAudio();

    return () => {
      cancelled = true;
      log("effect:init cleanup (no stop, waiting next init/unmount)", { seq });
    };
  }, [filePath, autoPlay, log]);

  // 播放
  const handlePlay = useCallback(async () => {
    if (!isReady) return;
    try {
      log("handlePlay start", { duration, currentPosition });
      if (duration > 0 && currentPosition >= duration) {
        await bridge.audioPlayerSeek(0);
        setCurrentPosition(0);
      }
      await bridge.audioPlayerPlay();
      setIsPlaying(true);
      setError("");
      log("handlePlay success");
    } catch (err) {
      setError(getBridgeErrorMessage(err, "播放失败"));
      console.error(`[MusicPlayer:${instanceIdRef.current}] 播放失败:`, err);
    }
  }, [duration, currentPosition, isReady, log]);

  // 暂停
  const handlePause = useCallback(async () => {
    if (!isReady) return;
    try {
      log("handlePause start");
      await bridge.audioPlayerPause();
      setIsPlaying(false);
      log("handlePause success");
    } catch (err) {
      setError(getBridgeErrorMessage(err, "暂停失败"));
      console.error(`[MusicPlayer:${instanceIdRef.current}] 暂停失败:`, err);
    }
  }, [isReady, log]);

  // 快退/快进
  const handleSkip = useCallback(
    async (seconds: number) => {
      if (!isReady) return;
      try {
        log("handleSkip start", { seconds });
        const current = await bridge.audioPlayerGetPosition();
        const newPosition = Math.max(0, Math.min(duration, current + seconds));
        await bridge.audioPlayerSeek(newPosition);
        setCurrentPosition(newPosition);
        log("handleSkip success", { current, newPosition });
      } catch (err) {
        console.error(`[MusicPlayer:${instanceIdRef.current}] 跳转失败:`, err);
      }
    },
    [duration, isReady, log]
  );

  // 跳转到指定位置
  const handleSeek = useCallback(async (newPosition: number) => {
    if (!isReady) return;
    try {
      log("handleSeek start", { newPosition });
      await bridge.audioPlayerSeek(newPosition);
      setCurrentPosition(newPosition);
      log("handleSeek success");
    } catch (err) {
      console.error(`[MusicPlayer:${instanceIdRef.current}] 跳转失败:`, err);
    }
  }, [isReady, log]);

  // 进度条变化
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

  // 进度条提交
  const handleProgressCommit = useCallback(
    (value: number[]) => {
      if (duration > 0) {
        const newPosition = (value[0] / 100) * duration;
        handleSeek(newPosition);
      }
      setIsDragging(false);
    },
    [duration, handleSeek]
  );

  // 音量控制
  const handleVolumeChange = useCallback(async (value: number[]) => {
    const nextVolume = Math.max(0, Math.min(1.5, value[0]));
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
    if (!isReady) return;
    try {
      await bridge.audioPlayerSetVolume(nextVolume);
      log("handleVolumeChange success", { nextVolume });
    } catch (err) {
      console.error(`[MusicPlayer:${instanceIdRef.current}] 调整音量失败:`, err);
    }
  }, [isReady, log]);

  const handleMuteToggle = useCallback(async () => {
    if (isMuted) {
      await handleVolumeChange([volume > 0 ? volume : 0.5]);
    } else {
      await handleVolumeChange([0]);
    }
  }, [isMuted, volume, handleVolumeChange]);

  // 更新播放位置
  useEffect(() => {
    if (!isPlaying || isDragging || !isReady) return;
    const seq = initSeqRef.current;
    log("position polling start");

    const interval = setInterval(async () => {
      try {
        if (seq !== initSeqRef.current) return;
        const pos = await bridge.audioPlayerGetPosition();
        if (seq !== initSeqRef.current) return;
        setCurrentPosition(pos);

        // 如果播放完成，自动暂停
        if (duration > 0 && pos >= duration) {
          setIsPlaying(false);
        }
      } catch (err) {
        if (seq !== initSeqRef.current) return;
        log("position polling failed -> setIsReady(false)", err);
        setIsPlaying(false);
        setIsReady(false);
        console.error(`[MusicPlayer:${instanceIdRef.current}] 获取播放位置失败:`, err);
      }
    }, 500); // 每500ms更新一次

    return () => {
      clearInterval(interval);
      log("position polling stop");
    };
  }, [isPlaying, duration, isDragging, isReady, log]);

  useEffect(() => {
    return () => {
      log("component unmount -> audioPlayerStop");
      bridge.audioPlayerStop().catch((err) => {
        const message = getBridgeErrorMessage(err, "");
        if (message.includes("未初始化")) {
          log("component unmount stop ignored: player not initialized");
          return;
        }
        console.error(`[MusicPlayer:${instanceIdRef.current}] unmount stop failed:`, err);
      });
    };
  }, [log]);

  const progressPercentage =
    duration > 0 ? (currentPosition / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "w-full max-w-3xl mx-auto bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl shadow-2xl overflow-hidden",
        className
      )}
    >
      <div className="p-4 md:p-6">
        {/* 专辑封面和歌曲信息 */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-4 mb-8">
          {/* 专辑封面 */}
          <div className="relative w-48 h-48 rounded-2xl overflow-hidden shadow-xl flex-shrink-0">
            {coverImage ? (
              <img
                src={coverImage}
                alt={title || "Album Cover"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center p-4">
                <div className="text-white text-2xl md:text-3xl font-bold text-center line-clamp-2 break-words">
                  {title || "♪"}
                </div>
              </div>
            )}
            {/* 播放状态指示器 */}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <PauseIcon className="w-8 h-8 text-white" />
                </div>
              </div>
            )}
          </div>

          {/* 歌曲信息 */}
          <div className="flex-1 text-center md:text-left">
            {!filePath ? (
              <div className="space-y-2">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  未选择音频文件
                </h2>
              </div>
            ) : (
              <div className="space-y-2">
                <h2 className="text-2xl md:text-4xl font-bold text-white line-clamp-2 break-all">
                  {title || "未知标题"}
                </h2>
                <p className="text-xl text-slate-300">
                  {artist || "未知艺术家"}
                </p>
                {/* 音量控制 */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-10 w-10 rounded-full"
                    onClick={handleMuteToggle}
                    aria-label={isMuted ? "取消静音" : "静音"}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeMutedIcon className="w-5 h-5" />
                    ) : (
                      <VolumeIcon className="w-5 h-5" />
                    )}
                  </Button>
                  <div className="w-32">
                    <Slider
                      value={[isMuted ? 0 : volume * 100]}
                      min={0}
                      max={150}
                      step={1}
                      onValueChange={(value) =>
                        handleVolumeChange([value[0] / 100])
                      }
                      className="cursor-pointer"
                    />
                  </div>

                  <span className="text-sm text-slate-400 w-12 text-right">
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-200">
            {error}
          </div>
        )}

        {/* 播放控制 */}
        {filePath && (
          <div className="">
            {/* 进度条 */}
            <div className="space-y-2">
              <Slider
                value={[progressPercentage]}
                min={0}
                max={100}
                step={0.1}
                onValueChange={handleProgressChange}
                onValueCommit={handleProgressCommit}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>{formatTime(currentPosition)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* 控制按钮 */}
            <div className="flex items-center justify-center gap-4">
              {/* 快退按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer text-white hover:text-white/80 hover:bg-transparent rounded-lg w-12 h-12"
                onClick={() => handleSkip(-10)}
                disabled={isLoading}
                aria-label="快退 10 秒"
              >
                <SkipBackIcon className="size-8" />
              </Button>

              {/* 播放/暂停按钮 */}
              <Button
                variant="default"
                size="icon"
                className="bg-transparent hover:bg-transparent text-white hover:text-white/80 h-12 w-12 cursor-pointer"
                onClick={isPlaying ? handlePause : handlePlay}
                disabled={isLoading}
                aria-label={isPlaying ? "暂停" : "播放"}
              >
                {isPlaying ? (
                  <PauseIcon className="size-8" />
                ) : (
                  <PlayIcon className="size-8" />
                )}
              </Button>

              {/* 快进按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer text-white hover:text-white/80 hover:bg-transparent rounded-lg w-12 h-12"
                onClick={() => handleSkip(10)}
                disabled={isLoading}
                aria-label="快进 10 秒"
              >
                <SkipForwardIcon className="size-8" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MusicPlayer;
