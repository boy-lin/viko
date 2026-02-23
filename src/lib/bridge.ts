import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  FileType,
  MediaDetails,
} from "@/types/tasks";
import { extractFilenameFromPath } from "./utils";
import { MediaTaskType } from "@/types/tasks";
import { handleDirectoryToFiles } from "./file";
import { MediaTaskEvent } from "./mediaTaskEvent";

export type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};

export type BridgeEvents = {
  "video-frame": { width: number; height: number; data: number[] | Uint8Array };
  "video-complete": string;
  "video-error": string;
  "media_task_event": MediaTaskEvent;
  "media_thumbnail": {
    requestId: string;
    result: ThumbnailPayload | null;
    error?: string | null;
  };
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

class Bridge {
  private static instance: Bridge | null = null;
  private disposers: UnlistenFn[] = [];
  private fallbackTarget = new EventTarget();
  private tauriReady = true;

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
    handler: (payload: EventPayload<K>) => void
  ): Promise<() => void> {
    if (this.tauriReady) {
      const unlisten = await listen<EventPayload<K>>(event, ({ payload }) =>
        handler(payload)
      );
      this.disposers.push(unlisten);
      return () => {
        unlisten();
        this.disposers = this.disposers.filter((fn) => fn !== unlisten);
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
      new CustomEvent<EventPayload<K>>(event, { detail: payload })
    );
  }

  createEventWaiter<K extends string>(
    event: K,
    options?: {
      timeoutMs?: number;
      filter?: (payload: EventPayload<K>) => boolean;
      signal?: AbortSignal;
    }
  ): { promise: Promise<EventPayload<K>>; cancel: () => void } {
    const timeoutMs = options?.timeoutMs ?? 15000;
    let cancel: () => void = () => { };
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

      const onAbort = () => {
        finalize(new Error(`Event "${String(event)}" aborted`));
      };

      this.on(event, (payload) => {
        if (options?.filter && !options.filter(payload)) return;
        finalize(undefined, payload);
      })
        .then((dispose) => {
          unlisten = dispose;
          timeoutId = window.setTimeout(() => {
            finalize(new Error(`Event "${String(event)}" timeout`));
          }, timeoutMs);
          if (options?.signal) {
            if (options.signal.aborted) {
              finalize(new Error(`Event "${String(event)}" aborted`));
              return;
            }
            options.signal.addEventListener("abort", onAbort, { once: true });
          }
        })
        .catch((err) => finalize(err));

      cancel = () => finalize(new Error(`Event "${String(event)}" cancelled`));
    });
    return { promise, cancel };
  }

  once<K extends string>(
    event: K,
    options?: {
      timeoutMs?: number;
      filter?: (payload: EventPayload<K>) => boolean;
      signal?: AbortSignal;
    }
  ): Promise<EventPayload<K>> {
    return this.createEventWaiter(event, options).promise;
  }

  async invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    if (!this.tauriReady) {
      console.warn(`[bridge] invoke "${cmd}" skipped: not running in Tauri`);
      return Promise.reject(new Error("Tauri runtime unavailable"));
    }
    return invoke<T>(cmd, args);
  }

  async getMediaDetails(
    path: string
  ): Promise<MediaDetails & { format: string, resolution: string }> {
    const details = await this.invoke<MediaDetails>("get_detailed_media_info", {
      path,
    });
    let format = details.extension;
    if (!details.extension) {
      format = details.format_names.split(",")[0];
    }

    let resolution = "";
    const vidStream = details.streams.find(
      (s) => s.codec_type === "video"
    );
    if (vidStream && vidStream.width && vidStream.height) {
      resolution = `${vidStream.width}*${vidStream.height}`;
    }
    const title = extractFilenameFromPath(path)

    return {
      ...details,
      format,
      resolution,
      title
    };
  }

  async checkHardwareAcceleration(): Promise<HardwareSupport> {
    return this.invoke<HardwareSupport>("check_hardware_acceleration");
  }

  async generateMediaThumbnail(
    path: string,
    options?: ThumbnailOptions,
    requestOptions?: { timeoutMs?: number; signal?: AbortSignal }
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

    const payload = await promise;
    if (payload.error) {
      throw new Error(payload.error);
    }
    return payload.result ?? null;
  }

  async getMediaThumbnailSrc(
    path: string,
    options?: ThumbnailOptions,
    requestOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<string | null> {
    const result = await this.generateMediaThumbnail(path, options, requestOptions);
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
    keyword?: string
  ): Promise<TaskHistoryItem[]> {
    return this.invoke<TaskHistoryItem[]>("get_task_history", {
      limit,
      offset,
      taskType,
      keyword,
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
    mediaType?: FileType
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
    mediaType?: FileType
  ): Promise<{ list: MyFileItem[]; hasMore: boolean }> {
    const pageSize = Math.max(1, limit);
    const rows = await this.getMyFiles(
      pageSize + 1,
      offset,
      keyword,
      sortBy,
      sortOrder,
      mediaType
    );
    return {
      list: rows.slice(0, pageSize),
      hasMore: rows.length > pageSize,
    };
  }

  async setMyFileFavorite(id: string, favorite: boolean): Promise<void> {
    return this.invoke("set_my_file_favorite", { id, favorite });
  }

  clear() {
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
        supportedExtensions: extensions
      });
      if (!finalPaths.length) return [];
      return finalPaths
    } catch (err) {
      console.error("Error selecting files:", err);
      return [];
    }
  }

  async addFilesOrFolders(opts: { name: string, multiple: boolean, extensions: string[], directory?: boolean }) {
    const { name = "", multiple = false, extensions = [], directory = false } = opts;
    const selected = await open({
      multiple,
      filters: [
        {
          name,
          extensions,
        },
      ],
      directory
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
  is_favorite: boolean;
}

export const bridge = Bridge.getInstance();
