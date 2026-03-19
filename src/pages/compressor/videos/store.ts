import { create } from "zustand";
import { FFmpegTask, FileType, MediaTaskType } from "../../../types/tasks";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { FormatEnum } from "@/types/options";
import {
  createTaskStore,
  CreateTaskStoreState,
  resolveOutputTitle,
} from "@/lib/createTaskStore";

export interface CompressingTask extends FFmpegTask<CompressVideoTaskArgs > {
}

export interface GlobalVideoCompressionConfig extends Pick<CompressingTask, "taskType" | "fileType"> {
  args: Partial<CompressVideoTaskArgs>;
}

export const defaultVideoCompressionConfig: GlobalVideoCompressionConfig = {
  taskType: MediaTaskType.CompressVideo,
  fileType: FileType.Video,
  args: {
    ratio: 20,
  },
};
type CompressorStore = CreateTaskStoreState<
  CompressingTask,
  GlobalVideoCompressionConfig,
  "compressingTasks",
  "videoConfig",
  "clearCompressingTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingTask,
    GlobalVideoCompressionConfig,
    "compressingTasks",
    "videoConfig",
    "clearCompressingTasks"
  >({
    tasksKey: "compressingTasks",
    configKey: "videoConfig",
    clearActionKey: "clearCompressingTasks",
    defaultConfig: defaultVideoCompressionConfig,
    createTaskByPath: (path, config) => {
      const outputArgs = {
        ratio: 20,
        ...config.args,
        task_id: crypto.randomUUID(),
        input_path: path,
      };
      return {
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Video,
        taskType: MediaTaskType.CompressVideo,
      } as CompressingTask;
    },
    queueAdapter: async (tasks) => {
      const settings = useSettingsStore.getState();
      const useHw = settings.useHardwareAcceleration;
      const useUFS = settings.useUltraFastSpeed;

      await getMediaTaskQueue().addTasks(
        tasks.map((task) => {
          const outputDir = settings.getOutputDir(task.args.input_path);
          const outputTitle = resolveOutputTitle(task);
          const outputFormat = task.args.format || FormatEnum.MP4;
          return {
            type: task.taskType,
            args: {
              ...task.args,
              format: outputFormat,
              output_path: `${outputDir}/${outputTitle}.${outputFormat}`,
              use_hardware_acceleration: useHw,
              use_ultra_fast_speed: useUFS,
            },
          };
        }),
      );
    },
  }),
);
