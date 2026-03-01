import { create } from "zustand";
import { FileType, MediaTaskType, CompressingTask } from "../../../types/tasks";
import { CompressAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { AUDIO_CONTAINER_DEFINITIONS } from "@/data/capabilities";
import { FormatEnum, AudioEncoderEnum } from "@/types/options";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { getAudioCompressionPresetByRatio } from "./compressionPreset";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";

type BaseAudioCompressionConfig = Omit<CompressAudioTaskArgs, "task_id" | "input_path" | "output_path">;
const format = FormatEnum.OGG;
const codec = AUDIO_CONTAINER_DEFINITIONS[format]?.allowedEncoders[0] as AudioEncoderEnum;

const baseAudioCompressionConfig: BaseAudioCompressionConfig = {
  input_file_type: FileType.Audio,
  format: format,
  codec: codec,
  ratio: 50,
};

export const defaultAudioCompressionConfig: BaseAudioCompressionConfig = {
  ...baseAudioCompressionConfig,
  ...getAudioCompressionPresetByRatio(
    baseAudioCompressionConfig.ratio,
    baseAudioCompressionConfig.format,
  ).patch,
};

type CompressorStore = CreateTaskStoreState<
  CompressingTask,
  BaseAudioCompressionConfig,
  Partial<CompressAudioTaskArgs>,
  "compressingTasks",
  "audioConfig",
  "clearCompressingTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingTask,
    BaseAudioCompressionConfig,
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
        output_path: "",
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
    applyToTaskArgs: (task, config) => {
      const clonedTask = structuredClone(task);
      const clonedConfig = structuredClone(config);

      clonedTask.args = {
        ...clonedTask.args,
        ...clonedConfig,
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
          const outputFormat = task.args.format || defaultAudioCompressionConfig.format;
          console.log("Compressing task media details", JSON.stringify(task.mediaDetails));
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
