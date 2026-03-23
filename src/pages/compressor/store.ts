import { create } from "zustand";

import {
  AUDIO_SUPPORT_FORMATS,
  IMAGE_SUPPORT_FORMATS,
  VIDEO_SUPPORT_FORMATS,
} from "@/data/formats";
import {
  createTaskStore,
  CreateTaskStoreState,
  resolveOutputTitle,
} from "@/lib/createTaskStore";
import {
  CompressAudioTaskArgs,
  CompressImageTaskArgs,
  CompressVideoTaskArgs,
} from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { extractFilenameFromPath } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import { FFmpegTask, FileType, MediaTaskType } from "@/types/tasks";

export type CompressorTaskArgs =
  | CompressVideoTaskArgs
  | CompressAudioTaskArgs
  | CompressImageTaskArgs;

export interface CompressorTask extends FFmpegTask<CompressorTaskArgs> {}

export interface GlobalCompressorConfig {
  args: {
    ratio?: number;
    quality?: number;
  };
}

export const defaultCompressorConfig: GlobalCompressorConfig = {
  args: {
    ratio: 50,
    quality: 50,
  },
};

type CompressorStore = CreateTaskStoreState<
  CompressorTask,
  GlobalCompressorConfig,
  "tasks",
  "globalConfig",
  "clearTasks"
>;

const normalizeExtension = (path: string) =>
  path.split(".").pop()?.toLowerCase() ?? "";

export const inferFileTypeFromPath = (path: string): FileType | null => {
  const extension = normalizeExtension(path);

  if (VIDEO_SUPPORT_FORMATS.includes(extension as FormatEnum)) {
    return FileType.Video;
  }
  if (AUDIO_SUPPORT_FORMATS.includes(extension as FormatEnum)) {
    return FileType.Audio;
  }
  if (IMAGE_SUPPORT_FORMATS.includes(extension as FormatEnum)) {
    return extension === FormatEnum.GIF ? FileType.Gif : FileType.Image;
  }

  return null;
};

const createDefaultArgs = (
  taskId: string,
  inputPath: string,
  fileType: FileType,
  config: GlobalCompressorConfig,
): CompressorTaskArgs => {
  if (fileType === FileType.Audio) {
    return {
      task_id: taskId,
      input_path: inputPath,
      output_path: inputPath,
      codec: AudioEncoderEnum.MP3,
      ratio: config.args.ratio ?? 50,
      format: normalizeExtension(inputPath) as FormatEnum,
    } as CompressAudioTaskArgs;
  }

  if (fileType === FileType.Image || fileType === FileType.Gif) {
    const format = normalizeExtension(inputPath) || FormatEnum.JPG;
    return {
      task_id: taskId,
      input_path: inputPath,
      ratio: config.args.ratio ?? 50,
      quality: config.args.quality ?? 50,
      format,
    } as CompressImageTaskArgs;
  }

  return {
    task_id: taskId,
    input_path: inputPath,
    ratio: config.args.ratio ?? 20,
    format: normalizeExtension(inputPath) as FormatEnum,
  } as CompressVideoTaskArgs;
};

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressorTask,
    GlobalCompressorConfig,
    "tasks",
    "globalConfig",
    "clearTasks"
  >({
    tasksKey: "tasks",
    configKey: "globalConfig",
    clearActionKey: "clearTasks",
    defaultConfig: defaultCompressorConfig,
    createTaskByPath: (path, config) => {
      const fileType = inferFileTypeFromPath(path);
      if (!fileType) return null;

      const taskId = crypto.randomUUID();
      const args = createDefaultArgs(taskId, path, fileType, config);
      return {
        id: taskId,
        status: "idle",
        progress: 0,
        args,
        fileType,
        taskType:
          fileType === FileType.Audio
            ? MediaTaskType.CompressAudio
            : fileType === FileType.Image || fileType === FileType.Gif
              ? MediaTaskType.CompressImage
              : MediaTaskType.CompressVideo,
      } as CompressorTask;
    },
    queueAdapter: async (tasks) => {
      const settings = useSettingsStore.getState();
      const useHw = settings.useHardwareAcceleration;
      const useUFS = settings.useUltraFastSpeed;

      await getMediaTaskQueue().addTasks(
        tasks.map((task) => {
          const outputDir = settings.getOutputDir(task.args.input_path);
          const outputTitle =
            task.outputTitle || resolveOutputTitle(task) || extractFilenameFromPath(task.args.input_path);

          if (task.fileType === FileType.Audio) {
            const args = task.args as CompressAudioTaskArgs;
            const outputFormat = args.format || task.mediaDetails?.extension;
            return {
              type: task.taskType,
              args: {
                ...args,
                format: outputFormat,
                output_path: `${outputDir}/${outputTitle}.${outputFormat}`,
                use_hardware_acceleration: useHw,
                use_ultra_fast_speed: useUFS,
              },
            };
          }

          if (task.fileType === FileType.Image || task.fileType === FileType.Gif) {
            const args = task.args as CompressImageTaskArgs;
            return {
              type: task.taskType,
              args: {
                ...args,
                output_path: `${outputDir}/${outputTitle}.${args.format}`,
                use_hardware_acceleration: useHw,
                use_ultra_fast_speed: useUFS,
              },
            };
          }

          const args = task.args as CompressVideoTaskArgs;
          const outputFormat = args.format || FormatEnum.MP4;
          return {
            type: task.taskType,
            args: {
              ...args,
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
