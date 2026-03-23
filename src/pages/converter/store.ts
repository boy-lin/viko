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
  AudioTrackConfig,
  ConvertAudioTaskArgs,
  ConvertImageTaskArgs,
  ConvertVideoTaskArgs,
} from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import {
  ActiveCategoryEnum,
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

export interface GlobalConverterConfig
  extends Pick<ConverterTask, "taskType" | "activeCategory"> {
  args: Partial<ConversionConfig>;
}

export const defaultConverterConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertToVideo,
  activeCategory: FileType.Video,
  args: {
    format: FormatEnum.MP4,
  },
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

const normalizeTargetCategory = (
  activeCategory?: FileType | ActiveCategoryEnum,
  taskType?: MediaTaskType,
  format?: string,
): FileType => {
  if (
    activeCategory === FileType.Video ||
    activeCategory === FileType.Audio ||
    activeCategory === FileType.Image
  ) {
    return activeCategory;
  }

  if (taskType === MediaTaskType.ConvertToAudio) {
    return FileType.Audio;
  }
  if (
    taskType === MediaTaskType.ConvertToImage ||
    taskType === MediaTaskType.ConvertToAnimatedImage
  ) {
    return FileType.Image;
  }
  if (taskType === MediaTaskType.ConvertToVideo) {
    return FileType.Video;
  }

  if (format && AUDIO_SUPPORT_FORMATS.includes(format as FormatEnum)) {
    return FileType.Audio;
  }
  if (format && IMAGE_SUPPORT_FORMATS.includes(format as FormatEnum)) {
    return FileType.Image;
  }

  return FileType.Video;
};

const normalizeTargetFormat = (category: FileType, format?: string) => {
  if (category === FileType.Audio) {
    return AUDIO_SUPPORT_FORMATS.includes(format as FormatEnum)
      ? (format as FormatEnum)
      : FormatEnum.MP3;
  }
  if (category === FileType.Image) {
    return IMAGE_SUPPORT_FORMATS.includes(format as FormatEnum)
      ? (format as FormatEnum)
      : FormatEnum.PNG;
  }

  return VIDEO_SUPPORT_FORMATS.includes(format as FormatEnum)
    ? (format as FormatEnum)
    : FormatEnum.MP4;
};

const buildInitialAudioTracks = (
  currentTracks: AudioTrackConfig[] | undefined,
  codec: AudioEncoderEnum | undefined,
) => {
  if (currentTracks && currentTracks.length > 0) {
    return currentTracks.map((track) => ({
      ...track,
      codec: codec ?? track.codec,
    }));
  }

  return [
    {
      source_stream_index: 0,
      codec,
    },
  ];
};

const createInitialArgs = (
  taskId: string,
  inputPath: string,
  config: GlobalConverterConfig,
): ConverterTaskArgs => {
  const category = normalizeTargetCategory(
    config.activeCategory,
    config.taskType,
    config.args.format,
  );
  const format = normalizeTargetFormat(category, config.args.format);

  if (category === FileType.Audio) {
    return {
      task_id: taskId,
      input_path: inputPath,
      format,
      audio_tracks: buildInitialAudioTracks(
        (config.args as Partial<ConvertAudioTaskArgs>).audio_tracks,
        AudioEncoderEnum.MP3,
      ),
      ...config.args,
    } as ConvertAudioTaskArgs;
  }

  if (category === FileType.Image) {
    return {
      task_id: taskId,
      input_path: inputPath,
      format,
      ...config.args,
    } as ConvertImageTaskArgs;
  }

  return {
    task_id: taskId,
    input_path: inputPath,
    format,
    audio_tracks: buildInitialAudioTracks(
      (config.args as Partial<ConvertVideoTaskArgs>).audio_tracks,
      undefined,
    ),
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
      const fileType = inferFileTypeFromPath(path);
      if (!fileType) return null;

      const taskId = crypto.randomUUID();
      const args = createInitialArgs(taskId, path, config);
      const activeCategory = normalizeTargetCategory(
        config.activeCategory,
        config.taskType,
        args.format,
      );

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
