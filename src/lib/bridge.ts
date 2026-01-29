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

type MediaTaskRequest =
  | { kind: "convert-audio"; args: Record<string, unknown> }
  | { kind: "convert-video"; args: Record<string, unknown> }
  | { kind: "convert-gif"; args: Record<string, unknown> }
  | { kind: "convert-image"; args: Record<string, unknown> }
  | { kind: "compress-video"; args: Record<string, unknown> }
  | { kind: "compress-audio"; args: Record<string, unknown> }
  | { kind: "compress-image"; args: Record<string, unknown> };

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
 * 閫掑綊璇诲彇鐩綍涓嬬殑鎵€鏈夋敮鎸佺殑鏂囦欢
 * @param dirPath 鐩綍璺緞
 * @param maxDepth 鏈€澶ч€掑綊灞傛暟锛岄粯璁や负 Infinity锛堟棤闄愬埗锛?
 * @param currentDepth 褰撳墠閫掑綊娣卞害锛堝唴閮ㄤ娇鐢級
 * @returns 鏀寔鐨勬枃浠惰矾寰勬暟缁?
 */
export async function readDirectoryFiles(
  dirPath: string,
  maxDepth: number = Infinity,
  currentDepth: number = 0
): Promise<string[]> {
  const filePaths: string[] = [];

  // 妫€鏌ユ槸鍚﹁秴杩囨渶澶ч€掑綊灞傛暟
  if (currentDepth >= maxDepth) {
    return filePaths;
  }

  const supportedExtensions = new Set(
    SupportedFormats.map((ext) => ext.toLowerCase())
  );

  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      // 鏋勫缓瀹屾暣璺緞
      const separator = dirPath.includes("\\") ? "\\" : "/";
      const entryPath = `${dirPath}${separator}${entry.name}`;
      try {
        const entryStat = await stat(entryPath);
        if (entryStat.isDirectory) {
          // 閫掑綊璇诲彇瀛愮洰褰?
          const subFiles = await readDirectoryFiles(
            entryPath,
            maxDepth,
            currentDepth + 1
          );
          filePaths.push(...subFiles);
        } else if (entryStat.isFile) {
          // 妫€鏌ユ枃浠舵墿灞曞悕鏄惁鏀寔
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

class MediaTaskQueue {
  private listeners = new Map<string, UnlistenFn>();
  private taskType: "convert" | "compress";

  constructor(taskType: "convert" | "compress" = "convert") {
    this.taskType = taskType;
  }

  async add(tasks: ConverterTask[], priority: TaskPriority = "normal") {
    const requests: MediaTaskRequest[] = [];
    for (const task of tasks) {
      if (this.listeners.has(task.id)) {
        continue;
      }
      const request =
        this.taskType === "compress"
          ? await this.prepareCompressionTask(task)
          : await this.prepareConversionTask(task);
      if (request) {
        requests.push(request);
      }
    }
    if (requests.length === 0) return;
    console.log("add", requests, priority);

    await bridge.invoke("media_task_submit", { tasks: requests, priority });
  }

  /**
   * 妫€鏌ユ槸鍚︽湁杩愯涓殑浠诲姟
   * @returns true 濡傛灉鏈変换鍔℃鍦ㄦ墽琛屾垨闃熷垪涓湁浠诲姟
   */
  async hasRunningTasks(): Promise<boolean> {
    return bridge.invoke<boolean>("media_task_has_running");
  }

  /**
   * 娓呯┖闃熷垪锛堜笉浼氫腑鏂鍦ㄦ墽琛岀殑浠诲姟锛?
   */
  async clearQueue(): Promise<void> {
    await bridge.invoke("media_task_clear");
  }

  /**
   * 鑾峰彇褰撳墠闃熷垪闀垮害
   */
  getQueueLength(): number {
    return 0;
  }

  /**
   * 鑾峰彇褰撳墠娲诲姩浠诲姟鏁伴噺
   */
  getActiveCount(): number {
    return 0;
  }

  private async prepareCompressionTask(
    task: ConverterTask
  ): Promise<MediaTaskRequest | null> {
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

    // 妫€娴嬪獟浣撶被鍨?
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
        errorMessage: "涓嶆敮鎸佺殑濯掍綋绫诲瀷",
      });
      return null;
    }

    let finalOutputPath: string | null = null;
    if (outputPath) {
      const separator = outputPath.includes("\\") ? "\\" : "/";
      const stem = task.title;
      const extension = task.extension || "mp4";
      finalOutputPath = `${outputPath}${separator}${stem}_compressed.${extension}`;
      updateTaskById(task.id, { outputPath: finalOutputPath });
    }
    if (!finalOutputPath) {
      const separator = task.path.includes("\\") ? "\\" : "/";
      const lastSep = task.path.lastIndexOf(separator);
      const dir = lastSep >= 0 ? task.path.slice(0, lastSep) : "";
      const name = lastSep >= 0 ? task.path.slice(lastSep + 1) : task.path;
      const dot = name.lastIndexOf(".");
      const stem = dot >= 0 ? name.slice(0, dot) : name;
      const ext =
        task.extension || (dot >= 0 ? name.slice(dot + 1) : "mp4");
      finalOutputPath = dir
        ? `${dir}${separator}${stem}_compressed.${ext}`
        : `${stem}_compressed.${ext}`;
      updateTaskById(task.id, { outputPath: finalOutputPath });
    }

    // 缁熶竴鐨勪簨浠剁洃鍚櫒
    let unlistenEvent: UnlistenFn | null = null;

    const cleanup = () => {
      if (unlistenEvent) {
        unlistenEvent();
        this.listeners.delete(task.id);
      }
    };

    if (!this.listeners.has(task.id)) {
      unlistenEvent = await listen<MediaTaskEvent>(
        "media-task-event",
        (event) => {
          const eventData = event.payload;
          console.log("media-task-event", eventData);
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
          } else if (eventData.event_type === "error") {
            const errorMessage =
              eventData.error_message || `${mediaType}鍘嬬缉澶辫触`;
            updateTaskById(task.id, {
              status: "error",
              errorMessage,
            });
            cleanup();
          }
        }
      );
      if (unlistenEvent) {
        this.listeners.set(task.id, unlistenEvent);
      }
    }

    if (mediaType === "video" && isVideoCompressionConfig(compressionConfig)) {
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
      return { kind: "compress-video", args };
    }
    if (mediaType === "audio" && isAudioCompressionConfig(compressionConfig)) {
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
      return { kind: "compress-audio", args };
    }
    if (mediaType === "image" && isImageCompressionConfig(compressionConfig)) {
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
      return { kind: "compress-image", args };
    }
    return null;
  }

  private async prepareConversionTask(
    task: ConverterTask
  ): Promise<MediaTaskRequest | null> {
    const { updateTaskById, incrementUnreadFinishedCount, globalConfig } =
      useConverterStore.getState();
    const { outputPath } = useSettingsStore.getState();
    // 浼樺厛浣跨敤 task.config锛屽鏋滀笉瀛樺湪鍒欎娇鐢?globalConfig锛堝悗绔吋瀹癸級
    const taskConfig = task.config || globalConfig;
    const outputFormat = taskConfig?.outputFormat;
    const isAudioTarget = isAudioFormat(outputFormat);
    const isGifFormat = outputFormat?.toLowerCase() === "gif";
    // 妫€娴嬭緭鍏ユ槸鍚︿负瑙嗛锛堟湁瑙嗛娴侊級
    const hasVideoStream =
      task.streams?.some((s) => s.codec_type === "video") ?? false;
    // GIF 杞崲锛氳緭鍑烘牸寮忔槸 GIF 涓旇緭鍏ユ槸瑙嗛
    const isGifConversion = isGifFormat && hasVideoStream;

    // 纭畾濯掍綋绫诲瀷
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

    // 缁熶竴鐨勪簨浠剁洃鍚櫒
    let unlistenEvent: UnlistenFn | null = null;

    const cleanup = () => {
      if (unlistenEvent) {
        unlistenEvent();
        this.listeners.delete(task.id);
      }
    };

    if (!this.listeners.has(task.id)) {
      unlistenEvent = await listen<MediaTaskEvent>(
        "media-task-event",
        (event) => {
          const eventData = event.payload;
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
            const { activeTab } = useConverterStore.getState();
            if (activeTab !== "finished") {
              incrementUnreadFinishedCount();
            }
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
          } else if (eventData.event_type === "error") {
            const errorMessage =
              eventData.error_message || `${mediaType}杞崲澶辫触`;
            updateTaskById(task.id, {
              status: "error",
              errorMessage,
            });
            console.error(`${mediaType} conversion failed:`, task);
            cleanup();
          }
        }
      );
      if (unlistenEvent) {
        this.listeners.set(task.id, unlistenEvent);
      }
    }

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
        codec: audioTrack?.encoder,
        use_hardware_acceleration: useHardwareAcceleration,
        use_ultra_fast_speed: useUltraFastSpeed,
      };
      if (finalOutputPath) {
        args.output_path = finalOutputPath;
      }
      if (audioTrack?.bitrate && audioTrack.bitrate !== "auto") {
        args.bitrate = Number(audioTrack.bitrate.replace("k", ""));
      }
      const sampleRate = audioTrack?.sampleRate;
      if (sampleRate === "auto") {
        args.sample_rate = undefined;
      } else if (sampleRate) {
        args.sample_rate = parseInt(sampleRate);
      }
      return { kind: "convert-audio", args };
    }

    if (isGifConversion) {
      let finalOutputPath: string | null = null;
      if (outputPath) {
        const separator = outputPath.includes("\\") ? "\\" : "/";
        const stem = task.config?.outputTitle || task.title;
        finalOutputPath = `${outputPath}${separator}${stem}.gif`;
        updateTaskById(task.id, { outputPath: finalOutputPath });
      }

      const imageConfig =
        taskConfig && isImageConfig(taskConfig) ? taskConfig.image : undefined;

      let width: number | null = null;
      let height: number | null = null;
      if (imageConfig?.resolution && imageConfig.resolution !== "auto") {
        const [w, h] = imageConfig.resolution.split("x").map(Number);
        if (!isNaN(w)) width = w;
        if (!isNaN(h)) height = h;
      }

      const args: any = {
        task_id: task.id,
        input_path: task.path,
        format: "gif",
      };
      if (finalOutputPath) {
        args.output_path = finalOutputPath;
      }
      if (width !== null && width !== undefined) {
        args.width = width;
      }
      if (height !== null && height !== undefined) {
        args.height = height;
      }
      return { kind: "convert-gif", args };
    }

    if (isImageFormat(outputFormat)) {
      let finalOutputPath: string | null = null;
      if (outputPath) {
        const separator = outputPath.includes("\\") ? "\\" : "/";
        const stem = task.config?.outputTitle || task.title;
        finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
        updateTaskById(task.id, { outputPath: finalOutputPath });
      }

      const imageConfig =
        taskConfig && isImageConfig(taskConfig) ? taskConfig.image : undefined;

      const args: any = {
        task_id: task.id,
        input_path: task.path,
        width: imageConfig?.resolution
          ? parseInt(imageConfig.resolution.split("x")[0])
          : null,
        height: imageConfig?.resolution
          ? parseInt(imageConfig.resolution.split("x")[1])
          : null,
        format: outputFormat,
        quality: imageConfig?.quality,
      };
      if (finalOutputPath) {
        args.output_path = finalOutputPath;
      }
      return { kind: "convert-image", args };
    }

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
    if (finalOutputPath) {
      args.output_path = finalOutputPath;
    }

    return { kind: "convert-video", args };
  }
}

export const converterQueue = new MediaTaskQueue("convert");
export const compressorQueue = new MediaTaskQueue("compress");

