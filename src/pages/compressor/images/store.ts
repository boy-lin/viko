import { create } from "zustand";
import { FileType, MediaTaskType, FFmpegTask } from "../../../types/tasks";
import { CompressImageTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";
import { FormatEnum } from "@/types/options";

export interface CompressingImageTask extends FFmpegTask<CompressImageTaskArgs> {
}
export interface GlobalImageCompressionConfig extends Pick<CompressingImageTask, "taskType" | "fileType"> {
  args: Partial<CompressImageTaskArgs>;
}

export const defaultImageCompressionConfig: GlobalImageCompressionConfig = {
  taskType: MediaTaskType.CompressImage,
  fileType: FileType.Image,
  args: {
    ratio: 50,
  },
};
type CompressorStore = CreateTaskStoreState<
  CompressingImageTask,
  GlobalImageCompressionConfig,
  "CompressingImageTasks",
  "imageConfig",
  "clearCompressingImageTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingImageTask,
    GlobalImageCompressionConfig,
    "CompressingImageTasks",
    "imageConfig",
    "clearCompressingImageTasks"
  >({
    tasksKey: "CompressingImageTasks",
    configKey: "imageConfig",
    clearActionKey: "clearCompressingImageTasks",
    defaultConfig: defaultImageCompressionConfig,
    createTaskByPath: (path, config) => {
      const outputArgs = {
        quality: 50,
        ...config.args,
        task_id: crypto.randomUUID(),
        input_path: path,
      };
      
      return {
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Image,
        taskType: MediaTaskType.CompressImage,
      } as CompressingImageTask;
    },
    queueAdapter: async (tasks) => {
      const settings = useSettingsStore.getState();
      const useHw = settings.useHardwareAcceleration;
      const useUFS = settings.useUltraFastSpeed;

      await getMediaTaskQueue().addTasks(
        tasks.map((task) => {
          const outputDir = settings.getOutputDir(task.args.input_path);
          const outputTitle = resolveOutputTitle(task);
          return {
            type: task.taskType,
            args: {
              ...task.args,
              output_path: `${outputDir}/${outputTitle}.${task.args.format}`,
              use_hardware_acceleration: useHw,
              use_ultra_fast_speed: useUFS,
            },
          };
        }),
      );
    },
  }),
);
