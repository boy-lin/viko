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
} from "@/types/tasks";
import { useConverterStore } from "@/stores/converterStore";
import { useCompressorStore } from "@/stores/compressorStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { isAudioFormat, isImageFormat, SupportedFormats } from "@/data/formats";
import { converterDB } from "@/db/converterDB";
import { extractFilenameFromPath } from "./utils";

export type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};


export enum MediaTaskType {
  ConvertVideo = "convert-video",
  ConvertAudio = "convert-audio",
  ConvertGif = "convert-gif",
  ConvertImage = "convert-image",
  CompressVideo = "compress-video",
  CompressAudio = "compress-audio",
  CompressImage = "compress-image",
  Metadata = "metadata",
  Watermark = "watermark",
}

export type MediaTaskEvent = {
  task_id: string;
  task_type: MediaTaskType;
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

type VideoTaskRequest = { kind: MediaTaskType.ConvertVideo; args: ConvertVideoTaskArgs };
type AudioTaskRequest = { kind: MediaTaskType.ConvertAudio; args: ConvertAudioTaskArgs };
type GifTaskRequest = { kind: MediaTaskType.ConvertGif; args: ConvertGifTaskArgs };
type ImageTaskRequest = { kind: MediaTaskType.ConvertImage; args: ConvertImageTaskArgs };
type CompressVideoTaskRequest = { kind: MediaTaskType.CompressVideo; args: CompressVideoTaskArgs };
type CompressAudioTaskRequest = { kind: MediaTaskType.CompressAudio; args: CompressAudioTaskArgs };
type CompressImageTaskRequest = { kind: MediaTaskType.CompressImage; args: CompressImageTaskArgs };

type MediaTaskRequest = VideoTaskRequest | AudioTaskRequest | GifTaskRequest | ImageTaskRequest | CompressVideoTaskRequest | CompressAudioTaskRequest | CompressImageTaskRequest;

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

  clear() {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }
}

export const bridge = Bridge.getInstance();

export async function readDirectoryFiles(
  dirPath: string,
  maxDepth: number = Infinity,
  currentDepth: number = 0
): Promise<string[]> {
  const filePaths: string[] = [];

  if (currentDepth >= maxDepth) {
    return filePaths;
  }

  const supportedExtensions = new Set(
    SupportedFormats.map((ext) => ext.toLowerCase())
  );

  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      const separator = dirPath.includes("\\") ? "\\" : "/";
      const entryPath = `${dirPath}${separator}${entry.name}`;
      try {
        const entryStat = await stat(entryPath);
        if (entryStat.isDirectory) {
          const subFiles = await readDirectoryFiles(
            entryPath,
            maxDepth,
            currentDepth + 1
          );
          filePaths.push(...subFiles);
        } else if (entryStat.isFile) {
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

function clampProgress(progress: number | undefined): number {
  if (progress === undefined) return 0;
  return Math.min(100, Math.max(0, progress));
}

class MediaTaskQueue {
  private static instance: MediaTaskQueue | null = null;

  private pendingTaskIds = new Set<string>();
  private eventUnlisten: UnlistenFn | null = null;

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
  async addConvertVideoTasks(
    tasks: VideoTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addConvertAudioTasks(
    tasks: AudioTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addConvertGifTasks(
    tasks: GifTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addConvertImageTasks(
    tasks: ImageTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addCompressVideoTasks(
    tasks: CompressVideoTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addCompressAudioTasks(
    tasks: CompressAudioTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async addCompressImageTasks(
    tasks: CompressImageTaskRequest[],
    priority: TaskPriority = "normal"
  ): Promise<void> {
    this.ensureEventListener();
    await bridge.invoke("media_task_submit", { tasks, priority });
  }

  async hasRunningTasks(): Promise<boolean> {
    return bridge.invoke<boolean>("media_task_has_running");
  }

  async clearQueue(): Promise<void> {
    await bridge.invoke("media_task_clear");
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
    const taskType = payload.task_type as TaskType;
    console.log("handleMediaTaskEvent", payload);

    if (payload.event_type === "progress") {
      if (taskType === "convert") {
        useConverterStore
          .getState()
          .updateTaskById(payload.task_id, {
            progress: clampProgress(payload.progress),
          });
      } else if (taskType === "compress") {
        useCompressorStore
          .getState()
          .updateTaskById(payload.task_id, {
            progress: clampProgress(payload.progress),
          });
      }
      return;
    }

    if (payload.event_type === "complete" && payload.output_path) {
      if (taskType === "convert") {
        const store = useConverterStore.getState();
        const task = store.convertingTasks.find((t) => t.id === payload.task_id);
        if (task) {
          store.updateTaskById(payload.task_id, {
            status: "finished",
            progress: 100,
            outputPath: payload.output_path,
            outputSize: payload.output_size,
          });
          if (store.activeTab !== "finished") store.incrementUnreadFinishedCount();
          const updatedTask: ConverterTask = {
            ...task,
            status: "finished",
            progress: 100,
            outputPath: payload.output_path,
            outputSize: payload.output_size,
          };
          converterDB
            .addToMyFiles({ ...updatedTask, taskType: "convert" })
            .catch((err) => console.error("Failed to save to my-files:", err));
        }
      } else if (taskType === "compress") {
        const store = useCompressorStore.getState();
        const task = store.compressingTasks.find((t) => t.id === payload.task_id);
        if (task) {
          store.updateTaskById(payload.task_id, {
            status: "finished",
            progress: 100,
            outputPath: payload.output_path,
            outputSize: payload.output_size,
          });
          if (store.activeTab !== "finished") store.incrementUnreadFinishedCount();
          const updatedTask: ConverterTask = {
            ...task,
            status: "finished",
            progress: 100,
            outputPath: payload.output_path,
            outputSize: payload.output_size,
          };
          converterDB
            .addToMyFiles({ ...updatedTask, taskType: "compress" })
            .catch((err) => console.error("Failed to save to my-files:", err));
        }
      }
      this.pendingTaskIds.delete(payload.task_id);
      this.tryStopListener();
      return;
    }

    if (payload.event_type === "error") {
      const errorMessage =
        payload.error_message ||
        (taskType === "convert" ? "转换失败" : "压缩失败");
      if (taskType === "convert") {
        useConverterStore
          .getState()
          .updateTaskById(payload.task_id, {
            status: "error",
            errorMessage,
          });
      } else if (taskType === "compress") {
        useCompressorStore
          .getState()
          .updateTaskById(payload.task_id, {
            status: "error",
            errorMessage,
          });
      }
      this.pendingTaskIds.delete(payload.task_id);
      this.tryStopListener();
    }
  }

  private async prepareCompressionTask(
    task: ConverterTask
  ): Promise<MediaTaskRequest | null> {
    const { updateTaskById, videoConfig, audioConfig, imageConfig } =
      useCompressorStore.getState();
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
        errorMessage: "unsupported media type for compression",
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
    const { updateTaskById, globalConfig } = useConverterStore.getState();
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
    // Initial Status Update
    updateTaskById(task.id, { status: "converting", progress: 0 });

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
      return { kind: MediaTaskType.ConvertImage, args };
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

    return { kind: MediaTaskType.ConvertVideo, args };
  }
}

export function getMediaTaskQueue(): MediaTaskQueue {
  return MediaTaskQueue.getInstance();
}
