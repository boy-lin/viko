import { create } from "zustand";
import {
  ConverterTask,
  FileType,
} from "@/types/tasks";
import { FormatEnum, VideoEncoderEnum, AudioEncoderEnum } from "@/types/options";
import { MediaTaskType } from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "args" | "activeCategory"> {
}

export const defaultVideoConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertVideo,
  activeCategory: FileType.Video,
  args: {
    format: FormatEnum.MP4,
    video_encoder: VideoEncoderEnum.H264,
    audio_tracks: [{
      trackIndex: 0,
      codec: AudioEncoderEnum.AAC
    }]
  },
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
  pushTasksToQueue: (tasks?: ConverterTask[]) => Promise<void>;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  isLoading: true,
  globalConfig: defaultVideoConfig,
  addTasksByPaths: async (paths) => {
    const newTasks: ConverterTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: any = {
        ...get().globalConfig.args,
        task_id: crypto.randomUUID(),
        input_path: path
      }
      newTasks.push({
        ...get().globalConfig,
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Video,
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
      const updatedTask: ConverterTask = {
        ...task,
        ...updates,
        args: {
          ...task.args,
          ...updates.args
        }
      };
      console.log('updatedTask', updatedTask)
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

  pushTasksToQueue: async (tasks) => {
    const { convertingTasks, globalConfig } = get()
    const tasksToPush = tasks || convertingTasks
    if (tasksToPush.length > 0 && globalConfig) {
      const setting = useSettingsStore.getState()
      const useHw = setting.useHardwareAcceleration
      const useUFS = setting.useUltraFastSpeed
      await getMediaTaskQueue().addConvertTasks(tasksToPush.map((task) => {
        const outputDir = setting.getOutputDir(task.args.input_path);
        return {
          type: task.taskType,
          args: {
            ...task.args,
            output_path: `${outputDir}/${task.args.title}.${task.args.format}`,
            use_hardware_acceleration: useHw,
            use_ultra_fast_speed: useUFS
          }
        }
      }));
    }
  }
}));
