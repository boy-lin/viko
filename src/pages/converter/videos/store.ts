import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ConverterTask,
  FileType,
} from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";
import { FormatEnum, FormatOption, VideoEncoderEnum } from "@/types/options";
import { bridge, TaskHistoryItem } from "@/lib/bridge";
import { formatToDefinition } from "@/data/capabilities";
import { MediaTaskType } from "@/types/tasks";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "args"> {
  activeCategory: FileType.Video | FileType.Audio | FileType.Image | ActiveCategoryEnum.Recents;
}

export const defaultVideoConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertVideo,
  activeCategory: FileType.Video,
  args: {
    task_id: '',
    input_path: "",
    format: FormatEnum.MP4,
    video_encoder: VideoEncoderEnum.H264
  },
};

interface ConverterState {
  convertingTasks: ConverterTask[];
  finishedTasks: ConverterTask[];
  isLoading: boolean;
  globalConfig: GlobalConverterConfig;
  formatRecents: FormatOption[];
  init: () => Promise<void>;
  addFiles: ({
    extensions,
    fileType,
  }: {
    extensions: string[];
    fileType?: FileType;
  }) => Promise<string[] | undefined>;
  addFilesFromPaths: (
    paths: string[],
    onFileProcessed?: (
      path: string,
      status: "success" | "error",
      message?: string
    ) => void,
  ) => Promise<string[] | undefined>;
  removeTask: (id: string) => void;
  removeFinishedTask: (id: string) => void;
  clearConvertingTasks: () => Promise<void>;
  updateUnfinishedTask: (
    id: string,
    config: Partial<ConverterTask>
  ) => void;
  updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
  setGlobalConfig: (config: GlobalConverterConfig) => Promise<void>;
  updateGlobalConfig: (config: Partial<GlobalConverterConfig>) => Promise<void>;
  addToRecents: (format: FormatOption) => Promise<void>;
  historyTasks: TaskHistoryItem[];
  fetchHistory: () => Promise<void>;
  addHistoryItem: (item: TaskHistoryItem) => void;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  historyTasks: [],
  finishedTasks: [],
  isLoading: true,
  globalConfig: defaultVideoConfig,
  formatRecents: [],
  init: async () => {
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
      return await get().addFilesFromPaths(paths);
    } catch (err) {
      console.error("Error selecting files:", err);
    }
  },
  addFilesFromPaths: async (paths, onFileProcessed) => {
    try {
      const newTasks: ConverterTask[] = [];
      for (const path of paths) {
        if (!path) continue;
        const outputDir = useSettingsStore.getState().getOutputDir(path);
        try {
          const details = await bridge.getMediaDetails(path);
          console.log("details", details);
          let taskType: MediaTaskType;
          let outputArgs: any = {
            task_id: crypto.randomUUID(),
            title: details.title,
            input_path: path,
            output_path: '',
          }

          taskType = MediaTaskType.ConvertVideo;
          outputArgs.format = FormatEnum.MP4
          outputArgs.output_path = `${outputDir}/${details.title}.${FormatEnum.MP4}`
          const containerDefinition = formatToDefinition.get(FormatEnum.MP4);
          outputArgs.video_encoder = containerDefinition?.video?.defaultEncoder
          outputArgs.audio_tracks = details.streams.filter((stream) => stream.codec_type === "audio").map((stream) => {
            return {
              trackIndex: stream.index,
              encoder: containerDefinition?.audio?.defaultEncoder
            }
          })

          newTasks.push({
            id: outputArgs.task_id,
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
      set((state) => ({
        convertingTasks: state.convertingTasks.filter((t) => t.id !== id),
      }));
    } catch (error) {
      console.error(`Failed to remove task ${id}:`, error);
    }
  },
  removeFinishedTask: async (id) => {
    try {
      await bridge.deleteTaskHistory(id);
      await get().fetchHistory();
    } catch (error) {
      console.error(`Failed to remove finished task ${id}:`, error);
    }
  },
  clearConvertingTasks: async () => {
    try {
      // 从状态中删除
      set({
        convertingTasks: [],
      });
    } catch (error) {
      console.error("Failed to clear converting tasks:", error);
    }
  },
  updateUnfinishedTask: async (id, vals) => {
    const { convertingTasks } = get();
    const task = convertingTasks.find((t) => t.id === id);
    if (task) {
      set({
        convertingTasks: convertingTasks.map((t) =>
          t.id === id ? { ...t, ...vals } : t
        ),
      });
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
        const currentState = get();
        if (isFinished) {
          // Remove from converting tasks
          set({
            convertingTasks: currentState.convertingTasks.filter(
              (t) => t.id !== id
            ),
          });
          // Trigger history refresh
          get().fetchHistory();
        } else if (updatedTask.status === "error") {
          set({
            convertingTasks: currentState.convertingTasks.filter(
              (t) => t.id !== id
            ),
          });
          // Trigger history refresh
          get().fetchHistory();
        } else {
          set({
            convertingTasks: currentState.convertingTasks.map((t) =>
              t.id === id ? updatedTask : t
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
  setGlobalConfig: async (config) => {
    set({ globalConfig: config });
  },
  updateGlobalConfig: async (config) => {
    const { args, ...rest } = get().globalConfig
    set({
      globalConfig: {
        ...rest,
        ...config,
        args: { ...args, ...config.args }
      }
    });
  },
  addToRecents: async (format: FormatOption) => {
    const { formatRecents } = get();
    // Keep only last 10, remove if exists to push to top
    const newRecents = [
      format,
      ...formatRecents.filter((f) => f.id !== format.id),
    ].slice(0, 10);

    set({ formatRecents: newRecents });
  },
  fetchHistory: async () => {
    try {
      const history = await bridge.getTaskHistory(100, 0, "convert");
      set({ historyTasks: history });
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  },
  addHistoryItem: (item) => {
    set((state) => ({
      historyTasks: [item, ...state.historyTasks],
    }));
  },
}));
