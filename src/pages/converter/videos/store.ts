import { create } from "zustand";
import { ConverterTask, FileType, MediaTaskType } from "@/types/tasks";
import { FormatEnum, VideoEncoderEnum, AudioEncoderEnum } from "@/types/options";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "args" | "activeCategory"> {}

export const defaultVideoConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertVideo,
  activeCategory: FileType.Video,
  args: {
    format: FormatEnum.MP4,
    video_encoder: VideoEncoderEnum.H264,
    audio_tracks: [{
      trackIndex: 0,
      codec: AudioEncoderEnum.AAC,
    }],
  },
};

type ConverterStore = CreateTaskStoreState<
  ConverterTask,
  GlobalConverterConfig,
  GlobalConverterConfig,
  "convertingTasks",
  "globalConfig",
  "clearConvertingTasks"
>;

export const useConverterStore = create<ConverterStore>(
  createTaskStore<
    ConverterTask,
    GlobalConverterConfig,
    GlobalConverterConfig,
    "convertingTasks",
    "globalConfig",
    "clearConvertingTasks"
  >({
    tasksKey: "convertingTasks",
    configKey: "globalConfig",
    clearActionKey: "clearConvertingTasks",
    defaultConfig: defaultVideoConfig,
    createTaskByPath: (path, config) => {
      const outputArgs: ConvertVideoTaskArgs = {
        ...config.args,
        task_id: crypto.randomUUID(),
        input_path: path,
      };
      return {
        ...config,
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Video,
      };
    },
    mergeConfig: (current, patch) => {
      const { args, ...rest } = current;
      return {
        ...rest,
        ...patch,
        args: {
          ...args,
          ...patch.args,
        },
      };
    },
    applyConfigToTask: (task, config) => ({
      ...task,
      taskType: config.taskType,
      args: {
        ...task.args,
        ...config.args,
      },
    }),
    queueAdapter: async (tasks) => {
      const settings = useSettingsStore.getState();
      const useHw = settings.useHardwareAcceleration;
      const useUFS = settings.useUltraFastSpeed;

      await getMediaTaskQueue().addConvertTasks(
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
