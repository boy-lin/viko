import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { FileType, MediaDetails, MediaDetailsWithResolve } from "@/types/tasks";
import { extractFilenameFromPath } from "./utils";
import { MediaTaskType } from "@/types/tasks";
import { handleDirectoryToFiles } from "./file";
import { MediaTaskEvent } from "./mediaTaskEvent";

type ProbeStream = {
  index: number;
  codec_type: string;
  codec_name: string;
  codec_long_name?: string;
  time_base?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  frame_rate?: string;
  channels?: number;
  sample_rate?: number;
  bit_rate?: number;
  bit_depth?: number;
  bits_per_sample?: number;
  tags?: Record<string, string>;
};

type ProbeBase = {
  path: string;
  extension: string;
  size: number;
  format_name?: string;
  format_long_name?: string;
  duration?: number;
  tags?: Record<string, string>;
};

type ProbeVideoDetails = {
  streams: ProbeStream[];
};
type ProbeAudioDetails = {
  streams: ProbeStream[];
};
type ProbeImageDetails = {
  streams: ProbeStream[];
};

type MediaProbeResult = {
  kind: "video" | "audio" | "image" | "unknown";
  base: ProbeBase;
  details:
    | { kind: "video"; details: ProbeVideoDetails }
    | { kind: "audio"; details: ProbeAudioDetails }
    | { kind: "image"; details: ProbeImageDetails }
    | { kind: "unknown" };
};

export type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};

export type BridgeEvents = {
  "video-frame": {
    width: number;
    height: number;
    data?: number[] | Uint8Array;
    data_base64?: string;
  };
  "video-complete": string;
  "video-error": string;
  "single-instance": {
    args?: string[];
    cwd?: string;
  };
  media_task_event: MediaTaskEvent;
  media_thumbnail: {
    requestId: string;
    result: ThumbnailPayload | null;
    error?: string | null;
  };
  "video-mse-stream-end": string;
  "video-mse-stream-error": string;
};

type KnownEvent = keyof BridgeEvents;
type EventPayload<K extends string> = K extends KnownEvent
  ? BridgeEvents[K]
  : unknown;

export interface HardwareSupport {
  h264_hardware: boolean;
  hevc_hardware: boolean;
  prores_hardware: boolean;
}

export interface SelfCheckResult {
  ffmpeg_installed?: boolean;
  ffprobe_installed?: boolean;
  ffmpeg_path?: string | null;
  ffmpeg_version?: string | null;
  ffprobe_path?: string | null;
  ffprobe_version?: string | null;
  fs_permission: boolean;
  fs_error?: string | null;
}

export interface WriteMetadataArgs {
  input_path: string;
  output_path: string;
  metadata: Record<string, string>;
}

export interface ClientLogInput {
  level: "error" | "warn" | "info";
  category: string;
  message: string;
  stack?: string;
  url?: string;
  meta?: Record<string, unknown>;
  timestamp?: number;
}

export interface AuthExchangeCodeInput {
  tokenEndpoint: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface UpdaterGuardStatus {
  shouldForceUpdate: boolean;
  effectiveFailCount: number;
  lastSuccessAtMs?: number | null;
}

export interface BridgeInvokeError extends Error {
  code?: string;
  context?: string;
  originalMessage?: string;
}

interface BridgeEventWaitError extends Error {
  event?: string;
  reason?: unknown;
  details?: Record<string, unknown>;
}

export type MediaTaskPriority = "high" | "normal" | "low";

export type ThumbnailPayload = {
  thumbnailPath?: string;
  dataUrl?: string;
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

export type ThumbnailOptions = {
  width?: number;
  height?: number;
  fitMode?: "contain" | "cover";
};

export type MediaTaskCard = {
  details: MediaDetailsWithResolve;
  thumbnailPath?: string;
};

export interface VideoPlayerOpenInput {
  path: string;
  preview?: {
    width: number;
    height: number;
  };
}

export interface VideoPlayerSize {
  width: number;
  height: number;
}

export interface WebPlaybackPrepareResult {
  playPath: string;
  prepared: boolean;
  reason: string;
}

class Bridge {
  private static instance: Bridge | null = null;
  private disposers: UnlistenFn[] = [];
  private fallbackTarget = new EventTarget();
  private tauriReady = true;
  private readonly maxMediaDetailsConcurrency = 3;
  private mediaDetailsActive = 0;
  private mediaDetailsWaiters: Array<() => void> = [];
  private mediaDetailsCache = new Map<string, MediaDetailsWithResolve>();
  private mediaDetailsInflight = new Map<
    string,
    Promise<MediaDetailsWithResolve>
  >();
  private tauriEventUnlisteners = new Map<string, UnlistenFn>();
  private tauriEventHandlers = new Map<
    string,
    Set<(payload: unknown) => void>
  >();
  videoFrameChannel: Channel<unknown> | null = null;
  private constructor() {
    if (Bridge.instance) {
      return Bridge.instance;
    }
    Bridge.instance = this;
  }

  static getInstance(): Bridge {
    if (Bridge.instance === null) {
      Bridge.instance = new Bridge();
    }
    return Bridge.instance;
  }

  isTauri() {
    return this.tauriReady;
  }

  isTauriEvn() {
    return typeof window !== "undefined" && "__TAURI__" in window;
  }

  async on<K extends string>(
    event: K,
    handler: (payload: EventPayload<K>) => void,
  ): Promise<() => void> {
    if (this.tauriReady) {
      const eventKey = String(event);
      const typedHandler = handler as (payload: unknown) => void;
      let handlers = this.tauriEventHandlers.get(eventKey);
      if (!handlers) {
        handlers = new Set<(payload: unknown) => void>();
        this.tauriEventHandlers.set(eventKey, handlers);
      }
      handlers.add(typedHandler);

      if (!this.tauriEventUnlisteners.has(eventKey)) {
        const unlisten = await listen<unknown>(eventKey, ({ payload }) => {
          const listeners = this.tauriEventHandlers.get(eventKey);
          if (!listeners || listeners.size === 0) return;
          listeners.forEach((listener) => listener(payload));
        });
        this.tauriEventUnlisteners.set(eventKey, unlisten);
        this.disposers.push(unlisten);
      }

      return () => {
        const listeners = this.tauriEventHandlers.get(eventKey);
        if (!listeners) return;
        listeners.delete(typedHandler);
        if (listeners.size > 0) return;

        this.tauriEventHandlers.delete(eventKey);
        const unlisten = this.tauriEventUnlisteners.get(eventKey);
        if (unlisten) {
          unlisten();
          this.tauriEventUnlisteners.delete(eventKey);
          this.disposers = this.disposers.filter((fn) => fn !== unlisten);
        }
      };
    }

    const wrapped = (evt: Event) => {
      const detail = (evt as CustomEvent<EventPayload<K>>).detail;
      handler(detail);
    };
    this.fallbackTarget.addEventListener(event, wrapped);
    return () =>
      this.fallbackTarget.removeEventListener(event, wrapped as EventListener);
  }

  async emit<K extends string>(event: K, payload: EventPayload<K>) {
    if (this.tauriReady) {
      await emit(event, payload);
      return;
    }
    this.fallbackTarget.dispatchEvent(
      new CustomEvent<EventPayload<K>>(event, { detail: payload }),
    );
  }

  createEventWaiter<K extends string>(
    event: K,
    options?: {
      timeoutMs?: number;
      filter?: (payload: EventPayload<K>) => boolean;
      signal?: AbortSignal;
    },
  ): { promise: Promise<EventPayload<K>>; cancel: () => void } {
    const timeoutMs = options?.timeoutMs ?? 15000;
    let cancel: () => void = () => {};
    const promise = new Promise<EventPayload<K>>((resolve, reject) => {
      let settled = false;
      let timeoutId: number | null = null;
      let unlisten: (() => void) | null = null;

      const finalize = (err?: Error, payload?: EventPayload<K>) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        if (unlisten) unlisten();
        if (options?.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }
        if (err) reject(err);
        else if (payload) resolve(payload);
      };

      const createEventWaitError = (
        kind: "aborted" | "timeout" | "cancelled",
        reason?: unknown,
      ): BridgeEventWaitError => {
        const details: Record<string, unknown> = { timeoutMs };
        if (reason !== undefined) {
          details.reason = this.formatUnknownError(reason);
        }
        const err = new Error(
          `Event "${String(event)}" ${kind}${
            reason === undefined ? "" : `: ${this.formatUnknownError(reason)}`
          }`,
        ) as BridgeEventWaitError;
        err.name = "BridgeEventWaitError";
        err.event = String(event);
        err.reason = reason;
        err.details = details;
        return err;
      };

      const onAbort = () => {
        finalize(
          createEventWaitError(
            "aborted",
            options?.signal ? options.signal.reason : undefined,
          ),
        );
      };

      this.on(event, (payload) => {
        if (options?.filter && !options.filter(payload)) return;
        finalize(undefined, payload);
      })
        .then((dispose) => {
          unlisten = dispose;
          timeoutId = window.setTimeout(() => {
            finalize(createEventWaitError("timeout"));
          }, timeoutMs);
          if (options?.signal) {
            if (options.signal.aborted) {
              finalize(
                createEventWaitError("aborted", options.signal.reason),
              );
              return;
            }
            options.signal.addEventListener("abort", onAbort, { once: true });
          }
        })
        .catch((err) => finalize(err));

      cancel = () => finalize(createEventWaitError("cancelled"));
    });
    return { promise, cancel };
  }

  private formatUnknownError(value: unknown): string {
    if (value instanceof Error) {
      return value.stack || value.message || value.name;
    }
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  once<K extends string>(
    event: K,
    options?: {
      timeoutMs?: number;
      filter?: (payload: EventPayload<K>) => boolean;
      signal?: AbortSignal;
    },
  ): Promise<EventPayload<K>> {
    return this.createEventWaiter(event, options).promise;
  }

  async invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.tauriReady) {
      console.warn(`[bridge] invoke "${cmd}" skipped: not running in Tauri`);
      return Promise.reject(new Error("Tauri runtime unavailable"));
    }
    try {
      return await invoke<T>(cmd, args);
    } catch (error) {
      throw this.parseInvokeError(error, cmd);
    }
  }

  private parseInvokeError(error: unknown, cmd: string): BridgeInvokeError {
    const rawMessage =
      (error as { message?: string } | null | undefined)?.message ||
      String(error ?? "Unknown invoke error");
    const matched = rawMessage.match(/^\[([A-Z_]+)(?::([^\]]+))?\]\s*(.*)$/);
    const parsedCode = matched?.[1];
    const parsedContext = matched?.[2];
    const parsedMessage = matched?.[3]?.trim();

    const err = new Error(
      parsedMessage?.length ? parsedMessage : rawMessage,
    ) as BridgeInvokeError;
    err.name = "BridgeInvokeError";
    err.code = parsedCode || "INVOKE_ERROR";
    err.context = parsedContext || cmd;
    err.originalMessage = rawMessage;
    return err;
  }

  private async acquireMediaDetailsSlot(): Promise<void> {
    if (this.mediaDetailsActive < this.maxMediaDetailsConcurrency) {
      this.mediaDetailsActive += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.mediaDetailsWaiters.push(() => {
        this.mediaDetailsActive += 1;
        resolve();
      });
    });
  }

  private releaseMediaDetailsSlot() {
    this.mediaDetailsActive = Math.max(0, this.mediaDetailsActive - 1);
    const next = this.mediaDetailsWaiters.shift();
    if (next) next();
  }

  private async withMediaDetailsSlot<T>(task: () => Promise<T>): Promise<T> {
    await this.acquireMediaDetailsSlot();
    try {
      return await task();
    } finally {
      this.releaseMediaDetailsSlot();
    }
  }

  private normalizeMediaDetails(
    path: string,
    details: MediaDetails,
  ): MediaDetailsWithResolve {
    let format = details.extension.toLowerCase();
    if (!details.extension) {
      format = details.format_names.split(",")[0];
    }

    let resolution = "";
    const vidStream = details.streams.find((s) => s.codec_type === "video");
    if (vidStream && vidStream.width && vidStream.height) {
      resolution = `${vidStream.width}*${vidStream.height}`;
    }
    const title = extractFilenameFromPath(path);
    return {
      ...details,
      format,
      resolution,
      title,
    };
  }

  private mapProbeToMediaDetails(probe: MediaProbeResult): MediaDetails {
    const detailsKind = probe.details?.kind;
    const typedDetails =
      detailsKind === "video" ||
      detailsKind === "audio" ||
      detailsKind === "image"
        ? probe.details.details
        : undefined;
    const streams = (typedDetails?.streams || []).map((stream) => ({
      index: stream.index,
      codec_type: stream.codec_type,
      codec_name: stream.codec_name,
      codec_long_name: stream.codec_long_name,
      time_base: stream.time_base,
      pix_fmt: stream.pix_fmt,
      width: stream.width,
      height: stream.height,
      frame_rate: stream.frame_rate,
      channels: stream.channels,
      sample_rate: stream.sample_rate,
      bit_rate: stream.bit_rate,
      bit_depth: stream.bit_depth,
      bits_per_sample: stream.bits_per_sample,
    }));

    return {
      path: probe.base.path,
      extension: probe.base.extension || "",
      format_names: probe.base.format_name || "",
      title: extractFilenameFromPath(probe.base.path),
      format_long_name: probe.base.format_long_name,
      duration: probe.base.duration ?? 0,
      size: probe.base.size ?? 0,
      streams,
      tags: probe.base.tags || {},
      stream_tags: streams.map(
        (_, index) => typedDetails?.streams?.[index]?.tags || {},
      ),
    };
  }

  private async getCachedMediaDetails(
    cacheKey: string,
    loader: () => Promise<MediaDetailsWithResolve>,
  ): Promise<MediaDetailsWithResolve> {
    const cached = this.mediaDetailsCache.get(cacheKey);
    if (cached) return cached;

    const inflight = this.mediaDetailsInflight.get(cacheKey);
    if (inflight) return inflight;

    const promise = this.withMediaDetailsSlot(async () => {
      const result = await loader();
      this.mediaDetailsCache.set(cacheKey, result);
      return result;
    }).finally(() => {
      this.mediaDetailsInflight.delete(cacheKey);
    });

    this.mediaDetailsInflight.set(cacheKey, promise);
    return promise;
  }

  async getMediaDetails(path: string): Promise<MediaDetailsWithResolve> {
    const normalizedPath = path.trim();
    const cacheKey = `media:${normalizedPath}`;
    return this.getCachedMediaDetails(cacheKey, async () => {
      const probe = await this.invoke<MediaProbeResult>("probe_media_info", {
        path: normalizedPath,
      });
      const details = this.mapProbeToMediaDetails(probe);
      return this.normalizeMediaDetails(normalizedPath, details);
    });
  }

  async getMediaDetailsBatch(
    paths: string[],
  ): Promise<MediaDetailsWithResolve[]> {
    const normalizedPaths = paths
      .map((path) => path.trim())
      .filter((path) => path.length > 0);
    if (normalizedPaths.length === 0) return [];

    const toFetch = Array.from(
      new Set(
        normalizedPaths.filter(
          (path) => !this.mediaDetailsCache.has(`media:${path}`),
        ),
      ),
    );

    if (toFetch.length > 0) {
      const deferred = new Map<
        string,
        {
          resolve: (value: MediaDetailsWithResolve) => void;
          reject: (error: unknown) => void;
        }
      >();

      toFetch.forEach((sourcePath) => {
        const cacheKey = `media:${sourcePath}`;
        let resolve!: (value: MediaDetailsWithResolve) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<MediaDetailsWithResolve>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        deferred.set(cacheKey, { resolve, reject });
        this.mediaDetailsInflight.set(cacheKey, promise);
      });

      try {
        const fetched = await this.withMediaDetailsSlot(() =>
          this.invoke<MediaProbeResult[]>("probe_media_info_batch", {
            paths: toFetch,
          }),
        );
        fetched.forEach((probe, index) => {
          const sourcePath = toFetch[index];
          if (!sourcePath) return;
          const cacheKey = `media:${sourcePath}`;
          const details = this.mapProbeToMediaDetails(probe);
          const normalized = this.normalizeMediaDetails(sourcePath, details);
          this.mediaDetailsCache.set(cacheKey, normalized);
          deferred.get(cacheKey)?.resolve(normalized);
        });
      } catch (error) {
        deferred.forEach(({ reject }) => reject(error));
      } finally {
        toFetch.forEach((sourcePath) => {
          this.mediaDetailsInflight.delete(`media:${sourcePath}`);
        });
      }
    }

    return Promise.all(
      normalizedPaths.map((path) => this.getMediaDetails(path)),
    );
  }

  async getMediaTaskCardBatch(
    paths: string[],
    thumbnailOptions?: ThumbnailOptions,
  ): Promise<MediaTaskCard[]> {
    const normalizedPaths = paths
      .map((path) => path.trim())
      .filter((path) => path.length > 0);
    if (normalizedPaths.length === 0) return [];

    const cards = await this.invoke<
      Array<{
        probe: MediaProbeResult;
        thumbnail?: ThumbnailPayload | null;
      }>
    >("probe_media_card_batch", {
      paths: normalizedPaths,
      thumbnailOptions,
    });

    return cards.map((card, index) => {
      const sourcePath = normalizedPaths[index] ?? card.probe.base.path;
      const details = this.normalizeMediaDetails(
        sourcePath,
        this.mapProbeToMediaDetails(card.probe),
      );
      this.mediaDetailsCache.set(`media:${sourcePath}`, details);
      return {
        details,
        thumbnailPath: card.thumbnail?.thumbnailPath || undefined,
      };
    });
  }

  async getImageDetails(path: string): Promise<MediaDetailsWithResolve> {
    const normalizedPath = path.trim();
    const cacheKey = `image:${normalizedPath}`;
    return this.getCachedMediaDetails(cacheKey, async () => {
      const details = await this.invoke<MediaDetails>(
        "get_detailed_image_info",
        {
          path: normalizedPath,
        },
      );
      return this.normalizeMediaDetails(normalizedPath, details);
    });
  }

  async checkHardwareAcceleration(): Promise<HardwareSupport> {
    return this.invoke<HardwareSupport>("check_hardware_acceleration");
  }

  async runSelfCheck(): Promise<SelfCheckResult> {
    return this.invoke<SelfCheckResult>("run_self_check");
  }

  async getMediaInfo<T = unknown>(path: string): Promise<T> {
    return this.invoke<T>("get_media_info", { path });
  }

  async writeMediaMetadata(args: WriteMetadataArgs): Promise<void> {
    await this.invoke("write_media_metadata", { args });
  }

  async reportClientLog(log: ClientLogInput): Promise<void> {
    await this.invoke("report_client_log", { log });
  }

  async exportLogsArchive(): Promise<string> {
    return this.invoke<string>("export_logs_archive");
  }

  async authExchangeCode(input: AuthExchangeCodeInput): Promise<{
    access_token: string;
    refresh_token?: string | null;
    expires_in?: number | null;
    token_type?: string | null;
    id_token?: string | null;
  }> {
    return this.invoke("auth_exchange_code", { input });
  }

  async updaterGuardGetStatus(): Promise<UpdaterGuardStatus> {
    return this.invoke<UpdaterGuardStatus>("updater_guard_get_status");
  }

  async updaterGuardReportSuccess(): Promise<UpdaterGuardStatus> {
    return this.invoke<UpdaterGuardStatus>("updater_guard_report_success");
  }

  async updaterGuardReportFailure(
    reason?: string,
  ): Promise<UpdaterGuardStatus> {
    return this.invoke<UpdaterGuardStatus>("updater_guard_report_failure", {
      reason,
    });
  }

  async updaterGuardReset(): Promise<void> {
    await this.invoke("updater_guard_reset");
  }

  async submitMediaTasks(
    tasks: unknown[],
    priority: MediaTaskPriority = "normal",
  ): Promise<void> {
    await this.invoke("media_task_submit", { tasks, priority });
  }

  async hasRunningMediaTasksByType(taskType?: MediaTaskType): Promise<boolean> {
    if (taskType) {
      return this.invoke<boolean>("media_task_has_running_by_type", {
        taskType,
      });
    }
    return this.invoke<boolean>("media_task_has_running_by_type");
  }

  async clearMediaTaskQueueByType(
    stopRunning: boolean = false,
    taskType?: MediaTaskType,
  ): Promise<void> {
    const args: Record<string, unknown> = { stopRunning };
    if (taskType) args.taskType = taskType;
    await this.invoke("media_task_clear_by_type_with_stop", args);
  }

  async cancelMediaTaskById(id: string): Promise<void> {
    await this.invoke("media_task_cancel_task", { id });
  }

  async convertAudioFile(args: Record<string, unknown>): Promise<void> {
    await this.invoke("convert_audio_file", { args });
  }

  async revealItemInDirFallback(path: string): Promise<void> {
    await this.invoke("plugin:opener|reveal_item_in_dir", { paths: [path] });
  }

  async videoPlayerOpen(
    input: VideoPlayerOpenInput,
    onFrame?: (frameBuffer: ArrayBuffer) => void,
  ): Promise<void> {
    const args: Record<string, unknown> = {
      path: input.path,
      preview: input.preview,
    };
    this.videoFrameChannel = null;
    if (onFrame) {
      const channel = new Channel<unknown>();
      channel.onmessage = (payload) => {
        if (payload instanceof ArrayBuffer) {
          onFrame(payload);
          return;
        }
        if (ArrayBuffer.isView(payload)) {
          const view = payload;
          onFrame(
            view.buffer.slice(
              view.byteOffset,
              view.byteOffset + view.byteLength,
            ) as ArrayBuffer,
          );
        }
      };
      this.videoFrameChannel = channel;
      args.frameChannel = channel;
    }
    await this.invoke("video_player_open", args);
  }

  async videoPlayerPlay(): Promise<void> {
    await this.invoke("video_player_play");
  }

  async videoPlayerPause(): Promise<void> {
    await this.invoke("video_player_pause");
  }

  async videoPlayerSeek(position: number): Promise<void> {
    await this.invoke("video_player_seek", { position });
  }

  async videoPlayerGetPosition(): Promise<number> {
    return this.invoke<number>("video_player_get_position");
  }

  async videoPlayerGetDuration(): Promise<number> {
    return this.invoke<number>("video_player_get_duration");
  }

  async videoPlayerGetSize(): Promise<VideoPlayerSize> {
    const result = await this.invoke<[number, number]>("video_player_get_size");
    return { width: result[0], height: result[1] };
  }

  async videoPlayerSetVolume(volume: number): Promise<void> {
    await this.invoke("video_player_set_volume", { volume });
  }

  async videoPlayerClose(): Promise<void> {
    await this.invoke("video_player_close");
    this.videoFrameChannel = null;
  }

  async prepareVideoForWebPlayback(
    path: string,
  ): Promise<WebPlaybackPrepareResult> {
    return this.invoke<WebPlaybackPrepareResult>(
      "prepare_video_for_web_playback",
      { path },
    );
  }

  async videoMseStreamOpen(
    path: string,
    onChunk: (chunk: ArrayBuffer) => void,
    startSeconds = 0,
  ): Promise<void> {
    const channel = new Channel<unknown>();
    channel.onmessage = (payload) => {
      if (payload instanceof ArrayBuffer) {
        onChunk(payload);
        return;
      }
      if (ArrayBuffer.isView(payload)) {
        const view = payload;
        onChunk(
          view.buffer.slice(
            view.byteOffset,
            view.byteOffset + view.byteLength,
          ) as ArrayBuffer,
        );
      }
    };
    await this.invoke("video_mse_stream_open", {
      path,
      startSeconds,
      chunkChannel: channel,
    });
  }

  async videoMseStreamClose(): Promise<void> {
    await this.invoke("video_mse_stream_close");
  }

  async audioPlayerOpen(path: string): Promise<string> {
    return this.invoke<string>("audio_player_open", { path });
  }

  async audioPlayerPlay(): Promise<void> {
    await this.invoke("audio_player_play");
  }

  async audioPlayerPause(): Promise<void> {
    await this.invoke("audio_player_pause");
  }

  async audioPlayerSeek(position: number): Promise<void> {
    await this.invoke("audio_player_seek", { position });
  }

  async audioPlayerStop(): Promise<void> {
    await this.invoke("audio_player_stop");
  }

  async audioPlayerSetVolume(volume: number): Promise<void> {
    await this.invoke("audio_player_set_volume", { volume });
  }

  async audioPlayerGetPosition(): Promise<number> {
    return this.invoke<number>("audio_player_get_position");
  }

  async audioPlayerGetDuration(): Promise<number> {
    return this.invoke<number>("audio_player_get_duration");
  }

  async generateMediaThumbnail(
    path: string,
    options?: ThumbnailOptions,
    requestOptions?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<ThumbnailPayload | null> {
    const requestId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { promise, cancel } = this.createEventWaiter("media_thumbnail", {
      filter: (payload) => payload.requestId === requestId,
      timeoutMs: requestOptions?.timeoutMs,
      signal: requestOptions?.signal,
    });

    try {
      await this.invoke<void>("generate_media_thumbnail", {
        requestId,
        path,
        options,
      });
    } catch (err) {
      cancel();
      throw err;
    }

    let payload;
    try {
      payload = await promise;
    } catch (error) {
      const detail = {
        requestId,
        path,
        options,
        timeoutMs: requestOptions?.timeoutMs,
        aborted: requestOptions?.signal?.aborted ?? false,
        abortReason: requestOptions?.signal?.aborted
          ? this.formatUnknownError(requestOptions.signal.reason)
          : undefined,
      };
      const message = `generateMediaThumbnail failed: ${this.formatUnknownError(error)} | detail=${JSON.stringify(detail)}`;
      const wrapped = new Error(message) as BridgeEventWaitError;
      wrapped.name =
        error instanceof Error && error.name
          ? error.name
          : "BridgeEventWaitError";
      wrapped.event = "media_thumbnail";
      wrapped.reason = error;
      wrapped.details = {
        ...(error instanceof Error &&
        "details" in error &&
        (error as BridgeEventWaitError).details
          ? (error as BridgeEventWaitError).details
          : {}),
        ...detail,
      };
      if (error instanceof Error) {
        wrapped.stack = error.stack;
      }
      throw wrapped;
    }
    if (payload.error) {
      throw new Error(
        `generateMediaThumbnail backend error: ${payload.error} | detail=${JSON.stringify({
          requestId,
          path,
          options,
        })}`,
      );
    }
    return payload.result ?? null;
  }

  async getMediaThumbnailSrc(
    path: string,
    options?: ThumbnailOptions,
    requestOptions?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<string | null> {
    const result = await this.generateMediaThumbnail(
      path,
      options,
      requestOptions,
    );
    if (result?.thumbnailPath) {
      return convertFileSrc(result.thumbnailPath);
    }
    if (result?.dataUrl) {
      return result.dataUrl;
    }
    return null;
  }

  async getDeviceId(): Promise<string> {
    return this.invoke<string>("get_device_id");
  }

  async getTaskHistory(
    limit: number = 50,
    offset: number = 0,
    taskType?: string,
    keyword?: string,
    sortBy?: "created_at" | "output_name",
    sortOrder?: "asc" | "desc",
  ): Promise<TaskHistoryItem[]> {
    return this.invoke<TaskHistoryItem[]>("get_task_history", {
      limit,
      offset,
      taskType,
      keyword,
      sortBy,
      sortOrder,
    });
  }

  async deleteTaskHistory(id: string): Promise<void> {
    return this.invoke("delete_task_history", { id });
  }

  async clearTaskHistory(taskType?: string): Promise<void> {
    return this.invoke("clear_task_history", { taskType });
  }

  async getMyFiles(
    limit: number = 10,
    offset: number = 0,
    keyword?: string,
    sortBy?: "date" | "name",
    sortOrder?: "asc" | "desc",
    mediaType?: FileType,
  ): Promise<MyFileItem[]> {
    return this.invoke<MyFileItem[]>("get_my_files", {
      limit,
      offset,
      keyword,
      sortBy,
      sortOrder,
      mediaType,
    });
  }

  async getMyFilesPage(
    limit: number = 10,
    offset: number = 0,
    keyword?: string,
    sortBy?: "date" | "name",
    sortOrder?: "asc" | "desc",
    mediaType?: FileType,
  ): Promise<{ list: MyFileItem[]; hasMore: boolean }> {
    const pageSize = Math.max(1, limit);
    const rows = await this.getMyFiles(
      pageSize + 1,
      offset,
      keyword,
      sortBy,
      sortOrder,
      mediaType,
    );
    return {
      list: rows.slice(0, pageSize),
      hasMore: rows.length > pageSize,
    };
  }

  clear() {
    this.tauriEventHandlers.clear();
    this.tauriEventUnlisteners.clear();
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }

  async getDirectoryToFiles(paths: string[], extensions: string[]) {
    try {
      if (!paths.length) return [];
      // 处理文件夹：如果是文件夹，读取文件夹下的所有支持文件（只递归一层）
      const finalPaths: string[] = await handleDirectoryToFiles({
        paths,
        depth: 1,
        supportedExtensions: extensions,
      });
      if (!finalPaths.length) return [];
      return finalPaths;
    } catch (err) {
      console.error("Error selecting files:", err);
      return [];
    }
  }

  async addFilesOrFolders(opts: {
    name: string;
    multiple: boolean;
    extensions: string[];
    directory?: boolean;
  }) {
    const {
      name = "",
      multiple = false,
      extensions = [],
      directory = false,
    } = opts;
    const selected = await open({
      multiple,
      filters: [
        {
          name,
          extensions,
        },
      ],
      directory,
    });
    if (!selected) return [];
    const paths: string[] = Array.isArray(selected) ? selected : [selected];
    if (directory) {
      return await this.getDirectoryToFiles(paths, extensions);
    }
    return paths;
  }
}

export interface TaskHistoryItem {
  id: string;
  task_type: MediaTaskType;
  media_type: FileType;
  status: "idle" | "processing" | "finished" | "error" | "cancelled";
  input_path: string;
  output_path?: string;
  output_size?: number;
  output_duration?: string;
  title?: string;
  thumbnail?: string;
  created_at: number;
  finished_at: number;
  error_message?: string;
  // Deprecated: backend no longer returns these fields in history payload.
  task_data?: string;
  effective_params?: string;
}

export interface MyFileItem extends TaskHistoryItem {
  is_favorite?: boolean;
}

export const bridge = Bridge.getInstance();
