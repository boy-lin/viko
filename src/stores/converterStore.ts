import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ConverterTask,
  ConversionConfig,
  VideoConversionConfig,
  AudioConversionConfig,
  ImageConversionConfig,
  FileType,
} from "../types/converter";
import { converterDB } from "../db/converterDB";
import { extractFilenameFromPath } from "@/lib/utils";
import { isAudioFormat, isVideoFormat, SupportedFormats } from "@/data/formats";
import { FormatEnum } from "../types/options";
import { bridge } from "@/lib/bridge";
import {
  defaultAudioCompressionConfig,
  defaultImageCompressionConfig,
  defaultVideoCompressionConfig,
} from "./compressorStore";

export const defaultVideoConfig: VideoConversionConfig = {
  type: "video",
  outputFormat: FormatEnum.MP4,
  outputTitle: "",
  video: {
    encoder: "h264",
    resolution: "1920x1080",
    frameRate: "30",
    bitrate: "1000",
  },
  audioTracks: [
    {
      trackIndex: 0,
      encoder: "aac",
      channels: "original",
      sampleRate: "original",
      bitrate: "128",
    },
  ],
};

interface ConverterState {
  convertingTasks: ConverterTask[];
  finishedTasks: ConverterTask[];
  isLoading: boolean;
  activeTab: "converting" | "finished";
  unreadFinishedCount: number;
  globalConfig: ConversionConfig;
  formatFavorites: string[];
  formatRecents: string[];
  setActiveTab: (tab: "converting" | "finished") => void;
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
  clearConvertingTasks: () => Promise<void>;
  updateUnfinishedTaskConfig: (
    id: string,
    config: Partial<ConversionConfig>
  ) => void;
  updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
  updateGlobalConfig: (config: ConversionConfig) => Promise<void>;
  toggleFavorite: (formatId: string) => Promise<void>;
  addToRecents: (formatId: string) => Promise<void>;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  finishedTasks: [],
  isLoading: true,
  activeTab: "converting",
  unreadFinishedCount: 0,
  globalConfig: defaultVideoConfig,
  formatFavorites: [],
  formatRecents: [],
  init: async () => {
    try {
      const allTasks = await converterDB.getAllTasks();
      const convertingTasks: ConverterTask[] = [];
      const finishedTasks: ConverterTask[] = [];

      // 使用 filter 而不是 forEach，因为 forEach 中的 async 不会等待
      allTasks.forEach((task) => {
        // 只处理转换任务（taskType 为 undefined 或 "convert"）
        if (task.taskType && task.taskType !== "convert") return;

        if (task.status === "finished") {
          finishedTasks.push(task);
        } else {
          convertingTasks.push(task);
        }
      });
      const favs = await converterDB.getSetting("format_favorites");
      const recents = await converterDB.getSetting("format_recents");
      const globalConfig = await converterDB.getSetting("globalConfig");

      set({
        convertingTasks,
        finishedTasks,
        globalConfig: globalConfig || defaultVideoConfig,
        formatFavorites: favs || [],
        formatRecents: recents || [],
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load tasks from DB:", error);
      set({ isLoading: false });
    }
  },
  addFiles: async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: SupportedFormats,
          },
        ],
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      if (!paths.length) return;

      // 处理文件夹：如果是文件夹，读取文件夹下的所有支持文件（只递归一层）
      //   const finalPaths: string[] = await handleDirectoryToFiles({
      //     paths,
      //     depth: 1,
      //     filterCallback: (path) => {
      //       const extension = path.split(".").pop()?.toLowerCase();
      //       return !!(extension && supportedExtensions.has(extension));
      //     },
      //   });
      //   if (!finalPaths.length) return;
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
          console.log("details", details);
          // Logic to determine primary stream info for display

          // 根据媒体类型确定压缩配置
          const hasVideo = details.streams.some(
            (s) => s.codec_type === "video"
          );
          const hasAudio = details.streams.some(
            (s) => s.codec_type === "audio"
          );
          const hasImage = details.streams.some(
            (s) => s.codec_type === "image" || s.codec_name === "png"
          );
          let fileType: FileType = "video";

          if (isVideoFormat(details.format) && hasVideo) {
            fileType = "video";
          } else if (isAudioFormat(details.format) && hasAudio) {
            fileType = "audio";
          } else if (hasImage) {
            fileType = "image";
          } else {
            throw new Error("Unsupported media type");
          }

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
          });
          onFileProcessed?.(path, "success");
        } catch (e: any) {
          console.error(`Failed to get info for ${path}:`, e);
          const message = e?.message || "Failed to read media info";
          onFileProcessed?.(path, "error", message);
        }
      }

      if (newTasks.length > 0) {
        // Initialize default config for new tasks
        newTasks.forEach((task) => {
          let outputFormat = FormatEnum.MP4;

          if (task.streams.some((s) => s.codec_type === "video")) {
            outputFormat =
              task.displayFormat === FormatEnum.MP4.toUpperCase()
                ? FormatEnum.MOV
                : FormatEnum.MP4;
          } else if (task.streams.some((s) => s.codec_type === "audio")) {
            outputFormat =
              task.displayFormat === FormatEnum.MP3.toUpperCase()
                ? FormatEnum.AAC
                : FormatEnum.MP3;
          } else if (task.streams.some((s) => s.codec_type === "image")) {
            outputFormat =
              task.displayFormat === FormatEnum.PNG.toUpperCase()
                ? FormatEnum.JPG
                : FormatEnum.PNG;
          }
          // 根据媒体类型创建对应的配置
          if (task.streams.some((s) => s.codec_type === "video")) {
            // Video 配置
            task.config = {
              type: "video",
              outputFormat,
              outputTitle: task.title,
              video: {
                encoder: "h264",
                resolution: "original",
                frameRate: "original",
                bitrate: "auto",
              },
              audioTracks: task.streams
                .filter((s) => s.codec_type === "audio")
                .map((stream) => ({
                  trackIndex: stream.index,
                  encoder: stream.codec_name,
                  channels: "original",
                  sampleRate: "original",
                  bitrate: "128",
                })),
            } as VideoConversionConfig;
          } else if (task.streams.some((s) => s.codec_type === "audio")) {
            // Audio 配置
            task.config = {
              type: "audio",
              outputFormat,
              outputTitle: task.title,
              audioTracks: task.streams
                .filter((s) => s.codec_type === "audio")
                .map((stream) => ({
                  trackIndex: stream.index,
                  encoder: stream.codec_name,
                  channels: "original",
                  sampleRate: "original",
                  bitrate: "128",
                })),
            } as AudioConversionConfig;
          } else if (task.streams.some((s) => s.codec_type === "image")) {
            // Image 配置
            task.config = {
              type: "image",
              outputFormat,
              outputTitle: task.title,
              image: {
                quality: "80",
              },
            } as ImageConversionConfig;
          }
        });

        await converterDB.addTasks(newTasks);
        set((state) => ({
          convertingTasks: [...state.convertingTasks, ...newTasks],
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
        convertingTasks: state.convertingTasks.filter((t) => t.id !== id),
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
  clearConvertingTasks: async () => {
    try {
      const { convertingTasks } = get();
      // 从数据库删除所有转换中的任务
      for (const task of convertingTasks) {
        await converterDB.removeTask(task.id);
      }

      // 从状态中删除
      set({
        convertingTasks: [],
      });
    } catch (error) {
      console.error("Failed to clear converting tasks:", error);
    }
  },
  updateUnfinishedTaskConfig: async (id, config) => {
    const { convertingTasks } = get();
    const task = convertingTasks.find((t) => t.id === id);
    if (task) {
      const taskConfig = task.config as ConversionConfig;
      const updatedTask = {
        ...task,
        config: { ...taskConfig, ...config },
      } as ConverterTask;
      if (convertingTasks.find((t) => t.id === id)) {
        set({
          convertingTasks: convertingTasks.map((t) =>
            t.id === id ? updatedTask : t
          ),
        });
      }
      await converterDB.addTask(updatedTask); // Update DB
    }
  },
  updateTaskById: async (id, updates) => {
    try {
      const { convertingTasks, finishedTasks } = get();
      const task =
        convertingTasks.find((t) => t.id === id) ||
        finishedTasks.find((t) => t.id === id);
      if (task) {
        const updatedTask = { ...task, ...updates };
        const isFinished = updatedTask.status === "finished";

        // 只更新 converting_tasks 表
        await converterDB.addTask(updatedTask);

        // 更新状态：根据 status 决定在哪个列表中
        const currentState = get();
        if (isFinished) {
          // 如果状态是 finished，从 convertingTasks 移除，添加到 finishedTasks
          set({
            convertingTasks: currentState.convertingTasks.filter(
              (t) => t.id !== id
            ),
            finishedTasks: [
              updatedTask,
              ...currentState.finishedTasks.filter((t) => t.id !== id),
            ],
          });
        } else {
          // 如果状态不是 finished，从 finishedTasks 移除，添加到 convertingTasks
          set({
            convertingTasks: [
              updatedTask,
              ...currentState.convertingTasks.filter((t) => t.id !== id),
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
  setActiveTab: (tab) => set({ activeTab: tab }),
  incrementUnreadFinishedCount: () =>
    set((state) => ({ unreadFinishedCount: state.unreadFinishedCount + 1 })),
  resetUnreadFinishedCount: () => set({ unreadFinishedCount: 0 }),
  updateGlobalConfig: async (config: ConversionConfig) => {
    set({ globalConfig: config });
    await converterDB.saveSetting("globalConfig", config);
  },
  toggleFavorite: async (formatId: string) => {
    const { formatFavorites } = get();
    const newFavs = formatFavorites.includes(formatId)
      ? formatFavorites.filter((id) => id !== formatId)
      : [...formatFavorites, formatId];

    set({ formatFavorites: newFavs });
    await converterDB.saveSetting("format_favorites", newFavs);
  },
  addToRecents: async (formatId: string) => {
    const { formatRecents } = get();
    // Keep only last 10, remove if exists to push to top
    const newRecents = [
      formatId,
      ...formatRecents.filter((id) => id !== formatId),
    ].slice(0, 10);

    set({ formatRecents: newRecents });
    await converterDB.saveSetting("format_recents", newRecents);
  },
}));
