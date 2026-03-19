import { create } from "zustand";
import { FFmpegTask, FileType, MediaTaskType } from "@/types/tasks";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";
import { ConvertAudioTaskArgs } from "@/lib/mediaTaskEvent";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface ConverterTask extends FFmpegTask<ConvertAudioTaskArgs> {
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "fileType" | "activeCategory"> {
  args: Partial<ConvertAudioTaskArgs>;
}

export const defaultAudioConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertToAudio,
  fileType: FileType.Audio,
  activeCategory: FileType.Audio,
  args: {
    format: FormatEnum.MP3,
    audio_tracks: [{
      source_stream_index: 0,
      codec: AudioEncoderEnum.MP3,
    }],
  },
};

type ConverterStore = CreateTaskStoreState<
  ConverterTask,
  GlobalConverterConfig,
  "tasks",
  "globalConfig",
  "clearTasks"
>;

export const useConverterStore = create<ConverterStore>(
  createTaskStore<
    ConverterTask,
    GlobalConverterConfig,
    "tasks",
    "globalConfig",
    "clearTasks"
  >({
    tasksKey: "tasks",
    configKey: "globalConfig",
    clearActionKey: "clearTasks",
    defaultConfig: defaultAudioConfig,
    createTaskByPath: (path, config) => {
      const outputArgs: ConvertAudioTaskArgs = {
        format: FormatEnum.MP3,
        ...config.args,
        task_id: crypto.randomUUID(),
        input_path: path
      };
      return {
        ...config,
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Audio,
      };
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
        "converter-audios",
      );
    },
  }),
);
