import { create } from "zustand";
import {
  FileType,
  MediaTaskType,
  CompressingTask,
} from "../../../types/tasks";
import { CompressImageTaskArgs } from "@/lib/bridge";
import { getMediaTaskQueue } from "@/lib/bridge";
import { useSettingsStore } from "@/stores/settingsStore";
import { getImageCompressionPresetByQuality } from "./compressionPreset";

const baseDefaultImageCompressionConfig = {
  format: "jpg",
  quality: 80,
  color_mode: "RGB",
  dpi: 72,
  strip_metadata: true,
  keep_transparency: true,
  crop_whitespace: false
} as CompressImageTaskArgs;
export const defaultImageCompressionConfig = {
  ...baseDefaultImageCompressionConfig,
  ...getImageCompressionPresetByQuality(baseDefaultImageCompressionConfig.quality).patch,
} as CompressImageTaskArgs;

interface CompressorState {
  compressingTasks: CompressingTask[];
  finishedTasks: CompressingTask[];
  isLoading: boolean;
  imageConfig: CompressImageTaskArgs;
  addTasksByPaths: (paths: string[]) => Promise<void>;
  clearCompressingTasks: () => Promise<void>;
  updateTaskById: (id: string, updates: Partial<CompressingTask>) => void;
  removeTask: (id: string) => void;
  updateGlobalConfig: (config: Partial<CompressImageTaskArgs>) => void;
  pushTasksToQueue: (tasks?: CompressingTask[]) => Promise<void>;
}

export const useCompressorStore = create<CompressorState>((set, get) => ({
  compressingTasks: [],
  finishedTasks: [],
  isLoading: true,
  imageConfig: defaultImageCompressionConfig,
  addTasksByPaths: async (paths) => {
    const newTasks: CompressingTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: any = {
        ...get().imageConfig,
        task_id: crypto.randomUUID(),
        input_path: path,
        output_path: '',
        quality: get().imageConfig.quality,
        format: get().imageConfig.format,
        color_mode: get().imageConfig.color_mode,
        dpi: get().imageConfig.dpi,
        strip_metadata: get().imageConfig.strip_metadata,
        keep_transparency: get().imageConfig.keep_transparency,
        crop_whitespace: get().imageConfig.crop_whitespace,
      }
      let taskType = MediaTaskType.CompressImage;
      newTasks.push({
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Image,
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
    const { compressingTasks, finishedTasks } = get();
    const task =
      compressingTasks.find((t) => t.id === id) ||
      finishedTasks.find((t) => t.id === id);
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
    const current = get().imageConfig;
    const presetPatch =
      config.quality !== undefined
        ? getImageCompressionPresetByQuality(config.quality).patch
        : {};
    const next = {
      ...current,
      ...presetPatch,
      ...config,
    } as CompressImageTaskArgs;
    set({ imageConfig: next });
  },
  removeTask: async (id: string) => {
    const { compressingTasks } = get();
    set({
      compressingTasks: compressingTasks.filter((t) => t.id !== id),
    });
  },
  pushTasksToQueue: async (tasks) => {
    const { compressingTasks, imageConfig } = get()
    const tasksToPush = tasks || compressingTasks
    if (tasksToPush.length > 0 && imageConfig) {
      const setting = useSettingsStore.getState()
      const useHw = setting.useHardwareAcceleration
      const useUFS = setting.useUltraFastSpeed
      await getMediaTaskQueue().addCompressTasks(tasksToPush.map((task) => {
        const outputDir = setting.getOutputDir(task.args.input_path);
        return {
          kind: task.taskType,
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
