import { create } from "zustand";
import {
  ConverterTask,
  FileType,
} from "@/types/tasks";
import { FormatEnum, FormatOption, VideoEncoderEnum } from "@/types/options";
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
    format: FormatEnum.MP4,
    video_encoder: VideoEncoderEnum.H264
  } as ConverterTask["args"],
};

interface ConverterState {
  convertingTasks: ConverterTask[];
  isLoading: boolean;
  globalConfig: GlobalConverterConfig;
  formatRecents: FormatOption[];
  addTasksByPaths: (paths: string[]) => void;
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
  addTasksByPaths: async (paths) => {
    const newTasks: ConverterTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: any = {
        task_id: crypto.randomUUID(),
        input_path: path,
        output_path: '',
      }
      let taskType = MediaTaskType.CompressVideo;
      outputArgs.format = FormatEnum.MP4
      newTasks.push({
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Video,
        taskType
      });

    }
    if (newTasks.length > 0) {
      set((state) => ({
        convertingTasks: [...state.convertingTasks, ...newTasks],
      }));
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
      console.error("Failed to clear processing tasks:", error);
    }
  },
  updateTaskById: async (id, updates) => {
    const { convertingTasks } = get();
    const task =
      convertingTasks.find((t) => t.id === id)
    console.log('task', id, updates)

    if (task) {
      const updatedTask = {
        ...task,
        ...updates,
        args: {
          ...task.args, ...updates.args
        }
      };
      console.log('task updatedTask', updatedTask)
      const isFinished = updatedTask.status === "finished";
      const currentState = get();
      if (isFinished) {
        // Remove from processing tasks
        set({
          convertingTasks: currentState.convertingTasks.filter(
            (t) => t.id !== id
          ),
        });
      } else if (updatedTask.status === "error" || updatedTask.status === "cancelled") {
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
  },
  removeTask: async (id: string) => {
    const { convertingTasks } = get();
    set({
      convertingTasks: convertingTasks.filter((t) => t.args.task_id !== id),
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
