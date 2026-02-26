import { create } from "zustand";
import { FileType, MediaTaskType, CompressingTask } from "../../../types/tasks";
import { CompressAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { EncoderEnum } from "@/types/options";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { getAudioCompressionPresetByRatio } from "./compressionPreset";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";

export const defaultAudioCompressionConfig = {
  ...getAudioCompressionPresetByRatio(50, EncoderEnum.MP3).patch,
} as CompressAudioTaskArgs;

type CompressorStore = CreateTaskStoreState<
  CompressingTask,
  CompressAudioTaskArgs,
  Partial<CompressAudioTaskArgs>,
  "compressingTasks",
  "audioConfig",
  "clearCompressingTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingTask,
    CompressAudioTaskArgs,
    Partial<CompressAudioTaskArgs>,
    "compressingTasks",
    "audioConfig",
    "clearCompressingTasks"
  >({
    tasksKey: "compressingTasks",
    configKey: "audioConfig",
    clearActionKey: "clearCompressingTasks",
    defaultConfig: defaultAudioCompressionConfig,
    createTaskByPath: (path, config) => {
      const outputArgs: CompressAudioTaskArgs = {
        ...config,
        task_id: crypto.randomUUID(),
        input_path: path,
      };
      return {
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Audio,
        taskType: MediaTaskType.CompressAudio,
      };
    },
    mergeConfig: (current, patch) => {
      const merged = {
        ...current,
        ...patch,
      } as CompressAudioTaskArgs;

      const presetPatch =
        patch.ratio !== undefined
          ? getAudioCompressionPresetByRatio(patch.ratio, merged.format).patch
          : {};

      return {
        ...current,
        ...presetPatch,
        ...patch,
      } as CompressAudioTaskArgs;
    },
    applyConfigToTask: (task, config) => ({
      ...task,
      args: {
        ...task.args,
        ...config,
      },
    }),
    queueAdapter: async (tasks) => {
      const settings = useSettingsStore.getState();
      const useHw = settings.useHardwareAcceleration;
      const useUFS = settings.useUltraFastSpeed;

      await getMediaTaskQueue().addCompressTasks(
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
