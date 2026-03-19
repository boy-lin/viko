import { create } from "zustand";
import { FileType, MediaTaskType, FFmpegTask } from "../../../types/tasks";
import { CompressAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useSettingsStore } from "@/stores/settingsStore";
import { createTaskStore, CreateTaskStoreState } from "@/lib/createTaskStore";
import { extractFilenameFromPath } from "@/lib/utils";
import { AudioEncoderEnum } from "@/types/options";

export interface CompressingAudioTask extends FFmpegTask<CompressAudioTaskArgs> {
}

export interface GlobalAudioCompressionConfig extends Pick<CompressingAudioTask, "taskType" | "fileType"> {
  args: Partial<CompressAudioTaskArgs>;
}

export const defaultAudioCompressionConfig: GlobalAudioCompressionConfig = {
  taskType: MediaTaskType.CompressAudio,
  fileType: FileType.Audio,
  args: {
    ratio: 50,
  },
};
type CompressorStore = CreateTaskStoreState<
  CompressingAudioTask,
  GlobalAudioCompressionConfig,
  "compressingTasks",
  "audioConfig",
  "clearCompressingTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingAudioTask,
    GlobalAudioCompressionConfig,
    "compressingTasks",
    "audioConfig",
    "clearCompressingTasks"
  >({
    tasksKey: "compressingTasks",
    configKey: "audioConfig",
    clearActionKey: "clearCompressingTasks",
    defaultConfig: defaultAudioCompressionConfig,
    createTaskByPath: (path, config) => {
      const outputArgs = {
        codec: AudioEncoderEnum.MP3,
        ratio: 50,
        ...config.args,
        task_id: crypto.randomUUID(),
        input_path: path,
        output_path: path,
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
