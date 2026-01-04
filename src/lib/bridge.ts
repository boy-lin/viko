import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};

export type PlayerStateUpdate = {
  position: number; // 当前播放位置（秒）
  duration: number; // 总时长（秒）
  state: "playing" | "paused" | "stopped";
  volume: number; // 音量 0-1.5
  buffered?: number; // 缓冲进度（可选）
};

export type BridgeEvents = {
  "ffmpeg-progress": string;
  "ffmpeg-complete": string;
  "ffmpeg-download-progress": DownloadProgress;
  "ffmpeg-exec": string;
  "video-frame": { width: number; height: number; data: number[] | Uint8Array };
  "video-complete": string;
  "video-error": string;
  "player-state-update": PlayerStateUpdate;
};

type KnownEvent = keyof BridgeEvents;
type EventPayload<K extends string> = K extends KnownEvent
  ? BridgeEvents[K]
  : unknown;

class Bridge {
  private disposers: UnlistenFn[] = [];
  private fallbackTarget = new EventTarget();
  private tauriReady = true;

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

  clear() {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }
}

export const bridge = new Bridge();
