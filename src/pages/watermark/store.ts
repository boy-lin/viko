import { create } from "zustand";
import { MediaTaskType } from "@/types/tasks";
import {
  FFmpegTask,
  FileType,
} from "@/types/tasks";
import { WatermarkTaskArgs } from "@/lib/mediaTaskEvent";
import { getExtension } from "@/lib/utils";
import { isImageFormat } from "@/data/formats";

export interface WatermarkTask extends FFmpegTask {
  args: WatermarkTaskArgs;
}

interface TaskState {
  queueTasks: WatermarkTask[];
  addTasksByPaths: (paths: string[]) => Promise<void>;
  updateTaskById: (id: string, updates: Partial<WatermarkTask>) => void;
  removeTaskByPath: (path: string) => void;
  clearTasks: () => void;
}

export const useWatermarkStore = create<TaskState>(
  (set) => ({
    queueTasks: [],
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
  })
)
