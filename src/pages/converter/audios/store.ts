import { create } from "zustand";
import { ConverterTask, FileType, MediaTaskType } from "@/types/tasks";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";
import { ConvertAudioTaskArgs } from "@/lib/mediaTaskEvent";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "args" | "activeCategory"> {}

type AudioTrackLike = {
  source_stream_index?: number;
  [key: string]: unknown;
};

const mergeAudioTracks = (currentTracks: AudioTrackLike[] = [], patchTracks: AudioTrackLike[] = []) => {
  const mergedTracks = currentTracks.map((track) => ({ ...track }));

  patchTracks.forEach((patchTrack, patchIndex) => {
    const patchTrackKey = patchTrack.source_stream_index;
    const matchedIndex = mergedTracks.findIndex((currentTrack, currentIndex) => {
      const currentTrackKey = currentTrack.source_stream_index;
      return patchTrackKey !== undefined ? currentTrackKey === patchTrackKey : currentIndex === patchIndex;
    });

    if (matchedIndex >= 0) {
      mergedTracks[matchedIndex] = {
        ...mergedTracks[matchedIndex],
        ...patchTrack,
      };
      return;
    }

    mergedTracks.push({ ...patchTrack });
  });

  return mergedTracks;
};

export const defaultAudioConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertAudio,
  activeCategory: FileType.Audio,
  args: {
    format: FormatEnum.MP3,
    audio_tracks: [{
      source_stream_index: 0,
      codec: AudioEncoderEnum.MP3,
    }],
  } as ConverterTask["args"],
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
    defaultConfig: defaultAudioConfig,
    createTaskByPath: (path, config) => {
      const outputArgs: ConvertAudioTaskArgs = {
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
        fileType: FileType.Audio,
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
    applyToTaskArgs: (task, config) => {
      const clonedTask = structuredClone(task);
      const clonedArgs = structuredClone(config.args);

      clonedTask.taskType = config.taskType;
      const mergedAudioTracks = mergeAudioTracks(
        (clonedTask.args as AudioTrackLike & { audio_tracks?: AudioTrackLike[] }).audio_tracks,
        (clonedArgs as AudioTrackLike & { audio_tracks?: AudioTrackLike[] }).audio_tracks,
      );

      clonedTask.args = {
        ...clonedTask.args,
        ...clonedArgs,
        ...(mergedAudioTracks.length > 0 ? { audio_tracks: mergedAudioTracks } : {}),
      };

      return clonedTask;
    },
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
