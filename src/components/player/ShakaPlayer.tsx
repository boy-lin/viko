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

const MIME_CANDIDATES = [
  'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
  'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
  'video/mp4; codecs="avc1.4D401F, mp4a.40.2"',
  'video/mp4; codecs="avc1.42E01E"',
  "video/mp4",
] as const;
const BUFFER_KEEP_BACK_SECONDS = 30;
const BUFFER_EVICT_HEADROOM_SECONDS = 10;
const MSE_SEEK_BUFFER_TOLERANCE_SECONDS = 0.35;

function canUseMse() {
  return typeof window !== "undefined" && "MediaSource" in window;
}

function pickSupportedMimeType() {
  if (!canUseMse()) return undefined;
  return MIME_CANDIDATES.find((mime) => MediaSource.isTypeSupported(mime));
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

function getVideoAspectRatio(details: MediaDetailsWithResolve | null) {
  const videoStream = details?.streams.find((s) => s.codec_type === "video");
  const width = Number(videoStream?.width || 0);
  const height = Number(videoStream?.height || 0);
  if (width > 0 && height > 0) {
    return width / height;
  }
  return 16 / 9;
}

function isTimeBuffered(video: HTMLVideoElement, seconds: number) {
  if (!Number.isFinite(seconds)) return false;
  for (let i = 0; i < video.buffered.length; i += 1) {
    const start = video.buffered.start(i) - MSE_SEEK_BUFFER_TOLERANCE_SECONDS;
    const end = video.buffered.end(i) + MSE_SEEK_BUFFER_TOLERANCE_SECONDS;
    if (seconds >= start && seconds <= end) {
      return true;
    }
  }
  return false;
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
  const liveTranscodeMseRef = useRef(false);
  const internalSeekRef = useRef(false);
  const resumeAfterReloadRef = useRef(false);
  const pendingResumeRef = useRef(false);

  const [error, setError] = useState("");
  const [playbackRequest, setPlaybackRequest] = useState({ token: 0, startAt: 0 });
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const playVideoElement = useCallback(
    (video: HTMLVideoElement, force = false) => {
      if (!force && !autoPlay) return;
      void video.play().catch(() => {
        // autoplay may be blocked
      });
  }, [autoPlay]);

  const requestResume = useCallback(
    (video: HTMLVideoElement, shouldResume: boolean) => {
      pendingResumeRef.current = shouldResume;
      if (!shouldResume) return;
      playVideoElement(video, true);
    },
    [playVideoElement],
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
                return;
              } catch (removeErr) {
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
    (url: string, reason?: string, seekTo?: number) => {
      const video = videoRef.current;
      if (!video) return;
      const shouldResume = resumeAfterReloadRef.current || autoPlay;
      resumeAfterReloadRef.current = false;
      pendingResumeRef.current = shouldResume;
      mseDisabledRef.current = true;
      liveTranscodeMseRef.current = false;
      queueRef.current = [];
      setError(reason ?? "MSE failed, fallback to direct mode");
      cleanupMse();
      video.src = url;
      if (seekTo && seekTo > 0) {
        video.addEventListener(
          "loadedmetadata",
          () => {
            try {
              internalSeekRef.current = true;
              video.currentTime = seekTo;
            } catch {
              // ignore
            }
            requestResume(video, shouldResume);
          },
          { once: true },
        );
      }
      video.load();
      if (!(seekTo && seekTo > 0)) {
        requestResume(video, shouldResume);
      }
    },
    [autoPlay, cleanupMse, filePath, requestResume],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedData = () => {
      if (pendingResumeRef.current && !video.ended) {
        playVideoElement(video, true);
      }
    };
    const onCanPlay = () => {
      if (pendingResumeRef.current && !video.ended) {
        playVideoElement(video, true);
      }
    };
    const onPlay = () => {
      pendingResumeRef.current = false;
    };
    const onPause = () => {};
    const onWaiting = () => {};
    const onSeeked = () => {};
    const onSeeking = () => {
      if (internalSeekRef.current) {
        internalSeekRef.current = false;
        return;
      }
      if (!liveTranscodeMseRef.current) return;
      const target = video.currentTime;
      if (!Number.isFinite(target) || target < 0) return;
      if (isTimeBuffered(video, target)) return;
      resumeAfterReloadRef.current = !video.paused && !video.ended;
      setPlaybackRequest((prev) => ({ token: prev.token + 1, startAt: target }));
    };

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("seeking", onSeeking);

    return () => {
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("seeking", onSeeking);
    };
  }, [playVideoElement]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const sessionId = ++sessionIdRef.current;
    const isStale = () => cancelled || sessionIdRef.current !== sessionId;
    const isNewFile = lastFilePathRef.current !== (filePath || "");
    const requestedStartAt = isNewFile ? 0 : playbackRequest.startAt;

    if (isNewFile) {
      lastFilePathRef.current = filePath || "";
      mseDisabledRef.current = false;
    }

    void bridge.videoPlayerClose().catch(() => {});
    cleanupMse();
    liveTranscodeMseRef.current = false;

    setError("");

    if (!filePath || filePath === "undefined") return;

    const init = async () => {
      const initialDirectUrl = convertFileSrc(filePath);
      const clampedRequestedStartAt = Math.max(0, requestedStartAt);
      const shouldResume =
        requestedStartAt > 0 ? resumeAfterReloadRef.current || autoPlay : autoPlay;
      resumeAfterReloadRef.current = false;
      pendingResumeRef.current = shouldResume;
      const initWatchdog = window.setTimeout(() => {
        if (!isStale()) {
          fallbackToDirect(initialDirectUrl, "init watchdog timeout", clampedRequestedStartAt);
        }
      }, 15000);

      let details: MediaDetailsWithResolve | null = null;
      try {
        details = await bridge.getMediaDetails(filePath);
        setAspectRatio(getVideoAspectRatio(details));
      } catch {
        details = null;
      }

      if (isStale()) return;

      const needLiveTranscode = shouldTranscodeForWebPlayback(details, filePath);
      const mediaDuration = Math.max(0, details?.duration || 0);
      const effectiveStartAt =
        mediaDuration > 0
          ? Math.min(clampedRequestedStartAt, Math.max(0, mediaDuration - 0.25))
          : clampedRequestedStartAt;
      const fallbackToPreparedDirect = async (reason: string) => {
        try {
          const prepared = await bridge.prepareVideoForWebPlayback(filePath);
          if (isStale()) return;
          const preparedPath = prepared.playPath || filePath;
          const preparedUrl = convertFileSrc(preparedPath);
          window.clearTimeout(initWatchdog);
          fallbackToDirect(preparedUrl, reason, effectiveStartAt);
        } catch (err) {
          if (isStale()) return;
          window.clearTimeout(initWatchdog);
          fallbackToDirect(directUrl, `${reason} | prepare failed`, effectiveStartAt);
        }
      };

      const directUrl = convertFileSrc(filePath);
      const mimeType = pickSupportedMimeType();
      const canUseMseNow =
        !mseDisabledRef.current &&
        Boolean(mimeType) &&
        (needLiveTranscode || isWhitelistedForMse(filePath));

      if (!canUseMseNow) {
        if (needLiveTranscode) {
          await fallbackToPreparedDirect("mse unavailable, fallback to prepare+direct");
        } else {
          video.src = directUrl;
          if (effectiveStartAt > 0) {
            video.addEventListener(
              "loadedmetadata",
              () => {
                try {
                  internalSeekRef.current = true;
                  video.currentTime = effectiveStartAt;
                } catch {
                  // ignore
                }
                requestResume(video, shouldResume);
              },
              { once: true },
            );
          }
          video.load();
          window.clearTimeout(initWatchdog);
          if (effectiveStartAt <= 0) {
            requestResume(video, shouldResume);
          }
        }
        return;
      }

      liveTranscodeMseRef.current = needLiveTranscode;
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
        if (mediaDuration > 0) {
          try {
            mediaSource.duration = mediaDuration;
          } catch {
            // ignore
          }
        }
        let gotFirstChunk = false;
        let appliedInitialSeek = effectiveStartAt <= 0;
        const firstChunkTimeout = window.setTimeout(() => {
          if (!gotFirstChunk) {
            if (needLiveTranscode) {
              void fallbackToPreparedDirect("mse first chunk timeout");
            } else {
              fallbackToDirect(directUrl, "mse first chunk timeout", effectiveStartAt);
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
              effectiveStartAt,
            );
          }
          return;
        }

        sourceBufferRef.current = sourceBuffer;
        if (effectiveStartAt > 0) {
          try {
            sourceBuffer.timestampOffset = effectiveStartAt;
          } catch {
            // ignore
          }
        }

        const applyInitialSeek = () => {
          if (appliedInitialSeek || effectiveStartAt <= 0) return;
          try {
            internalSeekRef.current = true;
            video.currentTime = effectiveStartAt;
            appliedInitialSeek = true;
            if (shouldResume) {
              requestResume(video, true);
            }
          } catch {
            // ignore
          }
        };

        sourceBuffer.addEventListener("updateend", () => {
          appendingRef.current = false;
          applyInitialSeek();
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
            fallbackToDirect(directUrl, "source buffer error", effectiveStartAt);
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
            fallbackToDirect(directUrl, "video element resource error", effectiveStartAt);
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
                  window.clearTimeout(initWatchdog);
                  applyInitialSeek();
                }
                queueRef.current.push(new Uint8Array(chunk));
                pumpQueue();
              }, effectiveStartAt);
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
                    window.clearTimeout(initWatchdog);
                    applyInitialSeek();
                  }
                  queueRef.current.push(value);
                  pumpQueue();
                }
              }

              streamFinishedRef.current = true;
              sourceEndedRef.current = false;
              pumpQueue();
            }
            requestResume(video, shouldResume);
          } catch (err) {
            if (abortController.signal.aborted) return;
            window.clearTimeout(firstChunkTimeout);
            window.clearTimeout(initWatchdog);
            if (needLiveTranscode) {
              void fallbackToPreparedDirect(err instanceof Error ? err.message : String(err));
            } else {
              fallbackToDirect(
                directUrl,
                err instanceof Error ? err.message : String(err),   
                effectiveStartAt,
              );
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
  }, [cleanupMse, fallbackToDirect, filePath, playbackRequest, playVideoElement, pumpQueue]);

  if (!filePath || filePath === "undefined") {
    return (
      <div className={cn("mb-4 rounded border bg-card p-4", className)}>
        <div className="text-sm text-muted-foreground">No video selected</div>
      </div>
    );
  }

  return (
    <div className={cn("relative flex-1 h-full w-full", className)}>
      {error && (
        <div className="absolute z-10 mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className={cn("relative flex-1 max-h-full", aspectRatio > 1 ? "h-auto w-full top-1/2 -translate-y-1/2" : "h-full w-auto")}>
        <div
          className={cn(
            "relative m-auto", 
            aspectRatio > 1 ? "h-auto w-full" : "h-full w-auto"
          )}
          style={{ aspectRatio: String(aspectRatio) }}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-contain m-auto overflow-hidden rounded-xl"
            controls={showControls}
            playsInline
            preload="metadata"
          />
        </div>
      </div>
    </div>
  );
};

export default ShakaPlayer;
