import { create } from "zustand";
import {
  ConverterTask,
  FileType,
} from "@/types/tasks";
import { FormatEnum } from "@/types/options";
import { MediaTaskType } from "@/types/tasks";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "args" | "activeCategory"> {
}

export const defaultVideoConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertImage,
  activeCategory: FileType.Image,
  args: {
    format: FormatEnum.PNG,
  } as ConverterTask["args"],
};

interface ConverterState {
  convertingTasks: ConverterTask[];
  isLoading: boolean;
  globalConfig: GlobalConverterConfig;
  // addTasksByMediaList: (mediaList: MediaDetails[]) => void;
  addTasksByPaths: (paths: string[]) => void;
  clearConvertingTasks: () => Promise<void>;
  updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
  removeTask: (id: string) => void;
  updateGlobalConfig: (config: Partial<GlobalConverterConfig>) => Promise<void>;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  isLoading: true,
  globalConfig: defaultVideoConfig,

  // addTasksByMediaList: async (mediaList) => {
  //   const newTasks: ConverterTask[] = [];
  //   for (const mediaInfo of mediaList) {
  //     if (!mediaInfo.path) continue;
  //     let outputArgs: any = {
  //       ...defaultVideoConfig.args,
  //       task_id: crypto.randomUUID(),
  //       title: mediaInfo.title,
  //       input_path: mediaInfo.path,
  //     }
  //     outputArgs.format = FormatEnum.PNG
  //     const containerDefinition = formatToDefinition.get(outputArgs.format);
  //     outputArgs.video_encoder = containerDefinition?.video?.defaultEncoder

  //     newTasks.push({
  //       id: outputArgs.task_id,
  //       status: "idle",
  //       progress: 0,
  //       mediaDetails: mediaInfo,
  //       args: outputArgs,
  //       fileType: FileType.Image,
  //       taskType: defaultVideoConfig.taskType,
  //       activeCategory: defaultVideoConfig.activeCategory,
  //     });

  //   }

  //   if (newTasks.length > 0) {
  //     set((state) => ({
  //       convertingTasks: [...state.convertingTasks, ...newTasks],
  //     }));
  //   }

  // },
  addTasksByPaths: async (paths) => {
    const newTasks: ConverterTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: any = {
        ...defaultVideoConfig.args,
        task_id: crypto.randomUUID(),
        input_path: path,
      }
      outputArgs.format = FormatEnum.PNG
      newTasks.push({
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Image,
        taskType: defaultVideoConfig.taskType,
        activeCategory: defaultVideoConfig.activeCategory,
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
    if (task) {
      const updatedTask = {
        ...task,
        ...updates,
        args: {
          ...task.args, ...updates.args
        }
      };

      const currentState = get();
      if (["finished", "cancelled"].includes(updatedTask.status)) {
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
  }
}));
