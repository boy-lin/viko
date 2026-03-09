import { create } from "zustand";
import { FileType, MediaTaskType, FFmpegTask } from "../../../types/tasks";
import { CompressAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { createTaskStore, CreateTaskStoreState } from "@/lib/createTaskStore";
import { extractFilenameFromPath } from "@/lib/utils";

export interface CompressingAudioTask extends FFmpegTask {
  args: CompressAudioTaskArgs;
}

type BaseAudioCompressionConfig = Pick<CompressAudioTaskArgs, "ratio">;

export const baseAudioCompressionConfig: BaseAudioCompressionConfig = {
  ratio: 50,
};

type CompressorStore = CreateTaskStoreState<
  CompressingAudioTask,
  BaseAudioCompressionConfig,
  CompressAudioTaskArgs,
  "compressingTasks",
  "audioConfig",
  "clearCompressingTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingAudioTask,
    BaseAudioCompressionConfig,
    CompressAudioTaskArgs,
    "compressingTasks",
    "audioConfig",
    "clearCompressingTasks"
  >({
    tasksKey: "compressingTasks",
    configKey: "audioConfig",
    clearActionKey: "clearCompressingTasks",
    defaultConfig: baseAudioCompressionConfig,
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
        fileType: FileType.Audio,
        taskType: MediaTaskType.CompressAudio,
      } as CompressingAudioTask;
    },
    mergeConfig: (current, patch) => {
      const merged = {
        ...current,
        ...patch,
      } as CompressAudioTaskArgs;
      return merged
    },
    queueAdapter: async (tasks) => {
      const settings = useSettingsStore.getState();
      const useHw = settings.useHardwareAcceleration;
      const useUFS = settings.useUltraFastSpeed;

      await getMediaTaskQueue().addTasks(
        tasks.map((task) => {
          const outputDir = settings.getOutputDir(task.args.input_path);
          const outputTitle = task.outputTitle || extractFilenameFromPath(task.args.input_path);
          const outputFormat = task.args.format || task.mediaDetails?.extension;
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
