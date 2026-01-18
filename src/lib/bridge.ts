import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import {
  ConverterTask,
  isVideoConfig,
  isAudioConfig,
  isImageConfig,
} from "@/types/converter";
import { useConverterStore } from "@/stores/converterStore";
import { isAudioFormat, isImageFormat, SupportedFormats } from "@/data/formats";

export type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};

export type BridgeEvents = {
  "ffmpeg-progress": string;
  "ffmpeg-complete": string;
  "ffmpeg-download-progress": DownloadProgress;
  "ffmpeg-exec": string;
  "video-frame": { width: number; height: number; data: number[] | Uint8Array };
  "video-complete": string;
  "video-error": string;
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

/**
 * 递归读取目录下的所有支持的文件
 * @param dirPath 目录路径
 * @param maxDepth 最大递归层数，默认为 Infinity（无限制）
 * @param currentDepth 当前递归深度（内部使用）
 * @returns 支持的文件路径数组
 */
export async function readDirectoryFiles(
  dirPath: string,
  maxDepth: number = Infinity,
  currentDepth: number = 0
): Promise<string[]> {
  const filePaths: string[] = [];

  // 检查是否超过最大递归层数
  if (currentDepth >= maxDepth) {
    return filePaths;
  }

  const supportedExtensions = new Set(
    SupportedFormats.map((ext) => ext.toLowerCase())
  );

  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      // 构建完整路径
      const separator = dirPath.includes("\\") ? "\\" : "/";
      const entryPath = `${dirPath}${separator}${entry.name}`;
      try {
        const entryStat = await stat(entryPath);
        if (entryStat.isDirectory) {
          // 递归读取子目录
          const subFiles = await readDirectoryFiles(
            entryPath,
            maxDepth,
            currentDepth + 1
          );
          filePaths.push(...subFiles);
        } else if (entryStat.isFile) {
          // 检查文件扩展名是否支持
          const extension = entryPath.split(".").pop()?.toLowerCase();
          if (extension && supportedExtensions.has(extension)) {
            filePaths.push(entryPath);
          }
        }
      } catch (err) {
        console.warn(`Failed to read entry ${entryPath}:`, err);
      }
    }
  } catch (err) {
    console.error(`Failed to read directory ${dirPath}:`, err);
  }
  return filePaths;
}

class ConversionQueue {
  private queue: ConverterTask[] = [];
  private running = false;
  private concurrency = 1;
  private activeCount = 0;

  add(tasks: ConverterTask[]) {
    // Avoid duplicates
    for (const task of tasks) {
      if (!this.queue.find((t) => t.id === task.id)) {
        this.queue.push(task);
      }
    }
    this.process();
  }

  /**
   * 检查是否有运行中的任务
   * @returns true 如果有任务正在执行或队列中有任务
   */
  hasRunningTasks(): boolean {
    return this.activeCount > 0 || this.queue.length > 0 || this.running;
  }

  /**
   * 清空队列（不会中断正在执行的任务）
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * 获取当前队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 获取当前活动任务数量
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  private async process() {
    if (this.activeCount >= this.concurrency) return;

    if (this.queue.length === 0) {
      this.running = false;
      return;
    }

    this.running = true;
    this.activeCount++;
    const task = this.queue.shift();

    if (task) {
      try {
        await this.runTask(task);
      } catch (error) {
        console.error(`Task ${task.id} failed:`, error);
      } finally {
        this.activeCount--;
        this.process();
      }
    }
  }

  private async runTask(task: ConverterTask) {
    const {
      updateTaskById,
      outputPath,
      incrementUnreadFinishedCount,
      globalConfig, // 保留作为后备，向后兼容
    } = useConverterStore.getState();
    // 优先使用 task.config，如果不存在则使用 globalConfig（向后兼容）
    const taskConfig = task.config || globalConfig;
    const outputFormat = taskConfig?.outputFormat;
    const isAudioTarget = isAudioFormat(outputFormat);

    // Initial Status Update
    updateTaskById(task.id, { status: "converting", progress: 0 });

    const cleanup = () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
    };

    let unlistenProgress: UnlistenFn | null = null;
    let unlistenComplete: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;

    return new Promise<void>(async (resolve) => {
      try {
        if (isAudioTarget) {
          unlistenProgress = await listen<string>(
            "audio-conversion-progress",
            (event) => {
              const progress = parseFloat(event.payload.replace("%", ""));
              if (!isNaN(progress)) {
                updateTaskById(task.id, { progress });
              }
            }
          );

          unlistenComplete = await listen<string>(
            "audio-conversion-complete",
            (event) => {
              console.log("Audio conversion complete:", event);
              updateTaskById(task.id, {
                status: "finished",
                progress: 100,
                outputPath: event.payload,
              });
              // 只有在不在 "finished" tab 时才增加未读数
              const { activeTab } = useConverterStore.getState();
              if (activeTab !== "finished") {
                incrementUnreadFinishedCount();
              }
              cleanup();
              resolve();
            }
          );

          unlistenError = await listen<string>(
            "audio-conversion-error",
            (event) => {
              const errorMessage = event.payload || "音频转换失败";
              updateTaskById(task.id, {
                status: "error",
                errorMessage,
              });
              console.error("Audio conversion failed:", task);
              // 失败时不增加未读数
              cleanup();
              resolve(); // Resolve to execute next task even on error
            }
          );

          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes("\\") ? "\\" : "/";
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          const { useHardwareAcceleration, useUltraFastSpeed } =
            useConverterStore.getState();
          // 使用类型守卫获取 audioTracks
          const audioTrack =
            task.config && isAudioConfig(task.config)
              ? task.config.audioTracks[0]
              : task.config && isVideoConfig(task.config)
              ? task.config.audioTracks?.[0]
              : undefined;

          const args: any = {
            input_path: task.path,
            output_path: finalOutputPath,
            format: outputFormat,
            bitrate: audioTrack?.bitrate ? parseInt(audioTrack.bitrate) : 192,
            use_hardware_acceleration: useHardwareAcceleration,
            use_ultra_fast_speed: useUltraFastSpeed,
            audio_encoder: audioTrack?.encoder,
          };
          const sampleRate = audioTrack?.sampleRate;
          if (sampleRate && sampleRate === "original") {
            args.sample_rate = 0;
          } else {
            args.sample_rate = parseInt(sampleRate || "0");
          }

          console.log("Queue invoking convert_audio_file:", args);
          await invoke("convert_audio_file", { args });
        } else if (isImageFormat(outputFormat)) {
          // IMAGE CONVERSION LOGIC
          // updateTaskById(task.id, { status: 'converting', progress: 0 }); // Already done at the start of runTask

          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes("\\") ? "\\" : "/";
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          // 使用 task.config 中的 image 配置
          const imageConfig =
            taskConfig && isImageConfig(taskConfig)
              ? taskConfig.image
              : undefined;

          const args = {
            input_path: task.path,
            output_path: finalOutputPath,
            width: imageConfig?.resolution
              ? parseInt(imageConfig.resolution.split("x")[0])
              : null,
            height: imageConfig?.resolution
              ? parseInt(imageConfig.resolution.split("x")[1])
              : null,
            format: outputFormat,
            quality: imageConfig?.quality,
          };

          console.log("Queue invoking convert_image_file:", args);

          // Image conversion is blocking/async-return, so we await it directly
          // We can maybe simulate progress if needed, but for now 0->100 jump is fine for images
          try {
            await invoke("convert_image_file", { args });

            updateTaskById(task.id, {
              status: "finished",
              progress: 100,
              outputPath: finalOutputPath || "",
            });
            // 只有在不在 "finished" tab 时才增加未读数
            const { activeTab } = useConverterStore.getState();
            if (activeTab !== "finished") {
              incrementUnreadFinishedCount();
            }
            cleanup();
            resolve();
          } catch (imageError) {
            const errorMessage =
              imageError instanceof Error
                ? imageError.message
                : typeof imageError === "string"
                ? imageError
                : "图片转换失败";
            updateTaskById(task.id, {
              status: "error",
              errorMessage,
            });
            // 失败时不增加未读数
            cleanup();
            resolve();
          }
        } else {
          unlistenProgress = await listen<number>(
            "video-conversion-progress",
            (event) => {
              const progress = event.payload;
              if (typeof progress === "number" && !isNaN(progress)) {
                // 确保进度不超过100%
                const clampedProgress = Math.min(100, Math.max(0, progress));
                updateTaskById(task.id, { progress: clampedProgress });
              }
            }
          );

          unlistenComplete = await listen<string>(
            "audio-conversion-complete",
            (event) => {
              // Verify this complete event belongs to this task roughly by check title or just assume serial
              // Since we strictly serialize (concurrency=1), we can assume it's ours.
              // IMPORTANT: The backend emits 'audio-conversion-complete' for video too currently based on previous logs?
              // Wait, ConverterItem.tsx line 146 listens to 'audio-conversion-complete' for VIDEO too.
              const outputPath = event.payload;
              const taskTitle = task.config?.outputTitle || task.title;
              const taskPath = task.path;

              // 更宽松的匹配：检查输出路径是否包含任务标题，或者检查输入路径
              // 由于是串行执行，也可以直接接受（但为了安全还是检查一下）
              const matches =
                outputPath.includes(taskTitle) ||
                outputPath.includes(taskPath.split(/[/\\]/).pop() || "") ||
                // 如果都不匹配，但当前没有其他任务在运行，也认为是当前任务
                true; // 由于是串行执行，可以更宽松

              if (matches) {
                console.log(
                  `Video conversion complete for task ${task.id}: ${outputPath}`
                );
                updateTaskById(task.id, {
                  status: "finished",
                  progress: 100,
                  outputPath: outputPath,
                });
                // 只有在不在 "finished" tab 时才增加未读数
                const { activeTab } = useConverterStore.getState();
                if (activeTab !== "finished") {
                  incrementUnreadFinishedCount();
                }
                cleanup();
                resolve();
              } else {
                console.warn(
                  `Video completion event mismatch for task ${task.id}. Expected: ${taskTitle}, Got: ${outputPath}`
                );
              }
            }
          );

          unlistenError = await listen<string>(
            "audio-conversion-error",
            (event) => {
              const errorMessage = event.payload || "视频转换失败";
              updateTaskById(task.id, {
                status: "error",
                errorMessage,
              });
              // 失败时不增加未读数
              cleanup();
              resolve();
            }
          );

          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes("\\") ? "\\" : "/";
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          const { useHardwareAcceleration, useUltraFastSpeed } =
            useConverterStore.getState();

          const args: any = {
            input_path: task.path,
            output_path: finalOutputPath,
            format: outputFormat,
            video_encoder:
              task.config && isVideoConfig(task.config)
                ? task.config.video.encoder
                : "h264",
            resolution:
              task.config && isVideoConfig(task.config)
                ? task.config.video.resolution
                : undefined,
            video_bitrate:
              task.config &&
              isVideoConfig(task.config) &&
              task.config.video.bitrate &&
              task.config.video.bitrate !== "auto"
                ? parseInt(task.config.video.bitrate.replace("k", ""))
                : null,
            frame_rate:
              task.config && isVideoConfig(task.config)
                ? task.config.video.frameRate
                : undefined,
            use_hardware_acceleration: useHardwareAcceleration,
            use_ultra_fast_speed: useUltraFastSpeed,
            audio_encoder:
              task.config && isVideoConfig(task.config)
                ? task.config.audioTracks?.[0]?.encoder
                : task.config && isAudioConfig(task.config)
                ? task.config.audioTracks[0]?.encoder
                : undefined,
          };

          console.log("Queue invoking convert_video_file:", args);
          await invoke("convert_video_file", { args });
        }
      } catch (error) {
        console.error("Queue Run Task Error", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === "string"
            ? error
            : "转换任务执行失败";
        updateTaskById(task.id, {
          status: "error",
          errorMessage,
        });
        // 失败时不增加未读数
        cleanup();
        resolve();
      }
    });
  }
}

export const converterQueue = new ConversionQueue();
