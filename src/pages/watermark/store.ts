import { create } from "zustand";
import { MediaTaskType } from "@/types/tasks";
import {
  FFmpegTask,
  FileType,
} from "@/types/tasks";

interface TaskState {
  queueTasks: FFmpegTask[];
  addTasksByPaths: (paths: string[]) => Promise<void>;
  updateTaskById: (id: string, updates: Partial<FFmpegTask>) => void;
  removeTaskByPath: (path: string) => void;
  clearTasks: () => void;
}

export const useWatermarkStore = create<TaskState>(
  (set) => ({
    queueTasks: [],
    addTasksByPaths: async (paths) => {
      const newTasks: FFmpegTask[] = [];
      for (const path of paths) {
        if (!path) continue;
        let outputArgs: any = {
          task_id: crypto.randomUUID(),
          input_path: path,
        }
        let taskType = MediaTaskType.Watermark;
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
