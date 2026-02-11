import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  MediaDetails,
} from "@/types/tasks";
import { extractFilenameFromPath } from "./utils";
import { MediaTaskType } from "@/types/tasks";
import { supportedExtensions, SupportedFormats } from "@/data/formats";
import { handleDirectoryToFiles } from "./file";

export type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};

export type MediaTaskEvent = {
  task_id: string;
  task_type: "convert" | "compress";
  media_type: "video" | "audio" | "image" | "gif";
  event_type: "progress" | "complete" | "error";
  progress?: number;
  output_path?: string;
  output_size?: number;
  error_message?: string;
};

export type BridgeEvents = {
  "ffmpeg-progress": string;
  "ffmpeg-complete": string;
  "ffmpeg-download-progress": DownloadProgress;
  "video-frame": { width: number; height: number; data: number[] | Uint8Array };
  "video-complete": string;
  "video-error": string;
  "media-task-event": MediaTaskEvent;
};

type KnownEvent = keyof BridgeEvents;
type EventPayload<K extends string> = K extends KnownEvent
  ? BridgeEvents[K]
  : unknown;

/** 与 Rust AudioEncodingParams 对应 */
export interface AudioEncodingParams {
  codec?: string;
  bitrate?: number;
  sample_rate?: number;
  channels?: number;
  bit_depth?: number;
  quality?: number;
}

/** 与 Rust AudioTrackConfig 对应 */
export interface AudioTrackConfig {
  source_stream_index?: number;
  /** flatten: 与 AudioEncodingParams 字段一致 */
  codec?: string;
  bitrate?: number;
  sample_rate?: number;
  channels?: number;
  bit_depth?: number;
  quality?: number;
  /** 扩展待同步到rust */

}

/** 与 Rust TextWatermark 对应 */
export interface TextWatermark {
  content: string;
  font_path: string;
  font_size: number;
  color: string;
  opacity: number;
  x: string;
  y: string;
}

/** 与 Rust ImageWatermark 对应 */
export interface ImageWatermark {
  path: string;
  scale: number;
  opacity: number;
  x: string;
  y: string;
}

/** 与 Rust WatermarkConfig 对应 */
export interface WatermarkConfig {
  text?: TextWatermark;
  image?: ImageWatermark;
}

/** 与 Rust VideoConversionArgs 对应，用于 convert_video_file */
export interface ConvertVideoTaskArgs {
  task_id: string;
  input_path: string;
  output_path?: string;
  format?: string;
  video_encoder?: string;
  video_bitrate?: number;
  min_bitrate?: number;
  max_bitrate?: number;
  rc_mode?: string;
  crf?: number;
  resolution?: string;
  aspect_ratio?: string;
  scaling_mode?: string;
  frame_rate?: string;
  gop_size?: number;
  preset?: string;
  profile?: string;
  tune?: string;
  color_space?: string;
  bit_depth?: number;
  crop?: string;
  audio_encoder?: string;
  audio_bitrate?: number;
  audio_sample_rate?: number;
  audio_channels?: number;
  audio_bit_depth?: number;
  audio_quality?: number;
  audio_tracks?: AudioTrackConfig[];
  default_audio_params?: AudioEncodingParams;
  use_hardware_acceleration?: boolean;
  use_ultra_fast_speed?: boolean;
  watermark?: WatermarkConfig;
}

export interface ConvertAudioTaskArgs {
  task_id: string;
  input_path: string;
  format: string;
  audio_encoder: string;
}

export interface ConvertGifTaskArgs {
  task_id: string;
  input_path: string;
  format: string;
}

export interface ConvertImageTaskArgs {
  task_id: string;
  input_path: string;
  format: string;
  width?: number;
  height?: number;
  quality?: number;
  /** 扩展待同步到rust */
  image_encoder?: string;
  resolution?: string;
}

export interface CompressVideoTaskArgs {

  task_id: string;
  input_path: string;
  format: string;
  video_encoder: string;
  resolution: string;
  video_bitrate: number;
  frame_rate: number;
}

export interface CompressAudioTaskArgs {
  task_id: string;
  input_path: string;
  format: string;
  audio_encoder: string;
}

interface CompressImageTaskArgs {
  task_id: string;
  input_path: string;
  format: string;
  width: number;
  height: number;
  quality: number;
}

export interface ConvertAudioTaskArgs {
  task_id: string;
  input_path: string;
  format: string;
  audio_encoder: string;
}

type ConvertTaskRequest = {
  kind: MediaTaskType;
  args: ConvertVideoTaskArgs | ConvertAudioTaskArgs | ConvertImageTaskArgs;
}


type CompressVideoTaskRequest = { kind: MediaTaskType.CompressVideo; args: CompressVideoTaskArgs };
type CompressAudioTaskRequest = { kind: MediaTaskType.CompressAudio; args: CompressAudioTaskArgs };
type CompressImageTaskRequest = { kind: MediaTaskType.CompressImage; args: CompressImageTaskArgs };

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
    limit: number = 50,
    offset: number = 0,
    keyword?: string
  ): Promise<MyFileItem[]> {
    return this.invoke<MyFileItem[]>("get_my_files", {
      limit,
      offset,
      keyword,
    });
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

  async addFilesOrFolders(opts: { name: string, multiple: boolean, extensions: string[], folder?: boolean }) {
    const { name = "", multiple = false, extensions = [], folder = false } = opts;
    const selected = await open({
      multiple,
      filters: [
        {
          name,
          extensions,
        },
      ],
    });
    if (!selected) return [];
    const paths = Array.isArray(selected) ? selected : [selected];
    if (folder) {
      return this.getDirectoryToFiles(paths, extensions);
    }
    return paths;
  }
}

export interface TaskHistoryItem {
  id: string;
  task_type: string;
  media_type: string;
  status: "finished" | "error";
  input_path: string;
  output_path?: string;
  output_size?: number;
  duration?: number;
  title?: string;
  thumbnail?: string;
  created_at: number;
  finished_at: number;
  error_message?: string;
  task_data: string;
}

export interface MyFileItem extends TaskHistoryItem {
  is_favorite: boolean;
}

export const bridge = Bridge.getInstance();


type TaskPriority = "high" | "normal" | "low";

class MediaTaskQueue {
  private static instance: MediaTaskQueue | null = null;

  private pendingTaskIds = new Set<string>();
  private eventUnlisten: UnlistenFn | null = null;
  private listeners: ((event: MediaTaskEvent) => void)[] = [];

  private constructor() { }

  static getInstance(): MediaTaskQueue {
    if (MediaTaskQueue.instance === null) {
      MediaTaskQueue.instance = new MediaTaskQueue();
    }
    return MediaTaskQueue.instance;
  }

  async ensureEventListener(): Promise<void> {
    if (this.eventUnlisten !== null) return;
    this.eventUnlisten = await listen<MediaTaskEvent>(
      "media-task-event",
      (e) => this.handleMediaTaskEvent(e.payload)
    );
  }

  /**
   * 
   * @param tasks 
   * @param priority 
   */
  async addConvertTasks(
    tasks: ConvertTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    tasks.forEach(task => {
      if (task.args && task.args.task_id) {
        this.pendingTaskIds.add(task.args.task_id);
      }
    });

    this.ensureEventListener();
    console.log("Adding convert tasks", tasks);
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addCompressVideoTasks(
    tasks: CompressVideoTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    tasks.forEach(task => {
      if (task.args && task.args.task_id) {
        this.pendingTaskIds.add(task.args.task_id);
      }
    });
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addCompressAudioTasks(
    tasks: CompressAudioTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    tasks.forEach(task => {
      if (task.args && task.args.task_id) {
        this.pendingTaskIds.add(task.args.task_id);
      }
    });
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addCompressImageTasks(
    tasks: CompressImageTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    tasks.forEach(task => {
      if (task.args && task.args.task_id) {
        this.pendingTaskIds.add(task.args.task_id);
      }
    });
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async hasRunningTasksByType(taskType?: MediaTaskType): Promise<boolean> {
    if (taskType) {
      return bridge.invoke<boolean>("media_task_has_running_by_type", { taskType });
    }
    return bridge.invoke<boolean>("media_task_has_running_by_type");
  }

  async clearQueueByType(taskType?: MediaTaskType): Promise<void> {
    if (taskType) {
      await bridge.invoke("media_task_clear_by_type", { taskType });
      return;
    }
    await bridge.invoke("media_task_clear_by_type");
  }

  on(listener: (event: MediaTaskEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getQueueLength(): number {
    return 0;
  }

  getActiveCount(): number {
    return 0;
  }

  private tryStopListener(): void {
    if (this.pendingTaskIds.size === 0 && this.eventUnlisten) {
      this.eventUnlisten();
      this.eventUnlisten = null;
    }
  }

  private handleMediaTaskEvent(payload: MediaTaskEvent): void {
    if (!this.pendingTaskIds.has(payload.task_id)) return;

    // Notify all listeners
    this.listeners.forEach(listener => listener(payload));

    // Internal cleanup logic
    if (payload.event_type === "complete" || payload.event_type === "error") {
      this.pendingTaskIds.delete(payload.task_id);

      // If no more pending tasks, we can potentially stop listening to the bridge event?
      // But we might want to keep listening if new tasks are added?
      // The original code tried to stop listener if pendingTaskIds is empty.
      this.tryStopListener();
    }
  }
}

export function getMediaTaskQueue(): MediaTaskQueue {
  return MediaTaskQueue.getInstance();
}
