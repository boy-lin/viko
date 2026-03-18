import { create } from "zustand";
import { FileType, MediaTaskType, FFmpegTask } from "../../../types/tasks";
import { CompressImageTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";

export interface CompressingImageTask extends FFmpegTask {
  args: CompressImageTaskArgs;
}
type BaseImageCompressionConfig = Pick<CompressImageTaskArgs, "ratio">;

export const baseDefaultImageCompressionConfig: BaseImageCompressionConfig = {
  ratio: 50
  
};

type CompressorStore = CreateTaskStoreState<
  CompressingImageTask,
  BaseImageCompressionConfig,
  Partial<CompressImageTaskArgs>,
  "CompressingImageTasks",
  "imageConfig",
  "clearCompressingImageTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingImageTask,
    BaseImageCompressionConfig,
    Partial<CompressImageTaskArgs>,
    "CompressingImageTasks",
    "imageConfig",
    "clearCompressingImageTasks"
  >({
    tasksKey: "CompressingImageTasks",
    configKey: "imageConfig",
    clearActionKey: "clearCompressingImageTasks",
    defaultConfig: baseDefaultImageCompressionConfig,
    createTaskByPath: (path, config) => {
      const outputArgs = {
        ...config,
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
    mergeConfig: (current, patch) => {
      const merged = {
        ...current,
        ...patch,
      } as CompressImageTaskArgs;
      return merged
    },
    applyToTaskArgs: (task, config) => {
      const clonedTask = structuredClone(task);
      const clonedConfig = structuredClone(config);

      clonedTask.args = {
        ...clonedTask.args,
        ...clonedConfig,
      };

      return clonedTask;
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
