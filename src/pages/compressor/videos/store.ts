import { create } from "zustand";
import { FFmpegTask, FileType, MediaTaskType } from "../../../types/tasks";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { getVideoCompressionPresetByRatio } from "./compressionPreset";
import { FormatEnum } from "@/types/options";
import {
  createTaskStore,
  CreateTaskStoreState,
  resolveOutputTitle,
} from "@/lib/createTaskStore";

export interface CompressingTask extends FFmpegTask {
  args: CompressVideoTaskArgs;
}

export type BaseVideoCompressionConfig = Pick<
  CompressVideoTaskArgs,
  "ratio"
>;

export const baseVideoCompressionConfig: BaseVideoCompressionConfig = {
  ratio: 20,
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

const mergeAudioTracks = (
  currentTracks: AudioTrackLike[] = [],
  patchTracks: AudioTrackLike[] = [],
) => {
  const mergedTracks = currentTracks.map((track) => ({ ...track }));

  patchTracks.forEach((patchTrack, patchIndex) => {
    const patchTrackKey = patchTrack.source_stream_index;
    const matchedIndex = mergedTracks.findIndex(
      (currentTrack, currentIndex) => {
        const currentTrackKey = currentTrack.source_stream_index;
        return patchTrackKey !== undefined
          ? currentTrackKey === patchTrackKey
          : currentIndex === patchIndex;
      },
    );

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
    defaultConfig: baseVideoCompressionConfig,
    createTaskByPath: (path, config) => {
      const outputArgs = {
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
      } as CompressingTask;
    },
    mergeConfig: (current, patch) => ({
      ...current,
      ...patch,
    }),
    applyToTaskArgs: (task, config) => {
      const clonedTask = structuredClone(task);
      const clonedConfig = structuredClone(config);
      const taskArgs = clonedTask.args as CompressVideoTaskArgs;
      const configRatio = (clonedConfig as Partial<CompressVideoTaskArgs>).ratio;

      let ratioDrivenPatch: Partial<CompressVideoTaskArgs> = {};
      if (typeof configRatio === "number") {
        const format = (taskArgs.format || FormatEnum.MP4) as FormatEnum;
        const ratioPreset = getVideoCompressionPresetByRatio(
          configRatio,
          format,
          taskArgs.source_audio_tracks ?? taskArgs.audio_tracks,
          {
            sourceCodec: taskArgs.codec,
            videoBitrateKbps: taskArgs.source_video_bitrate,
            frameRate: taskArgs.source_frame_rate,
            keyframeInterval: taskArgs.source_keyframe_interval,
          },
        );
        ratioDrivenPatch = { ...ratioPreset.patch };
        delete ratioDrivenPatch.codec;
      }

      const taskAudioTracks = (taskArgs.audio_tracks ?? []) as AudioTrackLike[];
      const patchAudioTracks = (
        ({ ...ratioDrivenPatch, ...clonedConfig } as Partial<CompressVideoTaskArgs>)
          .audio_tracks ?? []
      ) as AudioTrackLike[];
      const mergedAudioTracks = mergeAudioTracks(
        taskAudioTracks,
        patchAudioTracks,
      );

      clonedTask.args = {
        ...taskArgs,
        ...ratioDrivenPatch,
        ...clonedConfig,
        ...(mergedAudioTracks.length > 0
          ? { audio_tracks: mergedAudioTracks }
          : {}),
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
