import { create } from "zustand";
import { FileType, MediaTaskType, CompressingTask } from "../../../types/tasks";
import { CompressImageTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { getImageCompressionPresetByQuality } from "./compressionPreset";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";

const baseDefaultImageCompressionConfig = {
  format: "jpg",
  quality: 80,
  color_mode: "RGB",
  dpi: 72,
  strip_metadata: true,
  keep_transparency: true,
  crop_whitespace: false,
} as CompressImageTaskArgs;

export const defaultImageCompressionConfig = {
  ...baseDefaultImageCompressionConfig,
  ...getImageCompressionPresetByQuality(
    baseDefaultImageCompressionConfig.quality,
    baseDefaultImageCompressionConfig.format,
  ).patch,
} as CompressImageTaskArgs;

type CompressorStore = CreateTaskStoreState<
  CompressingTask,
  CompressImageTaskArgs,
  Partial<CompressImageTaskArgs>,
  "compressingTasks",
  "imageConfig",
  "clearCompressingTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingTask,
    CompressImageTaskArgs,
    Partial<CompressImageTaskArgs>,
    "compressingTasks",
    "imageConfig",
    "clearCompressingTasks"
  >({
    tasksKey: "compressingTasks",
    configKey: "imageConfig",
    clearActionKey: "clearCompressingTasks",
    defaultConfig: defaultImageCompressionConfig,
    createTaskByPath: (path, config) => {
      const outputArgs: CompressImageTaskArgs = {
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
        fileType: FileType.Image,
        taskType: MediaTaskType.CompressImage,
      };
    },
    mergeConfig: (current, patch) => {
      const merged = {
        ...current,
        ...patch,
      } as CompressImageTaskArgs;

      const presetPatch =
        patch.quality !== undefined
          ? getImageCompressionPresetByQuality(patch.quality, merged.format).patch
          : {};

      return {
        ...current,
        ...presetPatch,
        ...patch,
      } as CompressImageTaskArgs;
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
