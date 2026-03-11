import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import { bridge } from "@/lib/bridge";
import type { MediaDetailsWithResolve } from "@/types/tasks";
import { cn } from "@/lib/utils";

interface ShakaPlayerProps {
  filePath?: string;
  title?: string;
  className?: string;
  autoPlay?: boolean;
  showControls?: boolean;
}

type PlaybackMode = "mse" | "direct";

const MIME_CANDIDATES = [
  'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
  'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
  'video/mp4; codecs="avc1.4D401F, mp4a.40.2"',
  'video/mp4; codecs="avc1.42E01E"',
  "video/mp4",
] as const;
const BUFFER_KEEP_BACK_SECONDS = 30;
const BUFFER_EVICT_HEADROOM_SECONDS = 10;

function canUseMse() {
  return typeof window !== "undefined" && "MediaSource" in window;
}

function pickSupportedMimeType() {
  if (!canUseMse()) return undefined;
  return MIME_CANDIDATES.find((mime) => MediaSource.isTypeSupported(mime));
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalizeCodec(codec: string) {
  return codec.trim().toLowerCase();
}

function shouldTranscodeForWebPlayback(details: MediaDetailsWithResolve | null, path: string) {
  const ext = (details?.extension || path.split(".").pop() || "").toLowerCase();
  const containerOk = ext === "mp4" || ext === "m4v" || ext === "mov";

  const videoStream = details?.streams.find((s) => s.codec_type === "video");
  const audioStreams = details?.streams.filter((s) => s.codec_type === "audio") ?? [];

  const videoCodec = normalizeCodec(videoStream?.codec_name || "");
  const videoOk = videoCodec === "h264" || videoCodec === "avc1" || videoCodec === "libx264";

  const audioOk =
    audioStreams.length === 0 ||
    audioStreams.every((s) => {
      const c = normalizeCodec(s.codec_name || "");
      return c === "aac" || c === "mp3" || c === "opus" || c === "vorbis" || c === "mp4a" || c === "mp4a.40.2";
    });

  return !(containerOk && videoOk && audioOk);
}

function isWhitelistedForMse(path: string) {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".fmp4.mp4") ||
    lower.endsWith(".frag.mp4") ||
    lower.endsWith(".mse.mp4")
  );
}

export const ShakaPlayer: React.FC<ShakaPlayerProps> = ({
  filePath,
  className,
  autoPlay = false,
  showControls = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<Uint8Array[]>([]);
  const sourceEndedRef = useRef(false);
  const streamFinishedRef = useRef(false);
  const appendingRef = useRef(false);
  const mseDisabledRef = useRef(false);
  const lastFilePathRef = useRef("");
  const sessionIdRef = useRef(0);
  const mseEventDisposersRef = useRef<Array<() => void>>([]);
  const msePipelineTokenRef = useRef(0);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<PlaybackMode>("direct");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackPath, setPlaybackPath] = useState("");

  const playVideoElement = useCallback(
    (video: HTMLVideoElement) => {
      if (!autoPlay) return;
      void video.play().catch(() => {
        // autoplay may be blocked
      });
    },
    [autoPlay],
  );

  const cleanupMse = useCallback(() => {
    msePipelineTokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    appendingRef.current = false;
    sourceEndedRef.current = false;
    streamFinishedRef.current = false;
    void bridge.videoMseStreamClose().catch(() => {});
    mseEventDisposersRef.current.forEach((dispose) => {
      try {
        dispose();
      } catch {
        // ignore
      }
    });
    mseEventDisposersRef.current = [];

    const sourceBuffer = sourceBufferRef.current;
    if (sourceBuffer) {
      try {
        sourceBuffer.abort();
      } catch {
        // ignore
      }
    }

    sourceBufferRef.current = null;
    mediaSourceRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.removeAttribute("src");
      video.load();
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const pumpQueue = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current;
    const mediaSource = mediaSourceRef.current;
    const video = videoRef.current;
    if (!sourceBuffer || !mediaSource) return;
    if (!video) return;
    if (mediaSource.readyState !== "open") return;
    if (appendingRef.current || sourceBuffer.updating) return;

    const chunk = queueRef.current.shift();
    if (chunk) {
      appendingRef.current = true;
      try {
        sourceBuffer.appendBuffer(chunk);
      } catch (err) {
        appendingRef.current = false;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[ShakaPlayer] mse:append:error", msg);
        if (msg.includes("SourceBuffer has been removed")) {
          queueRef.current = [];
          sourceBufferRef.current = null;
          return;
        }
        const quotaExceeded =
          (err instanceof DOMException && err.name === "QuotaExceededError") ||
          msg.toLowerCase().includes("sourcebuffer is full");
        if (quotaExceeded) {
          queueRef.current.unshift(chunk);
          const safeTail = Math.max(
            0,
            (Number.isFinite(video.currentTime) ? video.currentTime : 0) - BUFFER_EVICT_HEADROOM_SECONDS,
          );
          const evictTo = Math.max(0, safeTail - BUFFER_KEEP_BACK_SECONDS);
          for (let i = 0; i < sourceBuffer.buffered.length; i += 1) {
            const start = sourceBuffer.buffered.start(i);
            const end = sourceBuffer.buffered.end(i);
            const removeEnd = Math.min(end, evictTo);
            if (removeEnd - start > 0.5) {
              try {
                sourceBuffer.remove(start, removeEnd);
                console.warn(
                  "[ShakaPlayer] mse:buffer-evict",
                  JSON.stringify({
                    removeStart: start,
                    removeEnd,
                    currentTime: video.currentTime,
                  }),
                );
                return;
              } catch (removeErr) {
                console.warn(
                  "[ShakaPlayer] mse:buffer-evict:error",
                  removeErr instanceof Error ? removeErr.message : String(removeErr),
                );
                break;
              }
            }
          }
          return;
        }
        setError(msg);
      }
      return;
    }

    if (
      streamFinishedRef.current &&
      !sourceEndedRef.current &&
      mediaSource.readyState === "open"
    ) {
      try {
        mediaSource.endOfStream();
        sourceEndedRef.current = true;
      } catch {
        // ignore
      }
    }
  }, []);

  const fallbackToDirect = useCallback(
    (url: string, reason?: string, pathForUi?: string) => {
      const video = videoRef.current;
      if (!video) return;
      mseDisabledRef.current = true;
      queueRef.current = [];
      setMode("direct");
      setIsLoading(false);
      setError(reason ?? "MSE failed, fallback to direct mode");
      if (pathForUi) setPlaybackPath(pathForUi);
      cleanupMse();
      video.src = url;
      video.load();
      playVideoElement(video);
    },
    [cleanupMse, playVideoElement],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => setCurrentTime(video.currentTime);
    const onDuration = () => setDuration(video.duration || 0);

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onDuration);
    video.addEventListener("durationchange", onDuration);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("durationchange", onDuration);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const sessionId = ++sessionIdRef.current;
    const isStale = () => cancelled || sessionIdRef.current !== sessionId;

    if (lastFilePathRef.current !== (filePath || "")) {
      lastFilePathRef.current = filePath || "";
      mseDisabledRef.current = false;
    }

    void bridge.videoPlayerClose().catch(() => {});
    cleanupMse();

    setError("");
    setIsLoading(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackPath("");

    if (!filePath || filePath === "undefined") return;

    const init = async () => {
      const initialDirectUrl = convertFileSrc(filePath);
      const initStartAt = performance.now();
      setIsLoading(true);
      console.warn("[ShakaPlayer] init:start", { filePath });
      const initWatchdog = window.setTimeout(() => {
        if (!isStale()) {
          console.warn("[ShakaPlayer] init:watchdog-timeout -> direct fallback");
          fallbackToDirect(initialDirectUrl, "init watchdog timeout");
        }
      }, 15000);

      let details: MediaDetailsWithResolve | null = null;
      try {
        console.warn("[ShakaPlayer] init:probe:start");
        details = await bridge.getMediaDetails(filePath);
        console.warn("[ShakaPlayer] init:probe:done", {
          extension: details.extension,
          streams: details.streams.length,
        });
      } catch {
        console.warn("[ShakaPlayer] init:probe:failed");
        details = null;
      }

      if (isStale()) return;

      const needLiveTranscode = shouldTranscodeForWebPlayback(details, filePath);
      const fallbackToPreparedDirect = async (reason: string) => {
        const prepareStartAt = performance.now();
        try {
          setIsLoading(true);
          const prepared = await bridge.prepareVideoForWebPlayback(filePath);
          if (isStale()) return;
          const preparedPath = prepared.playPath || filePath;
          const preparedUrl = convertFileSrc(preparedPath);
          console.warn("[ShakaPlayer] init:prepared", JSON.stringify(prepared));
          console.warn(
            "[ShakaPlayer] init:latency:prepare",
            JSON.stringify({
              originalPath: filePath,
              playPath: preparedPath,
              prepareMs: Math.round(performance.now() - prepareStartAt),
              totalMsFromInitStart: Math.round(performance.now() - initStartAt),
              fallbackReason: reason,
            }),
          );
          window.clearTimeout(initWatchdog);
          fallbackToDirect(preparedUrl, reason, preparedPath);
        } catch (err) {
          if (isStale()) return;
          console.warn("[ShakaPlayer] init:prepare-failed", err);
          console.warn(
            "[ShakaPlayer] init:latency:prepare-failed",
            JSON.stringify({
              originalPath: filePath,
              prepareMs: Math.round(performance.now() - prepareStartAt),
              totalMsFromInitStart: Math.round(performance.now() - initStartAt),
              fallbackReason: reason,
            }),
          );
          window.clearTimeout(initWatchdog);
          fallbackToDirect(directUrl, `${reason} | prepare failed`, filePath);
        }
      };

      const directPath = filePath;
      const directUrl = convertFileSrc(directPath);
      const mimeType = pickSupportedMimeType();
      const canUseMseNow =
        !mseDisabledRef.current &&
        Boolean(mimeType) &&
        (needLiveTranscode || isWhitelistedForMse(directPath));
      console.warn("[ShakaPlayer] init:plan", JSON.stringify({ needLiveTranscode, canUseMseNow, mimeType, resolvedPath: directPath }));

      if (!canUseMseNow) {
        if (needLiveTranscode) {
          await fallbackToPreparedDirect("mse unavailable, fallback to prepare+direct");
        } else {
          console.warn(
            "[ShakaPlayer] init:latency:prepare-skip",
            JSON.stringify({
              originalPath: filePath,
              playPath: directPath,
              prepareMs: 0,
              totalMsFromInitStart: Math.round(performance.now() - initStartAt),
            }),
          );
          setMode("direct");
          setError("");
          setPlaybackPath(directPath);
          video.src = directUrl;
          video.load();
          setIsLoading(false);
          window.clearTimeout(initWatchdog);
          playVideoElement(video);
        }
        return;
      }

      setMode("mse");
      const pipelineToken = ++msePipelineTokenRef.current;
      streamFinishedRef.current = false;
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      const objectUrl = URL.createObjectURL(mediaSource);
      objectUrlRef.current = objectUrl;
      video.src = objectUrl;

      const onSourceOpen = () => {
        if (!mediaSourceRef.current || isStale() || !mimeType) return;
        if (msePipelineTokenRef.current !== pipelineToken) return;
        console.warn("[ShakaPlayer] mse:sourceopen");
        setPlaybackPath(needLiveTranscode ? `${filePath} (live-transcode)` : directPath);
        let gotFirstChunk = false;
        const firstChunkTimeout = window.setTimeout(() => {
          if (!gotFirstChunk) {
            if (needLiveTranscode) {
              void fallbackToPreparedDirect("mse first chunk timeout");
            } else {
              fallbackToDirect(directUrl, "mse first chunk timeout", directPath);
            }
          }
        }, 8000);

        let sourceBuffer: SourceBuffer;
        try {
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        } catch (err) {
          window.clearTimeout(firstChunkTimeout);
          if (needLiveTranscode) {
            void fallbackToPreparedDirect(
              `source buffer init failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          } else {
            fallbackToDirect(
              directUrl,
              `source buffer init failed: ${err instanceof Error ? err.message : String(err)}`,
              directPath,
            );
          }
          return;
        }

        sourceBufferRef.current = sourceBuffer;

        sourceBuffer.addEventListener("updateend", () => {
          appendingRef.current = false;
          pumpQueue();
        });

        sourceBuffer.addEventListener("error", () => {
          if (msePipelineTokenRef.current !== pipelineToken) return;
          msePipelineTokenRef.current += 1;
          abortController.abort();
          queueRef.current = [];
          sourceBufferRef.current = null;
          window.clearTimeout(firstChunkTimeout);
          if (needLiveTranscode) {
            void fallbackToPreparedDirect("source buffer error");
          } else {
            fallbackToDirect(directUrl, "source buffer error", directPath);
          }
        });

        const onVideoError = () => {
          if (msePipelineTokenRef.current !== pipelineToken) return;
          msePipelineTokenRef.current += 1;
          abortController.abort();
          queueRef.current = [];
          sourceBufferRef.current = null;
          window.clearTimeout(firstChunkTimeout);
          if (needLiveTranscode) {
            void fallbackToPreparedDirect("video element resource error");
          } else {
            fallbackToDirect(directUrl, "video element resource error", directPath);
          }
        };
        video.addEventListener("error", onVideoError, { once: true });

        const abortController = new AbortController();
        abortRef.current = abortController;

        void (async () => {
          try {
            if (needLiveTranscode) {
              const offEnd = await bridge.on("video-mse-stream-end", () => {
                if (isStale() || msePipelineTokenRef.current !== pipelineToken) return;
                window.clearTimeout(firstChunkTimeout);
                window.clearTimeout(initWatchdog);
                streamFinishedRef.current = true;
                sourceEndedRef.current = false;
                pumpQueue();
              });
              const offError = await bridge.on("video-mse-stream-error", (msg) => {
                if (isStale() || msePipelineTokenRef.current !== pipelineToken) return;
                msePipelineTokenRef.current += 1;
                abortController.abort();
                queueRef.current = [];
                sourceBufferRef.current = null;
                window.clearTimeout(firstChunkTimeout);
                window.clearTimeout(initWatchdog);
                void fallbackToPreparedDirect(`mse stream error: ${msg}`);
              });
              mseEventDisposersRef.current.push(offEnd, offError);

              await bridge.videoMseStreamOpen(filePath, (chunk) => {
                if (isStale() || abortController.signal.aborted) return;
                if (msePipelineTokenRef.current !== pipelineToken) return;
                if (chunk.byteLength <= 0) return;
                if (!sourceBufferRef.current || !mediaSourceRef.current) return;
                if (mediaSourceRef.current.readyState !== "open") return;
                if (!gotFirstChunk) {
                  gotFirstChunk = true;
                  window.clearTimeout(firstChunkTimeout);
                  setIsLoading(false);
                  window.clearTimeout(initWatchdog);
                }
                queueRef.current.push(new Uint8Array(chunk));
                pumpQueue();
              });
            } else {
              const response = await fetch(directUrl, {
                signal: abortController.signal,
                cache: "no-store",
              });
              if (!response.ok || !response.body) {
                throw new Error(`Load failed: HTTP ${response.status}`);
              }

              const reader = response.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.byteLength > 0) {
                  if (!gotFirstChunk) {
                    gotFirstChunk = true;
                    window.clearTimeout(firstChunkTimeout);
                    setIsLoading(false);
                    window.clearTimeout(initWatchdog);
                  }
                  queueRef.current.push(value);
                  pumpQueue();
                }
              }

              streamFinishedRef.current = true;
              sourceEndedRef.current = false;
              pumpQueue();
            }
            playVideoElement(video);
          } catch (err) {
            if (abortController.signal.aborted) return;
            window.clearTimeout(firstChunkTimeout);
            window.clearTimeout(initWatchdog);
            if (needLiveTranscode) {
              void fallbackToPreparedDirect(err instanceof Error ? err.message : String(err));
            } else {
              fallbackToDirect(directUrl, err instanceof Error ? err.message : String(err), directPath);
            }
          }
        })();
      };

      mediaSource.addEventListener("sourceopen", onSourceOpen, { once: true });
    };

    void init();

    return () => {
      cancelled = true;
      cleanupMse();
    };
  }, [cleanupMse, fallbackToDirect, filePath, playVideoElement, pumpQueue]);

  if (!filePath || filePath === "undefined") {
    return (
      <div className={cn("mb-4 rounded border bg-card p-4", className)}>
        <div className="text-sm text-muted-foreground">No video selected</div>
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

      <div className="rounded-lg border bg-card p-2">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Playback Engine: {mode === "mse" ? "MSE" : "Direct"}</span>
          <span>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div className="mb-2 space-y-1 text-xs text-muted-foreground">
          <div>Input: {filePath}</div>
          <div>Playing: {playbackPath || filePath}</div>
        </div>

        <video
          ref={videoRef}
          className="h-auto w-full rounded bg-black"
          controls={showControls}
          playsInline
          preload="metadata"
        />

        {isLoading && (
          <div className="mt-2 text-xs text-muted-foreground">Preparing playback...</div>
        )}
      </div>
    </div>
  );
};

export default ShakaPlayer;
