import { create } from "zustand";
import {
  FileType,
  MediaTaskType,
  CompressingTask,
} from "../../../types/tasks";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { getVideoCompressionPresetByRatio } from "./compressionPreset";
import { FormatEnum } from "@/types/options";

export const defaultVideoCompressionConfig = getVideoCompressionPresetByRatio(50, FormatEnum.MP4).patch as CompressVideoTaskArgs;

interface CompressorState {
  compressingTasks: CompressingTask[];
  isLoading: boolean;
  videoConfig: CompressVideoTaskArgs;
  addTasksByPaths: (paths: string[]) => Promise<void>;
  clearCompressingTasks: () => Promise<void>;
  updateTaskById: (id: string, updates: Partial<CompressingTask>) => void;
  removeTask: (id: string) => void;
  updateGlobalConfig: (config: Partial<CompressVideoTaskArgs>) => void;
  pushTasksToQueue: (tasks?: CompressingTask[]) => Promise<void>;
}

export const useCompressorStore = create<CompressorState>((set, get) => ({
  compressingTasks: [],
  isLoading: true,
  videoConfig: defaultVideoCompressionConfig,
  addTasksByPaths: async (paths) => {
    const newTasks: CompressingTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: CompressVideoTaskArgs = {
        ...get().videoConfig,
        task_id: crypto.randomUUID(),
        input_path: path,
      }
      let taskType = MediaTaskType.CompressVideo;
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
        compressingTasks: [...state.compressingTasks, ...newTasks],
      }));
    }
  },
  clearCompressingTasks: async () => {
    try {
      set({
        compressingTasks: [],
      });
    } catch (error) {
      console.error("Failed to clear compressing tasks:", error);
    }
  },
  updateTaskById: async (id, updates) => {
    const { compressingTasks } = get();
    const task =
      compressingTasks.find((t) => t.id === id)
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
          compressingTasks: currentState.compressingTasks.filter(
            (t) => t.id !== id
          ),
        });
      } else {
        set({
          compressingTasks: currentState.compressingTasks.map((t) =>
            t.id === id ? updatedTask : t
          ),
        });
      }
    }

  },
  updateGlobalConfig: (config) => {
    const next = {
      ...get().videoConfig,
      ...config,
    } as CompressVideoTaskArgs;
    set({ videoConfig: next });
  },
  removeTask: async (id: string) => {
    const { compressingTasks } = get();
    set({
      compressingTasks: compressingTasks.filter((t) => t.id !== id),
    });
  },
  pushTasksToQueue: async (tasks) => {
    const { compressingTasks, videoConfig } = get()
    const tasksToPush = tasks || compressingTasks
    if (tasksToPush.length > 0 && videoConfig) {
      const setting = useSettingsStore.getState()
      const useHw = setting.useHardwareAcceleration
      const useUFS = setting.useUltraFastSpeed
      await getMediaTaskQueue().addCompressTasks(tasksToPush.map((task) => {
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
