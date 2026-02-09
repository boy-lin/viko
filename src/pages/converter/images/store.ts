import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ConverterTask,
  FileType,
} from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";
import { FormatEnum, FormatOption, VideoEncoderEnum } from "@/types/options";
import { bridge } from "@/lib/bridge";
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
  isLoading: boolean;
  globalConfig: GlobalConverterConfig;
  formatRecents: FormatOption[];
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
  clearConvertingTasks: () => Promise<void>;
  updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
  removeTask: (id: string) => void;
  updateGlobalConfig: (config: Partial<GlobalConverterConfig>) => Promise<void>;
  addToRecents: (format: FormatOption) => Promise<void>;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  isLoading: true,
  globalConfig: defaultVideoConfig,
  formatRecents: [],
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
  clearConvertingTasks: async () => {
    try {
      // 从状态中删除
      set({
        convertingTasks: [],
      });
      // 停止task任务

    } catch (error) {
      console.error("Failed to clear converting tasks:", error);
    }
  },
  updateTaskById: async (id, updates) => {
    try {
      const { convertingTasks } = get();
      const task =
        convertingTasks.find((t) => t.id === id)
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
        } else if (updatedTask.status === "error") {
          set({
            convertingTasks: currentState.convertingTasks.filter(
              (t) => t.id !== id
            ),
          });
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
  removeTask: async (id: string) => {
    const { convertingTasks } = get();
    set({
      convertingTasks: convertingTasks.filter((t) => t.id !== id),
    });
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
  }
}));
