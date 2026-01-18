import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { downloadDir } from "@tauri-apps/api/path";
import {
  ConverterTask,
  MediaDetails,
  ConversionConfig,
  VideoConversionConfig,
  AudioConversionConfig,
  ImageConversionConfig,
} from "../types/converter";
import { converterDB } from "../db/converterDB";
import { extractFilenameFromPath } from "@/lib/utils";
import { SupportedFormats } from "@/data/formats";
import { FormatEnum } from "../types/options";

interface ConverterState {
  convertingTasks: ConverterTask[];
  finishedTasks: ConverterTask[];
  isLoading: boolean;
  outputPath: string;
  activeTab: "converting" | "finished";
  unreadFinishedCount: number;
  formatFavorites: string[];
  formatRecents: string[];
  useHardwareAcceleration: boolean;
  useUltraFastSpeed: boolean; // For "Ultra-fast Speed"
  globalConfig: ConversionConfig;
  setActiveTab: (tab: "converting" | "finished") => void;
  incrementUnreadFinishedCount: () => void;
  resetUnreadFinishedCount: () => void;
  toggleFavorite: (formatId: string) => void;
  toggleHardwareAcceleration: (enabled: boolean) => void;
  toggleUltraFastSpeed: (enabled: boolean) => void;
  addToRecents: (formatId: string) => void;
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
  setOutputPath: (path: string) => void;
  updateGlobalConfig: (config: ConversionConfig) => void;
}

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

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  finishedTasks: [],
  isLoading: true,
  outputPath: "",
  activeTab: "converting",
  unreadFinishedCount: 0,
  formatFavorites: [],
  formatRecents: [],
  useHardwareAcceleration: false,
  useUltraFastSpeed: false,
  globalConfig: defaultVideoConfig,
  init: async () => {
    try {
      const convertingTasks = await converterDB.getConvertingTasks();
      const finishedTasks = await converterDB.getFinishedTasks();
      const favs = await converterDB.getSetting("format_favorites");
      const recents = await converterDB.getSetting("format_recents");
      const useHardwareAcceleration = await converterDB.getSetting(
        "use_hardware_acceleration"
      );
      const useUltraFastSpeed = await converterDB.getSetting(
        "use_ultra_fast_speed"
      );

      let outputPath = await converterDB.getSetting("outputPath");
      if (!outputPath) {
        outputPath = await downloadDir();
        // Optional: save default to DB immediately or wait for explicit change?
        // Let's save it so DB is consistent
        await converterDB.saveSetting("outputPath", outputPath);
      }

      set({
        convertingTasks,
        finishedTasks,
        isLoading: false,
        outputPath,
        formatFavorites: favs || [],
        formatRecents: recents || [],
        useHardwareAcceleration: !!useHardwareAcceleration,
        useUltraFastSpeed: !!useUltraFastSpeed,
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
          const details = await invoke<MediaDetails>(
            "get_detailed_media_info",
            { path }
          );

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

          newTasks.push({
            ...details,
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
      await converterDB.removeConvertingTask(id);
      set((state) => ({
        convertingTasks: state.convertingTasks.filter((t) => t.id !== id),
      }));
    } catch (error) {
      console.error(`Failed to remove task ${id}:`, error);
    }
  },
  removeFinishedTask: async (id) => {
    try {
      await converterDB.removeFinishedTask(id);
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
        await converterDB.removeConvertingTask(task.id);
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
        const isInConverting = convertingTasks.find((t) => t.id === id);
        const isInFinished = finishedTasks.find((t) => t.id === id);

        // 如果任务状态变为 finished，需要移动到 finished_tasks 表
        if (isFinished && isInConverting) {
          // 从 convertingTasks 移除，添加到 finishedTasks
          // 先更新状态，确保原子性
          await converterDB.removeConvertingTask(id);
          await converterDB.addTask(updatedTask);

          // 使用最新的状态，避免竞态条件
          const currentState = get();
          set({
            convertingTasks: currentState.convertingTasks.filter(
              (t) => t.id !== id
            ),
            finishedTasks: [
              updatedTask,
              ...currentState.finishedTasks.filter((t) => t.id !== id),
            ],
          });
        } else if (isFinished && isInFinished) {
          // 如果已经在 finishedTasks 中，只更新
          await converterDB.addTask(updatedTask);
          const currentState = get();
          set({
            finishedTasks: currentState.finishedTasks.map((t) =>
              t.id === id ? updatedTask : t
            ),
          });
        } else {
          // 普通更新
          await converterDB.addTask(updatedTask);

          if (isInConverting) {
            const currentState = get();
            set({
              convertingTasks: currentState.convertingTasks.map((t) =>
                t.id === id ? updatedTask : t
              ),
            });
          } else if (isInFinished) {
            const currentState = get();
            set({
              finishedTasks: currentState.finishedTasks.map((t) =>
                t.id === id ? updatedTask : t
              ),
            });
          }
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
  setOutputPath: async (path: string) => {
    try {
      await converterDB.saveSetting("outputPath", path);
      set({ outputPath: path });
    } catch (error) {
      console.error("Failed to save output path:", error);
    }
  },
  setActiveTab: (tab) => set({ activeTab: tab }),
  incrementUnreadFinishedCount: () =>
    set((state) => ({ unreadFinishedCount: state.unreadFinishedCount + 1 })),
  resetUnreadFinishedCount: () => set({ unreadFinishedCount: 0 }),
  toggleFavorite: async (formatId) => {
    const { formatFavorites } = get();
    const newFavs = formatFavorites.includes(formatId)
      ? formatFavorites.filter((id) => id !== formatId)
      : [...formatFavorites, formatId];

    set({ formatFavorites: newFavs });
    await converterDB.saveSetting("format_favorites", newFavs);
  },
  addToRecents: async (formatId) => {
    const { formatRecents } = get();
    // Keep only last 10, remove if exists to push to top
    const newRecents = [
      formatId,
      ...formatRecents.filter((id) => id !== formatId),
    ].slice(0, 10);

    set({ formatRecents: newRecents });
    await converterDB.saveSetting("format_recents", newRecents);
  },
  toggleHardwareAcceleration: async (enabled) => {
    set({ useHardwareAcceleration: enabled });
    await converterDB.saveSetting("use_hardware_acceleration", enabled);
  },
  toggleUltraFastSpeed: async (enabled) => {
    set({ useUltraFastSpeed: enabled });
    await converterDB.saveSetting("use_ultra_fast_speed", enabled);
  },
  updateGlobalConfig: async (config: ConversionConfig) => {
    set({ globalConfig: config });
    await converterDB.saveSetting("globalConfig", config);
  },
}));
