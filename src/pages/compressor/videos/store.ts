import { create } from "zustand";
import { FileType, MediaTaskType, CompressingTask } from "../../../types/tasks";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { getVideoCompressionPresetByRatio } from "./compressionPreset";
import { FormatEnum } from "@/types/options";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";

export type BaseVideoCompressionConfig = Omit<CompressVideoTaskArgs, "input_path" | "task_id">;

const baseVideoCompressionConfig: BaseVideoCompressionConfig = {
  format: FormatEnum.MP4,
  ratio: 50,
  remove_audio: false,
};

export const defaultVideoCompressionConfig: BaseVideoCompressionConfig = {
  ...baseVideoCompressionConfig,
  ...getVideoCompressionPresetByRatio(
    baseVideoCompressionConfig.ratio,
    baseVideoCompressionConfig.format,
  ).patch,
};

type CompressorStore = CreateTaskStoreState<
  CompressingTask,
  BaseVideoCompressionConfig,
  Partial<CompressVideoTaskArgs>,
  "compressingTasks",
  "videoConfig",
  "clearCompressingTasks"
>;

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

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingTask,
    BaseVideoCompressionConfig,
    Partial<CompressVideoTaskArgs>,
    "compressingTasks",
    "videoConfig",
    "clearCompressingTasks"
  >({
    tasksKey: "compressingTasks",
    configKey: "videoConfig",
    clearActionKey: "clearCompressingTasks",
    defaultConfig: defaultVideoCompressionConfig,
    createTaskByPath: (path, config) => {
      const outputArgs: CompressVideoTaskArgs = {
        ...config,
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
      };
    },
    mergeConfig: (current, patch) => ({
      ...current,
      ...patch,
    }),
    applyToTaskArgs: (task, config) => {
      const clonedTask = structuredClone(task);
      const clonedConfig = structuredClone(config);
      const mergedAudioTracks = mergeAudioTracks(
        (clonedTask.args as AudioTrackLike & { audio_tracks?: AudioTrackLike[] }).audio_tracks,
        (clonedConfig as AudioTrackLike & { audio_tracks?: AudioTrackLike[] }).audio_tracks,
      );

      clonedTask.args = {
        ...clonedTask.args,
        ...clonedConfig,
        ...(mergedAudioTracks.length > 0 ? { audio_tracks: mergedAudioTracks } : {}),
      };

      return clonedTask;
    },
    queueAdapter: async (tasks) => {
      const settings = useSettingsStore.getState();
      const useHw = settings.useHardwareAcceleration;
      const useUFS = settings.useUltraFastSpeed;

      await getMediaTaskQueue().addCompressTasks(
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
