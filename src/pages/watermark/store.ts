import { create } from "zustand";
import { MediaTaskType } from "@/types/tasks";
import {
  FFmpegTask,
  FileType,
} from "@/types/tasks";

interface TaskState {
  queueTasks: FFmpegTask[];
  addTasksByPaths: (paths: string[]) => Promise<void>;
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
          output_path: '',
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
  })
)