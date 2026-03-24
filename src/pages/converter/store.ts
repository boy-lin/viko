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
  ConvertAudioTaskArgs,
  ConvertImageTaskArgs,
  ConvertVideoTaskArgs,
} from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { FormatEnum } from "@/types/options";
import {
  ConversionConfig,
  FFmpegTask,
  FileType,
  MediaTaskType,
} from "@/types/tasks";

export type ConverterTaskArgs =
  | ConvertVideoTaskArgs
  | ConvertAudioTaskArgs
  | ConvertImageTaskArgs;

export interface ConverterTask extends FFmpegTask<ConverterTaskArgs> {}

export interface GlobalConverterConfig extends Pick<
  ConverterTask,
  "taskType" | "activeCategory"
> {
  args: Partial<ConversionConfig>;
}

export const defaultConverterConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertToVideo,
  args: { },
};

type ConverterStore = CreateTaskStoreState<
  ConverterTask,
  GlobalConverterConfig,
  "tasks",
  "globalConfig",
  "clearTasks"
>;

const normalizeExtension = (path: string) =>
  path.split(".").pop()?.toLowerCase() ?? "";

export const inferFileTypeFromPath = (extension: string): FileType | null => {
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

const normalizeTargetCategory = (format?: string): FileType => {
  if (format && AUDIO_SUPPORT_FORMATS.includes(format)) {
    return FileType.Audio;
  }
  if (format && IMAGE_SUPPORT_FORMATS.includes(format)) {
    return FileType.Image;
  }
  if (format && VIDEO_SUPPORT_FORMATS.includes(format)) {
    return FileType.Video;
  }
  throw new Error(`Unsupported format: ${format}`);
};

const createInitialArgs = (
  taskId: string,
  inputPath: string,
  config: GlobalConverterConfig,
): ConverterTaskArgs => {
  const category = normalizeTargetCategory(config.args.format);

  if (category === FileType.Audio) {
    return {
      task_id: taskId,
      input_path: inputPath,
      ...config.args,
    } as ConvertAudioTaskArgs;
  }

  if (category === FileType.Image) {
    return {
      task_id: taskId,
      input_path: inputPath,
      ...config.args,
    } as ConvertImageTaskArgs;
  }

  return {
    task_id: taskId,
    input_path: inputPath,
    ...config.args,
  } as ConvertVideoTaskArgs;
};

const resolveTaskType = (
  category: FileType,
  format: string | undefined,
): MediaTaskType => {
  if (category === FileType.Audio) {
    return MediaTaskType.ConvertToAudio;
  }
  if (category === FileType.Image) {
    return format === FormatEnum.GIF
      ? MediaTaskType.ConvertToAnimatedImage
      : MediaTaskType.ConvertToImage;
  }
  return MediaTaskType.ConvertToVideo;
};

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
    defaultConfig: defaultConverterConfig,
    createTaskByPath: (path, config) => {
      const extension = normalizeExtension(path);
      const fileType = inferFileTypeFromPath(extension);
      if (!fileType) return null;
      config.args.format = extension;
      const taskId = crypto.randomUUID();
      const args = createInitialArgs(taskId, path, config);
      const activeCategory = normalizeTargetCategory(args.format);
      return {
        id: taskId,
        status: "idle",
        progress: 0,
        fileType,
        taskType: resolveTaskType(activeCategory, args.format),
        activeCategory,
        args,
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
        "converter",
      );
    },
  }),
);
