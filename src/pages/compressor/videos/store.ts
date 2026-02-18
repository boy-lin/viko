import { create } from "zustand";
import {
  FileType,
  MediaTaskType,
  CompressingTask,
} from "../../../types/tasks";
import { CompressVideoTaskArgs } from "@/lib/bridge";

export const defaultVideoCompressionConfig = {
  format: "mp4",
  video_encoder: "h264",
  ratio: 50,
  resolution: "",
  video_bitrate: 0,
  frame_rate: 0
} as CompressVideoTaskArgs;

interface CompressorState {
  compressingTasks: CompressingTask[];
  finishedTasks: CompressingTask[];
  isLoading: boolean;
  videoConfig: CompressVideoTaskArgs;
  addTasksByPaths: (paths: string[]) => Promise<void>;
  clearCompressingTasks: () => Promise<void>;
  updateTaskById: (id: string, updates: Partial<CompressingTask>) => void;
  removeTask: (id: string) => void;
  updateGlobalConfig: (config: Partial<CompressVideoTaskArgs>) => void;
}

export const useCompressorStore = create<CompressorState>((set, get) => ({
  compressingTasks: [],
  finishedTasks: [],
  isLoading: true,
  videoConfig: defaultVideoCompressionConfig,
  addTasksByPaths: async (paths) => {
    const newTasks: CompressingTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: any = {
        task_id: crypto.randomUUID(),
        input_path: path,
        output_path: '',
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
      ...get().videoConfig,
      ...config,
      type: "video",
    } as CompressVideoTaskArgs;
    set({ videoConfig: next });
  },
  removeTask: async (id: string) => {
    const { compressingTasks } = get();
    set({
      compressingTasks: compressingTasks.filter((t) => t.id !== id),
    });
  },
}));
