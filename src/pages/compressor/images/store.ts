import { create } from "zustand";
import {
  FileType,
  MediaTaskType,
  CompressingTask,
} from "../../../types/tasks";
import { CompressImageTaskArgs } from "@/lib/bridge";

export const defaultImageCompressionConfig = {
  format: "jpg",
  quality: 80,
  color_mode: "RGB",
  dpi: 72,
  strip_metadata: true,
  keep_transparency: true,
  crop_whitespace: false
} as CompressImageTaskArgs

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
    const next = {
      ...get().imageConfig,
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
}));
