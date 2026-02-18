import { create } from "zustand";
import {
  ConverterTask,
  FileType,
  MediaDetails,
} from "@/types/tasks";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import { formatToDefinition } from "@/data/capabilities";
import { MediaTaskType } from "@/types/tasks";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "args" | "activeCategory"> {
}

export const defaultAudioConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertAudio,
  activeCategory: FileType.Audio,
  args: {
    format: FormatEnum.MP3,
    audio_tracks: [{
      trackIndex: 0,
      codec: AudioEncoderEnum.MP3
    }]
  } as ConverterTask["args"],
};

interface ConverterState {
  convertingTasks: ConverterTask[];
  isLoading: boolean;
  globalConfig: GlobalConverterConfig;
  addTasksByPaths: (paths: string[]) => void;
  clearConvertingTasks: () => Promise<void>;
  updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
  removeTask: (id: string) => void;
  updateGlobalConfig: (config: Partial<GlobalConverterConfig>) => Promise<void>;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  isLoading: true,
  globalConfig: defaultAudioConfig,

  addTasksByPaths: async (paths) => {
    const newTasks: ConverterTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: any = {
        ...defaultAudioConfig.args,
        task_id: crypto.randomUUID(),
        input_path: path,
      }
      newTasks.push({
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Audio,
        taskType: defaultAudioConfig.taskType,
        activeCategory: defaultAudioConfig.activeCategory,
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
