import { create } from "zustand";
import { MediaTaskType } from "@/types/tasks";
import {
  FFmpegTask,
  FileType,
} from "@/types/tasks";
import { WatermarkTaskArgs } from "@/lib/mediaTaskEvent";
import { getExtension } from "@/lib/utils";
import { isImageFormat } from "@/data/formats";
import { defaultWatermarkConfig, WatermarkEditorConfig } from "./types";

export interface WatermarkTask extends FFmpegTask {
  args: WatermarkTaskArgs;
}

export interface WatermarkPreviewFrame {
  dataUrl: string;
  width: number;
  height: number;
}

interface TaskState {
  queueTasks: WatermarkTask[];
  config: WatermarkEditorConfig;
  previewFrame: WatermarkPreviewFrame | null;
  isPreviewLoading: boolean;
  addTasksByPaths: (paths: string[]) => Promise<void>;
  updateTaskById: (id: string, updates: Partial<WatermarkTask>) => void;
  removeTaskByPath: (path: string) => void;
  clearTasks: () => void;
  updateConfig: (patch: Partial<WatermarkEditorConfig>) => void;
  resetConfig: () => void;
  setPreviewFrame: (frame: WatermarkPreviewFrame | null) => void;
  setPreviewLoading: (loading: boolean) => void;
}

export const useWatermarkStore = create<TaskState>(
  (set) => ({
    queueTasks: [],
    config: defaultWatermarkConfig,
    previewFrame: null,
    isPreviewLoading: false,
    addTasksByPaths: async (paths) => {
      const newTasks: WatermarkTask[] = [];
      for (const path of paths) {
        if (!path) continue;
        const extension = (getExtension(path) || "").toLowerCase();
        const fileType = isImageFormat(extension) ? FileType.Image : FileType.Video;
        let outputArgs: any = {
          task_id: crypto.randomUUID(),
          input_path: path,
          input_file_type: fileType,
        }
        let taskType = MediaTaskType.Watermark;
        newTasks.push({
          id: outputArgs.task_id,
          status: "idle",
          progress: 0,
          args: outputArgs,
          fileType,
          taskType
        });
      }
      if (newTasks.length > 0) {
        set((state) => ({
          queueTasks: [...state.queueTasks, ...newTasks],
        }));
      }
    },
    updateTaskById: (id, updates) => {
      set((state) => ({
        queueTasks: state.queueTasks.map((task) =>
          task.id === id
            ? {
              ...task,
              ...updates,
              args: {
                ...task.args,
                ...updates.args,
              },
            }
            : task
        ),
      }));
    },
    removeTaskByPath: (path) => {
      set((state) => ({
        queueTasks: state.queueTasks.filter(
          (task) => task.args?.input_path !== path
        ),
      }));
    },
    clearTasks: () => set({ queueTasks: [] }),
    updateConfig: (patch) => {
      set((state) => ({
        config: {
          ...state.config,
          ...patch,
        },
      }));
    },
    resetConfig: () => set({ config: defaultWatermarkConfig }),
    setPreviewFrame: (frame) => set({ previewFrame: frame }),
    setPreviewLoading: (loading) => set({ isPreviewLoading: loading }),
  })
)
