import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ConverterTask,
  ConversionConfig,
  FileType,
} from "../types/tasks";
import { converterDB } from "../db/converterDB";
import { ConvertAudioTaskArgs, ConvertImageTaskArgs, ConvertVideoTaskArgs } from "@/lib/bridge";
import { AudioEncoderEnum, FormatEnum, VideoEncoderEnum } from "../types/options";
import { bridge, MediaTaskType } from "@/lib/bridge";
import { formatToDefinition } from "@/data/capabilities";

export const defaultVideoConfig: ConvertVideoTaskArgs = {
  task_id: crypto.randomUUID(),
  input_path: "",
  format: FormatEnum.MP4,
  video_encoder: VideoEncoderEnum.H264
};

export const defaultAudioConfig: ConvertAudioTaskArgs = {
  task_id: crypto.randomUUID(),
  input_path: "",
  format: FormatEnum.AAC,
  audio_encoder: AudioEncoderEnum.AAC
};

export const defaultImageConfig: ConvertImageTaskArgs = {
  task_id: crypto.randomUUID(),
  input_path: "",
  format: FormatEnum.JPG,
};

export interface GlobalConverterConfig extends Omit<ConversionConfig, "task_id"> {
  mediaType: MediaTaskType.ConvertVideo | MediaTaskType.ConvertAudio | MediaTaskType.ConvertImage;
}

interface ConverterState {
  convertingTasks: ConverterTask[];
  finishedTasks: ConverterTask[];
  isLoading: boolean;
  activeTab: "converting" | "finished";
  unreadFinishedCount: number;
  globalConfig: GlobalConverterConfig;
  formatRecents: string[];
  setActiveTab: (tab: "converting" | "finished") => void;
  incrementUnreadFinishedCount: () => void;
  resetUnreadFinishedCount: () => void;
  init: () => Promise<void>;
  addFiles: ({
    extensions,
    fileType,
  }: {
    extensions: string[];
    fileType: FileType;
  }) => Promise<string[] | undefined>;
  addFilesFromPaths: (
    paths: string[],
    fileType: FileType,
    onFileProcessed?: (
      path: string,
      status: "success" | "error",
      message?: string
    ) => void,
  ) => Promise<string[] | undefined>;
  removeTask: (id: string) => void;
  removeFinishedTask: (id: string) => void;
  clearConvertingTasks: () => Promise<void>;
  updateUnfinishedTaskConfig: (
    id: string,
    config: Partial<ConversionConfig>
  ) => void;
  updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
  updateGlobalConfig: (config: ConversionConfig) => Promise<void>;
  addToRecents: (formatId: string) => Promise<void>;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  finishedTasks: [],
  isLoading: true,
  activeTab: "converting",
  unreadFinishedCount: 0,
  globalConfig: defaultVideoConfig,
  formatRecents: [],
  init: async () => {
    try {
      const recents = await converterDB.getSetting("format_recents");
      const globalConfig = await converterDB.getSetting("globalConfig");
      set({
        globalConfig: globalConfig || defaultVideoConfig,
        formatRecents: recents || [],
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load tasks from DB:", error);
      set({ isLoading: false });
    }
  },
  addFiles: async ({
    extensions,
    fileType,
  }) => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: extensions,
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
      return await get().addFilesFromPaths(paths, fileType);
    } catch (err) {
      console.error("Error selecting files:", err);
    }
  },
  addFilesFromPaths: async (paths, fileType, onFileProcessed) => {
    try {
      const newTasks: ConverterTask[] = [];

      for (const path of paths) {
        if (!path) continue;
        try {
          const details = await bridge.getMediaDetails(path);
          console.log("details", details);
          let taskType: MediaTaskType;
          let outputArgs: any = {
            title: details.title,
          }
          if (fileType === FileType.Video) {
            taskType = MediaTaskType.ConvertVideo;
            outputArgs.format = FormatEnum.MP4
            const containerDefinition = formatToDefinition.get(FormatEnum.MP4);
            outputArgs.video_encoder = containerDefinition?.video?.defaultEncoder
            outputArgs.audioTracks = details.streams.filter((stream) => stream.codec_type === "audio").map((stream) => {
              return {
                trackIndex: stream.index,
                encoder: containerDefinition?.audio?.defaultEncoder
              }
            })
          } else if (fileType === FileType.Audio) {
            taskType = MediaTaskType.ConvertAudio;
            outputArgs.format = FormatEnum.AAC
          } else if (fileType === FileType.Image) {
            taskType = MediaTaskType.ConvertImage;
            outputArgs.format = FormatEnum.JPG
          } else {
            throw new Error("Unsupported file type");
          }

          newTasks.push({
            id: crypto.randomUUID(),
            status: "idle",
            progress: 0,
            ...details,
            args: outputArgs,
            taskType
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
          convertingTasks: [...state.convertingTasks, ...newTasks],
        }));
      }

      return paths;
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
