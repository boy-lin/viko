import { create } from "zustand";
import { FFmpegTask, FileType, MediaTaskType } from "@/types/tasks";
import { FormatEnum, VideoEncoderEnum, AudioEncoderEnum } from "@/types/options";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface ConverterTask extends FFmpegTask<ConvertVideoTaskArgs> {
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "fileType" | "activeCategory"> {
  args: Partial<ConvertVideoTaskArgs>;
}

export const defaultVideoConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertToVideo,
  fileType: FileType.Video,
  activeCategory: FileType.Video,
  args: {},
};

type ConverterStore = CreateTaskStoreState<
  ConverterTask,
  GlobalConverterConfig,
  "tasks",
  "globalConfig",
  "clearTasks"
>;

const baseStoreCreator = createTaskStore<
    ConverterTask,
    GlobalConverterConfig,
    "tasks",
    "globalConfig",
    "clearTasks"
  >({
    tasksKey: "tasks",
    configKey: "globalConfig",
    clearActionKey: "clearTasks",
    defaultConfig: defaultVideoConfig,
    createTaskByPath: (path, config) => {
      const outputArgs = {
        ...config.args,
        task_id: crypto.randomUUID(),
        input_path: path,
      };
      return {
        ...config,
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs
      } as ConverterTask;
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
        "normal",
        "converter-videos",
      );
    },
  });

export const useConverterStore = create<ConverterStore>(baseStoreCreator);
