import {
  MediaDetailsWithResolve,
  MediaTaskType,
  FileType,
} from "@/types/tasks";
import {
  CompressAudioTaskArgs,
  CompressImageTaskArgs,
  CompressVideoTaskArgs,
} from "@/lib/mediaTaskEvent";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";

import { CompressorTask, GlobalCompressorConfig } from "./store";
import { buildDefaultTaskDetailsUpdates as buildVideoDefaults } from "./videos/compressionPreset";
import { buildDefaultAudioArgs } from "./audios/compressionPreset";
import { buildDefaultImageArgs } from "./images/compressionPreset";

export const buildTaskDefaultsFromDetails = (
  task: CompressorTask,
  details: MediaDetailsWithResolve,
): Partial<CompressorTask> => {
  if (task.fileType === FileType.Audio) {
    return {
      mediaDetails: details,
      args: buildDefaultAudioArgs(task as any, details),
      fileType: FileType.Audio,
      taskType: MediaTaskType.CompressAudio,
      outputTitle: details.title,
    };
  }

  if (task.fileType === FileType.Image || task.fileType === FileType.Gif) {
    return {
      mediaDetails: details,
      args: buildDefaultImageArgs(task as any, details),
      fileType: FileType.Image,
      taskType: MediaTaskType.CompressImage,
      outputTitle: details.title,
    };
  }

  return buildVideoDefaults(task as any, details) as Partial<CompressorTask>;
};

export const buildTaskArgsFromGlobalConfig = (
  task: CompressorTask,
  config: GlobalCompressorConfig,
): Partial<CompressorTask> => {
  if (task.fileType === FileType.Audio) {
    return {
      args: {
        ...(task.args as CompressAudioTaskArgs),
        ratio: config.args.ratio ?? 50,
      },
    };
  }

  if (task.fileType === FileType.Image || task.fileType === FileType.Gif) {
    return {
      args: {
        ...(task.args as CompressImageTaskArgs),
        ratio: config.args.ratio ?? 50,
        quality: config.args.quality ?? config.args.ratio ?? 50,
      },
    };
  }

  return {
    args: {
      ...(task.args as CompressVideoTaskArgs),
      ratio: config.args.ratio ?? 20,
      format:
        (task.args as CompressVideoTaskArgs).format ??
        ((task.mediaDetails?.extension as FormatEnum) || FormatEnum.MP4),
    },
  };
};

export const createInitialGlobalConfigFromFileType = (
  fileType: FileType | null,
): GlobalCompressorConfig => {
  if (fileType === FileType.Audio) {
    return { args: { ratio: 50 } };
  }
  if (fileType === FileType.Image || fileType === FileType.Gif) {
    return { args: { ratio: 50, quality: 50 } };
  }
  return {
    args: {
      ratio: 20,
      quality: 50,
    },
  };
};

export const createInitialTaskArgsForFileType = (
  task: CompressorTask,
  fileType: FileType,
  globalConfig: GlobalCompressorConfig,
) => {
  if (fileType === FileType.Audio) {
    return {
      ...(task.args as CompressAudioTaskArgs),
      codec: AudioEncoderEnum.MP3,
      ratio: globalConfig.args.ratio ?? 50,
    };
  }
  if (fileType === FileType.Image || fileType === FileType.Gif) {
    return {
      ...(task.args as CompressImageTaskArgs),
      ratio: globalConfig.args.ratio ?? 50,
      quality: globalConfig.args.quality ?? 50,
    };
  }
  return {
    ...(task.args as CompressVideoTaskArgs),
    ratio: globalConfig.args.ratio ?? 20,
  };
};
