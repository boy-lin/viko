import { create } from "zustand";
import {
  FileType,
  MediaTaskType,
  CompressingTask,
} from "../../../types/tasks";
import { FormatOption } from "@/types/options";
import { CompressAudioTaskArgs } from "@/lib/bridge";

export const defaultAudioCompressionConfig = {
  format: "mp4",
  ratio: 50,
  audio_encoder: "aac",
} as CompressAudioTaskArgs;

interface CompressorState {
  compressingTasks: CompressingTask[];
  finishedTasks: CompressingTask[];
  formatRecents: FormatOption[];
  isLoading: boolean;
  audioConfig: CompressAudioTaskArgs;
  addTasksByPaths: (paths: string[]) => Promise<void>;
  clearCompressingTasks: () => Promise<void>;
  updateTaskById: (id: string, updates: Partial<CompressingTask>) => void;
  addToRecents: (format: FormatOption) => void;
  removeTask: (id: string) => void;
  updateGlobalConfig: (config: Partial<CompressAudioTaskArgs>) => void;
}

export const useCompressorStore = create<CompressorState>((set, get) => ({
  compressingTasks: [],
  finishedTasks: [],
  formatRecents: [],
  isLoading: true,
  audioConfig: defaultAudioCompressionConfig,
  addTasksByPaths: async (paths) => {
    const newTasks: CompressingTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: any = {
        task_id: crypto.randomUUID(),
        input_path: path,
        output_path: '',
      }
      let taskType = MediaTaskType.CompressAudio;
      newTasks.push({
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Audio,
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
    try {
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
        const isFinished = updatedTask.status === "finished";
        const currentState = get();
        if (isFinished) {

          set({
            compressingTasks: currentState.compressingTasks.filter(
              (t) => t.id !== id
            ),
          });

        } else if (updatedTask.status === "error" || updatedTask.status === "cancelled") {

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
    } catch (error) {
      console.error(
        `Failed to update task ${id} with updates:`,
        updates,
        error
      );
    }
  },
  updateGlobalConfig: (config) => {
    const next = {
      ...get().audioConfig,
      ...config,
    } as CompressAudioTaskArgs;
    set({ audioConfig: next });
  },
  removeTask: async (id: string) => {
    const { compressingTasks } = get();
    set({
      compressingTasks: compressingTasks.filter((t) => t.id !== id),
    });
  },
  addToRecents: (format) => {
    set((state) => {
      const recents = state.formatRecents;
      if (recents.includes(format)) return state;
      return {
        formatRecents: [format, ...recents].slice(0, 10),
      };
    });
  },
}));
