import { bridge } from "@/lib/bridge";
import { getBridgeErrorMessage } from "@/lib/bridgeError";
import { resolveMediaTaskClientContext } from "@/lib/task-identity";
import { MediaTaskType } from "@/types/tasks";
import { analytics } from "@/lib/analytics";
import { MediaTaskEvent } from "./mediaTaskEvent";
import { FileType } from "@/types/tasks";
import { toast } from "sonner";
import {
  CompressAudioTaskArgs,
  CompressImageTaskArgs,
  CompressVideoTaskArgs,
  ConvertVideoTaskArgs,
  ConvertAudioTaskArgs,
  ConvertImageTaskArgs,
  DenoiseTaskArgs,
  WatermarkTaskArgs,
} from "./mediaTaskEvent";

type TaskPriority = "high" | "normal" | "low";
type TaskStoreRoute =
  | "converter"
  | "converter-videos"
  | "converter-images"
  | "converter-audios"
  | "compressor-videos"
  | "compressor-images"
  | "compressor-audios"
  | "denoise-media"
  | "watermark";

type TaskRequest = {
  type: MediaTaskType;
  args:
    | ConvertVideoTaskArgs
    | ConvertAudioTaskArgs
    | ConvertImageTaskArgs
    | CompressVideoTaskArgs
    | CompressAudioTaskArgs
    | CompressImageTaskArgs
    | DenoiseTaskArgs
    | WatermarkTaskArgs;
};

class MediaTaskQueue {
  private static instance: MediaTaskQueue | null = null;

  private pendingTaskIds = new Set<string>();
  private taskStoreRoutes = new Map<string, TaskStoreRoute>();
  private eventUnlisten: (() => void) | null = null;
  private listeners: ((event: MediaTaskEvent) => void)[] = [];

  private constructor() {}

  static getInstance(): MediaTaskQueue {
    if (MediaTaskQueue.instance === null) {
      MediaTaskQueue.instance = new MediaTaskQueue();
    }
    return MediaTaskQueue.instance;
  }

  async ensureEventListener(): Promise<void> {
    if (this.eventUnlisten !== null) return;
    this.eventUnlisten = await bridge.on("media_task_event", (payload) =>
      this.handleMediaTaskEvent(payload),
    );
  }

  async addTasks(
    tasks: TaskRequest[],
    priority: TaskPriority = "normal",
    route?: TaskStoreRoute,
  ): Promise<void> {
    tasks.forEach((task) => {
      if (!task.args.output_path) {
        throw new Error("Task output_path is required");
      }
      if (!task.args.task_id) {
        throw new Error("Task ID is required");
      }
      this.pendingTaskIds.add(task.args.task_id);
      if (route) {
        this.taskStoreRoutes.set(task.args.task_id, route);
      }
      console.log("Adding task args", task);
    });

    this.ensureEventListener();
    this.trackTaskSubmit("tasks_submit", tasks);
    try {
      const clientContext = await resolveMediaTaskClientContext();
      await bridge.submitMediaTasks(tasks, priority, clientContext);
      // DISABLED: forced_watermark detection 提示
      // if (result.forced_watermark_count > 0) {
      //   toast.warning(
      //     `未登录用户每日前 10 次可免平台水印，本次有 ${result.forced_watermark_count} 个任务已追加默认水印`,
      //   );
      // }
    } catch (error) {
      toast.error(getBridgeErrorMessage(error, "任务提交失败"));
      throw new Error(getBridgeErrorMessage(error, "任务提交失败"));
    }
  }

  async hasRunningTasksByType(taskType?: MediaTaskType): Promise<boolean> {
    if (taskType) {
      return bridge.hasRunningMediaTasksByType(taskType);
    }
    return bridge.hasRunningMediaTasksByType();
  }

  async clearQueueByType(
    stopRunning: boolean = false,
    taskType?: MediaTaskType,
  ): Promise<void> {
    try {
      await bridge.clearMediaTaskQueueByType(stopRunning, taskType);
    } catch (error) {
      throw new Error(getBridgeErrorMessage(error, "清空任务队列失败"));
    }
  }

  async cancelTaskById(id: string): Promise<void> {
    try {
      await bridge.cancelMediaTaskById(id);
    } catch (error) {
      throw new Error(getBridgeErrorMessage(error, "取消任务失败"));
    }
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

    this.listeners.forEach((listener) => listener(payload));
    this.trackTaskResult(payload);

    this.dispatchStoreUpdates(payload);

    if (payload.event_type === "complete" || payload.event_type === "error") {
      this.pendingTaskIds.delete(payload.task_id);
      this.taskStoreRoutes.delete(payload.task_id);
      this.tryStopListener();
    }
  }

  private dispatchStoreUpdates(payload: MediaTaskEvent): void {
    void this.updateStoresFromEvent(payload);
  }

  private async updateStoresFromEvent(payload: MediaTaskEvent): Promise<void> {
    const { task_type, event_type, task_id, progress, error_message } = payload;
    let file_type = payload.file_type;
    const normalizedProgress = Math.min(100, Math.max(0, progress || 0));
    const route = this.taskStoreRoutes.get(task_id);

    if (route === "converter-videos") {
      file_type = FileType.Video;
    } else if (route === "converter-images") {
      file_type = FileType.Image;
    } else if (route === "converter-audios") {
      file_type = FileType.Audio;
    } else if (route === "compressor-videos") {
      file_type = FileType.Video;
    } else if (route === "compressor-images") {
      file_type = FileType.Image;
    } else if (route === "compressor-audios") {
      file_type = FileType.Audio;
    } else if (route === "denoise-media") {
      file_type = payload.file_type;
    }

    if (event_type !== "progress") {
      console.log("Task event: " + event_type, payload);
    }

    if (
      route === "converter" &&
      [
        MediaTaskType.ConvertToVideo,
        MediaTaskType.ConvertToAudio,
        MediaTaskType.ConvertToImage,
        MediaTaskType.ConvertToAnimatedImage,
      ].includes(task_type)
    ) {
      const { useConverterStore } = await import("@/pages/converter/store");
      const store = useConverterStore.getState();
      const taskExists = store.taskIndexById[task_id] !== undefined;
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
          status: error_message === "Task cancelled" ? "idle" : "error",
          progress: error_message === "Task cancelled" ? 0 : normalizedProgress,
          errorMessage:
            error_message === "Task cancelled" ? undefined : error_message,
        });
      }
      return;
    }

    if (task_type === MediaTaskType.ConvertDenoise) {
      const { useDenoiseStore } = await import("@/pages/denoise/store");
      const store = useDenoiseStore.getState();
      const taskExists = store.taskIndexById[task_id] !== undefined;
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
          status: error_message === "Task cancelled" ? "idle" : "error",
          progress: error_message === "Task cancelled" ? 0 : normalizedProgress,
          errorMessage:
            error_message === "Task cancelled" ? undefined : error_message,
        });
      }
      return;
    }

    if (
      [
        MediaTaskType.CompressVideo,
        MediaTaskType.CompressImage,
        MediaTaskType.CompressAudio,
      ].includes(task_type)
    ) {
      if (file_type === FileType.Video) {
        const { useCompressorStore } = await import("@/pages/compressor/store");
        const store = useCompressorStore.getState();
        const taskExists = store.taskIndexById[task_id] !== undefined;
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
            status: error_message === "Task cancelled" ? "idle" : "error",
            progress:
              error_message === "Task cancelled" ? 0 : normalizedProgress,
            errorMessage:
              error_message === "Task cancelled" ? undefined : error_message,
          });
        }
        return;
      } else if (file_type === FileType.Image) {
        const { useCompressorStore } = await import("@/pages/compressor/store");
        const store = useCompressorStore.getState();
        const taskExists = store.taskIndexById[task_id] !== undefined;
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
            status: error_message === "Task cancelled" ? "idle" : "error",
            progress:
              error_message === "Task cancelled" ? 0 : normalizedProgress,
            errorMessage:
              error_message === "Task cancelled" ? undefined : error_message,
          });
        }
        return;
      } else if (file_type === FileType.Audio) {
        const { useCompressorStore } = await import("@/pages/compressor/store");
        const store = useCompressorStore.getState();
        const taskExists = store.taskIndexById[task_id] !== undefined;
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
            status: error_message === "Task cancelled" ? "idle" : "error",
            progress:
              error_message === "Task cancelled" ? 0 : normalizedProgress,
            errorMessage:
              error_message === "Task cancelled" ? undefined : error_message,
          });
        }
        return;
      }
    } else if (task_type === MediaTaskType.Watermark) {
      const { useWatermarkStore } = await import("@/pages/watermark/store");
      const store = useWatermarkStore.getState();
      const taskExists = store.queueTasks.some((t) => t.id === task_id);
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
          status: error_message === "Task cancelled" ? "idle" : "error",
          progress: error_message === "Task cancelled" ? 0 : normalizedProgress,
          errorMessage:
            error_message === "Task cancelled" ? undefined : error_message,
        });
      }
      return;
    }
  }

  private trackTaskSubmit(
    eventName: "tasks_submit",
    tasks: Array<{ type: MediaTaskType; args: unknown }>,
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

  private trackTaskResult(payload: MediaTaskEvent): void {
    if (payload.event_type !== "complete" && payload.event_type !== "error") {
      return;
    }

    analytics.track("task_feature_result", {
      task_id: payload.task_id,
      task_type: payload.task_type,
      file_type: payload.file_type,
      event_type: payload.event_type,
      success: payload.event_type === "complete",
      output_size: payload.output_size,
      error_message:
        payload.event_type === "error" ? payload.error_message : undefined,
    });
  }
}

export function getMediaTaskQueue(): MediaTaskQueue {
  return MediaTaskQueue.getInstance();
}
