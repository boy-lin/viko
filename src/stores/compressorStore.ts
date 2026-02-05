import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ConverterTask,
  CompressionConfig,
  VideoCompressionConfig,
  AudioCompressionConfig,
  ImageCompressionConfig,
  FileType,
} from "../types/converter";
import { converterDB } from "../db/converterDB";
import { extractFilenameFromPath } from "@/lib/utils";
import {
  isAudioFormat,
  isVideoFormat,
  SupportedFormats,
  isImageFormat
} from "@/data/formats";
import { IMAGE_ENCODERS } from "@/data/encoders";
import { bridge } from "@/lib/bridge";

export const defaultVideoCompressionConfig: VideoCompressionConfig = {
  type: "video",
  compressionRatio: 50, // 默认压缩到50%
};

export const defaultAudioCompressionConfig: AudioCompressionConfig = {
  type: "audio",
  compressionRatio: 50,
};

export const defaultImageCompressionConfig: ImageCompressionConfig = {
  type: "image",
  quality: 80,
};

interface CompressorState {
  compressingTasks: ConverterTask[];
  finishedTasks: ConverterTask[];
  isLoading: boolean;
  activeTab: "idle" | "finished";
  unreadFinishedCount: number;
  compressionScope: "general" | "video" | "audio" | "image";
  videoConfig: VideoCompressionConfig;
  audioConfig: AudioCompressionConfig;
  imageConfig: ImageCompressionConfig;
  setActiveTab: (tab: "idle" | "finished") => void;
  setCompressionScope: (
    scope: "general" | "video" | "audio" | "image"
  ) => void;
  incrementUnreadFinishedCount: () => void;
  resetUnreadFinishedCount: () => void;
  init: () => Promise<void>;
  addFiles: () => Promise<void>;
  addFilesFromPaths: (
    paths: string[],
    onFileProcessed?: (
      path: string,
      status: "success" | "error",
      message?: string
    ) => void
  ) => Promise<void>;
  removeTask: (id: string) => void;
  removeFinishedTask: (id: string) => void;
  clearCompressingTasks: () => Promise<void>;
  updateUnfinishedTaskConfig: (
    id: string,
    config: Partial<CompressionConfig>
  ) => void;
  updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
  updateGlobalConfig: (config: Partial<CompressionConfig>) => Promise<void>;
}

export const useCompressorStore = create<CompressorState>((set, get) => ({
  compressingTasks: [],
  finishedTasks: [],
  isLoading: true,
  activeTab: "idle",
  unreadFinishedCount: 0,
  compressionScope: "general",
  videoConfig: defaultVideoCompressionConfig,
  audioConfig: defaultAudioCompressionConfig,
  imageConfig: defaultImageCompressionConfig,
  init: async () => {
    try {
      // 从数据库加载压缩任务（使用相同的数据库，但通过 taskType 区分）
      const allTasks = await converterDB.getAllTasks();
      const compressingTasks: ConverterTask[] = [];
      const finishedTasks: ConverterTask[] = [];

      // 使用 filter 而不是 forEach，因为 forEach 中的 async 不会等待
      allTasks.forEach((task) => {
        // 只处理压缩任务
        if (task.taskType !== "compress") return;

        if (task.status === "finished") {
          finishedTasks.push(task);
        } else {
          compressingTasks.push(task);
        }
      });

      const legacyConfig = await converterDB.getSetting("compressionConfig");
      const storedVideoConfig =
        (await converterDB.getSetting("compressionConfigVideo")) || null;
      const storedAudioConfig =
        (await converterDB.getSetting("compressionConfigAudio")) || null;
      const storedImageConfig =
        (await converterDB.getSetting("compressionConfigImage")) || null;
      const storedScope =
        (await converterDB.getSetting("compressionScope")) || "general";

      const videoConfig =
        storedVideoConfig ||
        (legacyConfig && legacyConfig.type === "video"
          ? legacyConfig
          : defaultVideoCompressionConfig);
      const audioConfig =
        storedAudioConfig ||
        (legacyConfig && legacyConfig.type === "audio"
          ? legacyConfig
          : defaultAudioCompressionConfig);
      const imageConfig =
        storedImageConfig ||
        (legacyConfig && legacyConfig.type === "image"
          ? legacyConfig
          : defaultImageCompressionConfig);

      set({
        compressingTasks,
        finishedTasks,
        compressionScope: storedScope,
        videoConfig,
        audioConfig,
        imageConfig,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load compression tasks from DB:", error);
      set({ isLoading: false });
    }
  },
  addFiles: async (extensions?: string[]) => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: extensions || SupportedFormats,
          },
        ],
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      if (!paths.length) return;

      await get().addFilesFromPaths(paths);
    } catch (err) {
      console.error("Error selecting files:", err);
    }
  },
  addFilesFromPaths: async (paths, onFileProcessed) => {
    try {
      const newTasks: ConverterTask[] = [];

      for (const path of paths) {
        if (!path) continue;
        try {
          const details = await bridge.getMediaDetails(path);

          // Logic to determine primary stream info for display
          let displayResolution = "";
          const vidStream = details.streams.find(
            (s) => s.codec_type === "video"
          );
          if (vidStream && vidStream.width && vidStream.height) {
            displayResolution = `${vidStream.width}*${vidStream.height}`;
          }

          const fileSizeMB = details.size / (1024 * 1024);
          const displaySize =
            fileSizeMB < 1
              ? `${(details.size / 1024).toFixed(0)} KB`
              : `${fileSizeMB.toFixed(1)} MB`;
          const displayFormat = details.format.toUpperCase();

          // 根据媒体类型确定压缩配置
          const hasVideo = details.streams.some(
            (s) => s.codec_type === "video"
          );
          const hasAudio = details.streams.some(
            (s) => s.codec_type === "audio"
          );
          const hasImage = details.streams.some(
            (s) =>
              s.codec_type === "image" ||
              IMAGE_ENCODERS.some((f) => f.value === s.codec_name)
          );
          console.log("compressionConfig", details);

          let fileType: FileType = "video";
          let compressionConfig: CompressionConfig;

          if (isVideoFormat(details.extension) && hasVideo) {
            compressionConfig = get().videoConfig;
            fileType = "video";
          } else if (isAudioFormat(details.extension) && hasAudio) {
            compressionConfig = get().audioConfig;
            fileType = "audio";
          } else if (isImageFormat(details.extension) && hasImage) {
            compressionConfig = get().imageConfig;
            fileType = "image";
          } else {
            console.log(
              "Unsupported media type",
              details.extension,
              hasVideo,
              hasAudio,
              hasImage
            );
            throw new Error("Unsupported media type");
          }
          newTasks.push({
            ...details,
            fileType,
            id: crypto.randomUUID(),
            status: "idle",
            progress: 0,
            title: extractFilenameFromPath(path) || "Unknown",
            displayFormat,
            displayResolution,
            displaySize,
            taskType: "compress",
            compressionConfig,
          });
          onFileProcessed?.(path, "success");
        } catch (e: any) {
          console.error(`Failed to get info for ${path}:`, e);
          const message = e?.message || "Failed to read media info";
          onFileProcessed?.(path, "error", message);
        }
      }

      if (newTasks.length > 0) {
        await converterDB.addTasks(newTasks);
        set((state) => ({
          compressingTasks: [...state.compressingTasks, ...newTasks],
        }));
      }
    } catch (err) {
      console.error("Error adding files:", err);
    }
  },
  removeTask: async (id) => {
    try {
      await converterDB.removeTask(id);
      set((state) => ({
        compressingTasks: state.compressingTasks.filter((t) => t.id !== id),
      }));
    } catch (error) {
      console.error(`Failed to remove task ${id}:`, error);
    }
  },
  removeFinishedTask: async (id) => {
    try {
      await converterDB.removeTask(id);
      set((state) => ({
        finishedTasks: state.finishedTasks.filter((t) => t.id !== id),
      }));
    } catch (error) {
      console.error(`Failed to remove finished task ${id}:`, error);
    }
  },
  clearCompressingTasks: async () => {
    try {
      const { compressingTasks } = get();
      // 从数据库删除所有压缩中的任务
      for (const task of compressingTasks) {
        await converterDB.removeTask(task.id);
      }

      // 从状态中删除
      set({
        compressingTasks: [],
      });
    } catch (error) {
      console.error("Failed to clear compressing tasks:", error);
    }
  },
  updateUnfinishedTaskConfig: async (id, config) => {
    const { compressingTasks } = get();
    const task = compressingTasks.find((t) => t.id === id);
    if (task) {
      const getConfigByType = (type: FileType) => {
        if (type === "video") return get().videoConfig;
        if (type === "audio") return get().audioConfig;
        return get().imageConfig;
      };
      const taskConfig =
        task.compressionConfig || getConfigByType(task.fileType);
      const updatedTask = {
        ...task,
        compressionConfig: { ...taskConfig, ...config },
      } as ConverterTask;
      if (compressingTasks.find((t) => t.id === id)) {
        set({
          compressingTasks: compressingTasks.map((t) =>
            t.id === id ? updatedTask : t
          ),
        });
      }
      await converterDB.addTask(updatedTask); // Update DB
    }
  },
  updateTaskById: async (id, updates) => {
    try {
      const { compressingTasks, finishedTasks } = get();
      const task =
        compressingTasks.find((t) => t.id === id) ||
        finishedTasks.find((t) => t.id === id);
      if (task) {
        const updatedTask = { ...task, ...updates };
        const isFinished = updatedTask.status === "finished";

        // 只更新 converting_tasks 表
        await converterDB.addTask(updatedTask);

        // 更新状态：根据 status 决定在哪个列表中
        const currentState = get();
        if (isFinished) {
          // 如果状态是 finished，从 compressingTasks 移除，添加到 finishedTasks
          set({
            compressingTasks: currentState.compressingTasks.filter(
              (t) => t.id !== id
            ),
            finishedTasks: [
              updatedTask,
              ...currentState.finishedTasks.filter((t) => t.id !== id),
            ],
          });
        } else {
          // 如果状态不是 finished，从 finishedTasks 移除，添加到 compressingTasks
          set({
            compressingTasks: [
              updatedTask,
              ...currentState.compressingTasks.filter((t) => t.id !== id),
            ],
            finishedTasks: currentState.finishedTasks.filter(
              (t) => t.id !== id
            ),
          });
        }
      }
    } catch (error) {
      console.error(
        `Failed to update task ${id} with updates:`,
        updates,
        error
      );
    }
  },
  updateGlobalConfig: async (config: Partial<CompressionConfig>) => {
    const scope = config.type || get().compressionScope;
    if (scope === "video") {
      const next = {
        ...get().videoConfig,
        ...config,
        type: "video",
      } as VideoCompressionConfig;
      set({ videoConfig: next });
      await converterDB.saveSetting("compressionConfigVideo", next);
    } else if (scope === "audio") {
      const next = {
        ...get().audioConfig,
        ...config,
        type: "audio",
      } as AudioCompressionConfig;
      set({ audioConfig: next });
      await converterDB.saveSetting("compressionConfigAudio", next);
    } else if (scope === "image") {
      const next = {
        ...get().imageConfig,
        ...config,
        type: "image",
      } as ImageCompressionConfig;
      set({ imageConfig: next });
      await converterDB.saveSetting("compressionConfigImage", next);
    }
  },
  setCompressionScope: (scope) => {
    set({ compressionScope: scope });
    converterDB.saveSetting("compressionScope", scope);
  },
  setActiveTab: (tab) => set({ activeTab: tab }),
  incrementUnreadFinishedCount: () =>
    set((state) => ({ unreadFinishedCount: state.unreadFinishedCount + 1 })),
  resetUnreadFinishedCount: () => set({ unreadFinishedCount: 0 }),
}));
