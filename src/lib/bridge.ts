import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import {
  ConverterTask,
  isVideoConfig,
  isAudioConfig,
  isImageConfig,
  isVideoCompressionConfig,
  isAudioCompressionConfig,
  isImageCompressionConfig,
  MediaDetails,
} from "@/types/converter";
import { useConverterStore } from "@/stores/converterStore";
import { useCompressorStore } from "@/stores/compressorStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { isAudioFormat, isImageFormat, SupportedFormats } from "@/data/formats";
import { converterDB } from "@/db/converterDB";

export type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};

export type MediaTaskEvent = {
  task_id: string;
  task_type: "convert" | "compress";
  media_type: "video" | "audio" | "image";
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
  "ffmpeg-exec": string;
  "video-frame": { width: number; height: number; data: number[] | Uint8Array };
  "video-complete": string;
  "video-error": string;
  "media-task-event": MediaTaskEvent;
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

  async getMediaDetails(
    path: string
  ): Promise<MediaDetails & { format: string }> {
    const details = await this.invoke<MediaDetails>("get_detailed_media_info", {
      path,
    });
    let format = details.extension;
    if (!details.extension) {
      format = details.format_names.split(",")[0];
    }

    return {
      ...details,
      ...details,
      format,
    };
  }

  async getDeviceId(): Promise<string> {
    return this.invoke<string>("get_device_id");
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

type TaskPriority = "high" | "normal" | "low";

interface QueuedTask {
  task: ConverterTask;
  priority: TaskPriority;
}

class MediaTaskQueue {
  private queue: QueuedTask[] = [];
  private running = false;
  private concurrency = 1;
  private activeCount = 0;
  private taskType: "convert" | "compress";

  constructor(taskType: "convert" | "compress" = "convert") {
    this.taskType = taskType;
  }

  add(tasks: ConverterTask[], priority: TaskPriority = "normal") {
    console.log("add", tasks);
    // Avoid duplicates
    for (const task of tasks) {
      if (!this.queue.find((q) => q.task.id === task.id)) {
        this.queue.push({ task, priority });
      }
    }
    // 按优先级排序：high > normal > low
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
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
    const queuedTask = this.queue.shift();
    console.log("process", queuedTask);
    if (queuedTask) {
      try {
        await this.runTask(queuedTask.task);
      } catch (error) {
        console.error(`Task ${queuedTask.task.id} failed:`, error);
      } finally {
        this.activeCount--;
        this.process();
      }
    }
  }

  private async runTask(task: ConverterTask) {
    // 根据任务类型选择对应的 store
    const taskType = task.taskType || this.taskType;

    if (taskType === "compress") {
      await this.runCompressionTask(task);
    } else {
      await this.runConversionTask(task);
    }
  }

  private async runCompressionTask(task: ConverterTask) {
    const {
      updateTaskById,
      incrementUnreadFinishedCount,
      videoConfig,
      audioConfig,
      imageConfig,
    } = useCompressorStore.getState();
    const { outputPath } = useSettingsStore.getState();
    const compressionConfig =
      task.compressionConfig ||
      (task.fileType === "video"
        ? videoConfig
        : task.fileType === "audio"
          ? audioConfig
          : imageConfig);

    // Initial Status Update
    updateTaskById(task.id, { status: "converting", progress: 0 });

    // 检测媒体类型
    const hasVideoStream =
      task.streams?.some((s) => s.codec_type === "video") ?? false;
    const hasAudioStream =
      task.streams?.some((s) => s.codec_type === "audio") ?? false;
    const hasImageStream =
      task.streams?.some((s) => s.codec_type === "image") ?? false;

    let mediaType: "video" | "audio" | "image" = "video";
    if (hasVideoStream && isVideoCompressionConfig(compressionConfig)) {
      mediaType = "video";
    } else if (hasAudioStream && isAudioCompressionConfig(compressionConfig)) {
      mediaType = "audio";
    } else if (
      (hasImageStream || hasVideoStream) &&
      isImageCompressionConfig(compressionConfig)
    ) {
      mediaType = "image";
    } else {
      console.error("Unsupported media type for compression", task);
      updateTaskById(task.id, {
        status: "error",
        errorMessage: "不支持的媒体类型",
      });
      return;
    }

    let finalOutputPath: string | null = null;
    if (outputPath) {
      const separator = outputPath.includes("\\") ? "\\" : "/";
      const stem = task.title;
      const extension = task.extension || "mp4";
      finalOutputPath = `${outputPath}${separator}${stem}_compressed.${extension}`;
      updateTaskById(task.id, { outputPath: finalOutputPath });
    }

    // 统一的事件监听器
    let unlistenEvent: UnlistenFn | null = null;

    const cleanup = () => {
      if (unlistenEvent) unlistenEvent();
    };

    return new Promise<void>(async (resolve) => {
      try {
        // 监听统一的事件
        unlistenEvent = await listen<MediaTaskEvent>(
          "media-task-event",
          (event) => {
            const eventData = event.payload;
            console.log("media-task-event", eventData);
            // 只处理当前任务的事件
            if (eventData.task_id !== task.id) return;

            if (
              eventData.event_type === "progress" &&
              eventData.progress !== undefined
            ) {
              const clampedProgress = Math.min(
                100,
                Math.max(0, eventData.progress)
              );
              updateTaskById(task.id, { progress: clampedProgress });
            } else if (
              eventData.event_type === "complete" &&
              eventData.output_path
            ) {
              updateTaskById(task.id, {
                status: "finished",
                progress: 100,
                outputPath: eventData.output_path,
                outputSize: eventData.output_size,
              });
              const { activeTab } = useCompressorStore.getState();
              if (activeTab !== "finished") {
                incrementUnreadFinishedCount();
              }
              // 异步写入 my-files 表
              const updatedTask: ConverterTask = {
                ...task,
                status: "finished",
                progress: 100,
                outputPath: eventData.output_path,
                outputSize: eventData.output_size,
              };
              converterDB
                .addToMyFiles({
                  ...updatedTask,
                  taskType: "compress",
                })
                .catch((err) => {
                  console.error("Failed to save to my-files:", err);
                });
              cleanup();
              resolve();
            } else if (eventData.event_type === "error") {
              const errorMessage =
                eventData.error_message || `${mediaType}压缩失败`;
              updateTaskById(task.id, {
                status: "error",
                errorMessage,
              });
              cleanup();
              resolve();
            }
          }
        );

        // 调用对应的压缩函数
        if (
          mediaType === "video" &&
          isVideoCompressionConfig(compressionConfig)
        ) {
          const args: any = {
            task_id: task.id,
            input_path: task.path,
            output_path: finalOutputPath,
            compression_ratio: compressionConfig.compressionRatio,
            width: compressionConfig.width,
            height: compressionConfig.height,
            bitrate: compressionConfig.bitrate,
            frame_rate: compressionConfig.frameRate,
            codec: compressionConfig.codec,
            keyframe_interval: compressionConfig.keyframeInterval,
            color_depth: compressionConfig.colorDepth,
            remove_audio: compressionConfig.removeAudio,
            audio_bitrate: compressionConfig.audioBitrate,
            preset: compressionConfig.preset,
            use_hardware_acceleration: compressionConfig.useHardwareAcceleration,
          };
          console.log("Queue invoking compress_video_file:", args);
          await invoke("compress_video_file", { args });
        } else if (
          mediaType === "audio" &&
          isAudioCompressionConfig(compressionConfig)
        ) {
          const args: any = {
            task_id: task.id,
            input_path: task.path,
            output_path: finalOutputPath,
            compression_ratio: compressionConfig.compressionRatio,
            sample_rate: compressionConfig.sampleRate,
            bitrate: compressionConfig.bitrate,
            codec: compressionConfig.codec,
            channels: compressionConfig.channels,
            bit_depth: compressionConfig.bitDepth,
            remove_silence: compressionConfig.removeSilence,
            silence_threshold: compressionConfig.silenceThreshold,
            volume_gain: compressionConfig.volumeGain,
          };
          console.log("Queue invoking compress_audio_file:", args);
          await invoke("compress_audio_file", { args });
        } else if (
          mediaType === "image" &&
          isImageCompressionConfig(compressionConfig)
        ) {
          const args: any = {
            task_id: task.id,
            input_path: task.path,
            output_path: finalOutputPath,
            quality: compressionConfig.quality,
            format: compressionConfig.format,
            width: compressionConfig.width,
            height: compressionConfig.height,
            color_mode: compressionConfig.colorMode,
            strip_metadata: compressionConfig.stripMetadata,
            keep_transparency: compressionConfig.keepTransparency,
            dpi: compressionConfig.dpi,
            crop_whitespace: compressionConfig.cropWhitespace,
          };
          console.log("Queue invoking compress_image_file:", args);
          await invoke("compress_image_file", { args });
        }
      } catch (error) {
        console.error("Compression task error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "压缩任务执行失败";
        updateTaskById(task.id, {
          status: "error",
          errorMessage,
        });
        cleanup();
        resolve();
      }
    });
  }

  private async runConversionTask(task: ConverterTask) {
    const { updateTaskById, incrementUnreadFinishedCount, globalConfig } =
      useConverterStore.getState();
    const { outputPath } = useSettingsStore.getState();
    // 优先使用 task.config，如果不存在则使用 globalConfig（向后兼容）
    const taskConfig = task.config || globalConfig;
    const outputFormat = taskConfig?.outputFormat;
    const isAudioTarget = isAudioFormat(outputFormat);
    const isGifFormat = outputFormat?.toLowerCase() === "gif";
    // 检测输入是否为视频（有视频流）
    const hasVideoStream =
      task.streams?.some((s) => s.codec_type === "video") ?? false;
    // GIF 转换：输出格式是 GIF 且输入是视频
    const isGifConversion = isGifFormat && hasVideoStream;

    // 确定媒体类型
    let mediaType: "video" | "audio" | "image" = "video";
    if (isAudioTarget) {
      mediaType = "audio";
    } else if (isImageFormat(outputFormat)) {
      mediaType = "image";
    } else {
      mediaType = "video";
    }

    // Initial Status Update
    updateTaskById(task.id, { status: "converting", progress: 0 });

    // 统一的事件监听器
    let unlistenEvent: UnlistenFn | null = null;

    const cleanup = () => {
      if (unlistenEvent) unlistenEvent();
    };

    return new Promise<void>(async (resolve) => {
      try {
        // 监听统一的事件
        unlistenEvent = await listen<MediaTaskEvent>(
          "media-task-event",
          (event) => {
            // console.log("media-task-event", event);
            const eventData = event.payload;
            // 只处理当前任务的事件
            if (eventData.task_id !== task.id) return;

            if (
              eventData.event_type === "progress" &&
              eventData.progress !== undefined
            ) {
              const clampedProgress = Math.min(
                100,
                Math.max(0, eventData.progress)
              );
              updateTaskById(task.id, { progress: clampedProgress });
            } else if (
              eventData.event_type === "complete" &&
              eventData.output_path
            ) {
              console.log(`${mediaType} conversion complete:`, eventData);
              updateTaskById(task.id, {
                status: "finished",
                progress: 100,
                outputPath: eventData.output_path,
                outputSize: eventData.output_size,
              });
              const { activeTab } = useConverterStore.getState();
              if (activeTab !== "finished") {
                incrementUnreadFinishedCount();
              }
              // 异步写入 my-files 表
              const updatedTask: ConverterTask = {
                ...task,
                status: "finished",
                progress: 100,
                outputPath: eventData.output_path,
                outputSize: eventData.output_size,
              };
              converterDB
                .addToMyFiles({
                  ...updatedTask,
                  taskType: task.taskType || "convert",
                })
                .catch((err) => {
                  console.error("Failed to save to my-files:", err);
                });
              cleanup();
              resolve();
            } else if (eventData.event_type === "error") {
              const errorMessage =
                eventData.error_message || `${mediaType}转换失败`;
              updateTaskById(task.id, {
                status: "error",
                errorMessage,
              });
              console.error(`${mediaType} conversion failed:`, task);
              cleanup();
              resolve();
            }
          }
        );

        if (isAudioTarget) {
          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes("\\") ? "\\" : "/";
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          const { useHardwareAcceleration, useUltraFastSpeed } =
            useSettingsStore.getState();
          // 使用类型守卫获取 audioTracks
          const audioTrack =
            task.config && isAudioConfig(task.config)
              ? task.config.audioTracks[0]
              : task.config && isVideoConfig(task.config)
                ? task.config.audioTracks?.[0]
                : undefined;

          const args: any = {
            task_id: task.id,
            input_path: task.path,
            format: outputFormat,
            output_path: finalOutputPath,
            codec: audioTrack?.encoder,
            use_hardware_acceleration: useHardwareAcceleration,
            use_ultra_fast_speed: useUltraFastSpeed,
          };
          if (audioTrack?.bitrate && audioTrack.bitrate !== "auto") {
            args.bitrate = Number(audioTrack.bitrate.replace("k", ""));
          }
          const sampleRate = audioTrack?.sampleRate;

          if (sampleRate === "auto") {
            args.sample_rate = undefined
          } else if (sampleRate) {
            args.sample_rate = parseInt(sampleRate);
          }

          console.log("Queue invoking convert_audio_file:", args);
          await invoke("convert_audio_file", { args });
        } else if (isGifConversion) {
          // GIF 转换逻辑（视频转 GIF）

          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes("\\") ? "\\" : "/";
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.gif`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          // 使用 task.config 中的配置
          const imageConfig =
            taskConfig && isImageConfig(taskConfig)
              ? taskConfig.image
              : undefined;

          // 解析分辨率
          let width: number | null = null;
          let height: number | null = null;
          if (
            imageConfig?.resolution &&
            imageConfig.resolution !== "auto"
          ) {
            const [w, h] = imageConfig.resolution.split("x").map(Number);
            if (!isNaN(w)) width = w;
            if (!isNaN(h)) height = h;
          }

          // 构建参数对象，只包含有值的字段（避免 undefined）
          const args: any = {
            task_id: task.id,
            input_path: task.path,
            output_path: finalOutputPath || null,
            format: "gif",
          };

          // 只在有值时才添加可选参数
          if (width !== null && width !== undefined) {
            args.width = width;
          }
          if (height !== null && height !== undefined) {
            args.height = height;
          }
          // frame_rate 使用默认值 10fps，不传入（后端会使用默认值）

          console.log("Queue invoking convert_gif_file:", args);
          await invoke("convert_gif_file", { args });
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
            task_id: task.id,
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
          await invoke("convert_image_file", { args });
        } else {
          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes("\\") ? "\\" : "/";
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          const { useHardwareAcceleration, useUltraFastSpeed } =
            useSettingsStore.getState();

          const args: any = {
            task_id: task.id,
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

export const converterQueue = new MediaTaskQueue("convert");
export const compressorQueue = new MediaTaskQueue("compress");
