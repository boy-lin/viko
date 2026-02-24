import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { MediaTaskType } from "@/types/tasks";
import { analytics } from "@/lib/analytics";
import { MediaTaskEvent } from "./mediaTaskEvent";
import { FileType } from "@/types/tasks";
import { ConvertVideoTaskArgs, ConvertAudioTaskArgs, ConvertImageTaskArgs, ConvertGifTaskArgs, CompressVideoTaskArgs, CompressAudioTaskArgs, CompressImageTaskArgs } from "./mediaTaskEvent";

type TaskPriority = "high" | "normal" | "low";

type ConvertTaskRequest = {
  type: MediaTaskType;
  args: ConvertVideoTaskArgs | ConvertAudioTaskArgs | ConvertImageTaskArgs | ConvertGifTaskArgs;
};

type CompressTaskRequest = {
  type: MediaTaskType;
  args: CompressVideoTaskArgs | CompressAudioTaskArgs | CompressImageTaskArgs;
};

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
      "media_task_event",
      (e) => this.handleMediaTaskEvent(e.payload)
    );
  }

  async addConvertTasks(
    tasks: ConvertTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    tasks.forEach(task => {
      if (!task.args.output_path) {
        throw new Error("Task output_path is required");
      }
      if (task.args.input_path == task.args.output_path) {
        throw new Error("Task input_path and output_path must be different");
      }
      if (!task.args.task_id) {
        throw new Error("Task ID is required");
      }
      this.pendingTaskIds.add(task.args.task_id);
    });

    this.ensureEventListener();
    this.trackTaskSubmit("tasks_submit_convert", tasks);
    console.log("Adding convert tasks", tasks);
    await invoke("media_task_submit", { tasks, priority });
  }

  async addCompressTasks(
    tasks: CompressTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    tasks.forEach(task => {
      if (!task.args.output_path) {
        throw new Error("Task output_path is required");
      }
      if (task.args.input_path == task.args.output_path) {
        throw new Error("Task input_path and output_path must be different");
      }
      if (!task.args.task_id) {
        throw new Error("Task ID is required");
      }
      this.pendingTaskIds.add(task.args.task_id);
    });
    this.ensureEventListener();
    this.trackTaskSubmit("tasks_submit_compress", tasks);
    console.log("Adding compress tasks", tasks);
    await invoke("media_task_submit", { tasks, priority });
  }

  async hasRunningTasksByType(taskType?: MediaTaskType): Promise<boolean> {
    if (taskType) {
      return invoke<boolean>("media_task_has_running_by_type", { taskType });
    }
    return invoke<boolean>("media_task_has_running_by_type");
  }

  async clearQueueByType(
    stopRunning: boolean = false,
    taskType?: MediaTaskType,
  ): Promise<void> {
    const args: Record<string, unknown> = { stopRunning };
    if (taskType) args.taskType = taskType;
    await invoke("media_task_clear_by_type_with_stop", args);
  }

  async cancelTaskById(id: string): Promise<void> {
    await invoke("media_task_cancel_task", { id });
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

    this.listeners.forEach(listener => listener(payload));

    this.dispatchStoreUpdates(payload);

    if (payload.event_type === "complete" || payload.event_type === "error") {
      this.pendingTaskIds.delete(payload.task_id);
      this.tryStopListener();
    }
  }

  private dispatchStoreUpdates(payload: MediaTaskEvent): void {
    void this.updateStoresFromEvent(payload);
  }

  private async updateStoresFromEvent(payload: MediaTaskEvent): Promise<void> {
    const { file_type, task_type, event_type, task_id, progress, error_message } = payload;
    const normalizedProgress = Math.min(100, Math.max(0, progress || 0));

    // if (['error', 'complete'].includes(event_type)) {
    console.log("Task event: " + event_type, payload);
    // }

    if ([MediaTaskType.ConvertVideo, MediaTaskType.ConvertAudio, MediaTaskType.ConvertImage, MediaTaskType.ConvertGif].includes(task_type)) {
      if (file_type === FileType.Video) {
        const { useConverterStore } = await import("@/pages/converter/videos/store");
        const store = useConverterStore.getState();
        const taskExists = store.convertingTasks.some(t => t.id === task_id);
        if (!taskExists && event_type !== "complete") return;

        if (event_type === "progress") {
          store.updateTaskById(task_id, {
            status: "processing",
            progress: normalizedProgress,
          });
        } else if (event_type === "complete") {
          store.updateTaskById(task_id, {
            status: "finished",
            progress: 100,
          });
          const { useAppStore } = await import("@/stores/app");
          useAppStore.getState().incrementUnreadFinishedCount();
        } else if (event_type === "error") {
          store.updateTaskById(task_id, {
            status: error_message === "Task cancelled" ? "cancelled" : "error",
            errorMessage: error_message,
          });
        }
        return;
      } else if (file_type === FileType.Image || file_type === FileType.Gif) {
        const { useConverterStore } = await import("@/pages/converter/images/store");
        const store = useConverterStore.getState();
        const taskExists = store.convertingTasks.some(t => t.id === task_id);
        if (!taskExists && event_type !== "complete") return;

        if (event_type === "progress") {
          store.updateTaskById(task_id, {
            status: "processing",
            progress: normalizedProgress,
          });
        } else if (event_type === "complete") {
          store.removeTask(task_id);
          const { useAppStore } = await import("@/stores/app");
          useAppStore.getState().incrementUnreadFinishedCount();
        } else if (event_type === "error") {
          store.updateTaskById(task_id, {
            status: error_message === "Task cancelled" ? "cancelled" : "error",
            errorMessage: error_message,
          });
        }
        return;
      } else if (file_type === FileType.Audio) {
        const { useConverterStore } = await import("@/pages/converter/audios/store");
        const store = useConverterStore.getState();
        const taskExists = store.convertingTasks.some(t => t.id === task_id);
        if (!taskExists && event_type !== "complete") return;

        if (event_type === "progress") {
          store.updateTaskById(task_id, {
            status: "processing",
            progress: normalizedProgress,
          });
        } else if (event_type === "complete") {
          store.removeTask(task_id);
          const { useAppStore } = await import("@/stores/app");
          useAppStore.getState().incrementUnreadFinishedCount();
        } else if (event_type === "error") {
          store.updateTaskById(task_id, {
            status: error_message === "Task cancelled" ? "cancelled" : "error",
            errorMessage: error_message,
          });
        }
        return;
      }
    } else if ([MediaTaskType.CompressVideo, MediaTaskType.CompressImage, MediaTaskType.CompressAudio].includes(task_type)) {
      if (file_type === FileType.Video) {
        const { useCompressorStore } = await import("@/pages/compressor/videos/store");
        const store = useCompressorStore.getState();
        const taskExists = store.compressingTasks.some(t => t.id === task_id);
        if (!taskExists && event_type !== "complete") return;

        if (event_type === "progress") {
          store.updateTaskById(task_id, {
            status: "processing",
            progress: normalizedProgress,
          });
        } else if (event_type === "complete") {
          store.removeTask(task_id);
          const { useAppStore } = await import("@/stores/app");
          useAppStore.getState().incrementUnreadFinishedCount();
        } else if (event_type === "error") {
          store.updateTaskById(task_id, {
            status: error_message === "Task cancelled" ? "cancelled" : "error",
            errorMessage: error_message,
          });
        }
        return;
      } else if (file_type === FileType.Image) {
        const { useCompressorStore } = await import("@/pages/compressor/images/store");
        const store = useCompressorStore.getState();
        const taskExists = store.compressingTasks.some(t => t.id === task_id);
        if (!taskExists && event_type !== "complete") return;

        if (event_type === "progress") {
          store.updateTaskById(task_id, {
            status: "processing",
            progress: normalizedProgress,
          });
        } else if (event_type === "complete") {
          store.removeTask(task_id);
          const { useAppStore } = await import("@/stores/app");
          useAppStore.getState().incrementUnreadFinishedCount();
        } else if (event_type === "error") {
          store.updateTaskById(task_id, {
            status: error_message === "Task cancelled" ? "cancelled" : "error",
            errorMessage: error_message,
          });
        }
        return;
      } else if (file_type === FileType.Audio) {
        const { useCompressorStore } = await import("@/pages/compressor/audios/store");
        const store = useCompressorStore.getState();
        const taskExists = store.compressingTasks.some(t => t.id === task_id);
        if (!taskExists && event_type !== "complete") return;

        if (event_type === "progress") {
          store.updateTaskById(task_id, {
            status: "processing",
            progress: normalizedProgress,
          });
        } else if (event_type === "complete") {
          store.removeTask(task_id);
          const { useAppStore } = await import("@/stores/app");
          useAppStore.getState().incrementUnreadFinishedCount();
        } else if (event_type === "error") {
          store.updateTaskById(task_id, {
            status: error_message === "Task cancelled" ? "cancelled" : "error",
            errorMessage: error_message,
          });
        }
        return;
      }
    } else if (task_type === MediaTaskType.Watermark) {
      const { useWatermarkStore } = await import("@/pages/watermark/store");
      const store = useWatermarkStore.getState();
      const taskExists = store.queueTasks.some(t => t.id === task_id);
      if (!taskExists && event_type !== "complete") return;

      if (event_type === "progress") {
        store.updateTaskById(task_id, {
          status: "processing",
          progress: normalizedProgress,
        });
      } else if (event_type === "complete") {
        store.updateTaskById(task_id, {
          status: "finished",
          progress: 100,
        });
        const { useAppStore } = await import("@/stores/app");
        useAppStore.getState().incrementUnreadFinishedCount();
      } else if (event_type === "error") {
        store.updateTaskById(task_id, {
          status: error_message === "Task cancelled" ? "cancelled" : "error",
          errorMessage: error_message,
        });
      }
      return;
    }
  }

  private trackTaskSubmit(
    eventName: "tasks_submit_convert" | "tasks_submit_compress",
    tasks: Array<{ type: MediaTaskType; args: unknown }>
  ): void {
    analytics.track(eventName, {
      task_meta: tasks.map((task) => {
        const args = (task.args || {}) as Record<string, unknown>;
        return {
          type: task.type,
          format: typeof args.format === "string" ? args.format : undefined,
          has_watermark: Boolean(args.watermark),
        };
      }),
    });
  }
}

export function getMediaTaskQueue(): MediaTaskQueue {
  return MediaTaskQueue.getInstance();
}
