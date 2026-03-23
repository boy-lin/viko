import { create } from "zustand";
import { isAudioFormat, isVideoFormat } from "@/data/formats";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import {
  createTaskStore,
  CreateTaskStoreState,
  resolveOutputTitle,
} from "@/lib/createTaskStore";
import { DenoiseTaskArgs } from "@/lib/mediaTaskEvent";
import { getExtension } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { FFmpegTask, FileType, MediaTaskType } from "@/types/tasks";
import { DEFAULT_DENOISE_FILTER_CONFIG } from "./config";

export interface DenoiseTask extends FFmpegTask {
  args: DenoiseTaskArgs;
}

export interface GlobalDenoiseConfig {
  taskType: FFmpegTask["taskType"];
  args: Pick<DenoiseTaskArgs, "engine" | "filter">;
}

export const defaultDenoiseConfig: GlobalDenoiseConfig = {
  taskType: MediaTaskType.ConvertDenoise,
  args: {
    engine: "ffmpeg",
    filter: { ...DEFAULT_DENOISE_FILTER_CONFIG },
  },
};

type DenoiseStore = CreateTaskStoreState<
  DenoiseTask,
  GlobalDenoiseConfig,
  "tasks",
  "globalConfig",
  "clearTasks"
>;

const resolveFileType = (path: string): FileType | null => {
  const ext = (getExtension(path) || "").toLowerCase();
  if (isVideoFormat(ext)) return FileType.Video;
  if (isAudioFormat(ext)) return FileType.Audio;
  return null;
};

const fallbackFormatByType = (fileType: FileType): string =>
  fileType === FileType.Video ? "mp4" : "mp3";

export const useDenoiseStore = create<DenoiseStore>(
  createTaskStore<
    DenoiseTask,
    GlobalDenoiseConfig,
    "tasks",
    "globalConfig",
    "clearTasks"
  >({
    tasksKey: "tasks",
    configKey: "globalConfig",
    clearActionKey: "clearTasks",
    defaultConfig: defaultDenoiseConfig,
    createTaskByPath: (path, config) => {
      const fileType = resolveFileType(path);
      if (!fileType) return null;
      const outputArgs: DenoiseTaskArgs = {
        ...config.args,
        task_id: crypto.randomUUID(),
        input_path: path,
        input_file_type: fileType,
        format: getExtension(path) || fallbackFormatByType(fileType),
      };
      return {
        ...config,
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType,
      };
    },
    queueAdapter: async (tasks) => {
      const settings = useSettingsStore.getState();
      const useHw = settings.useHardwareAcceleration;
      const useUFS = settings.useUltraFastSpeed;

      await getMediaTaskQueue().addTasks(
        tasks.map((task) => {
          const outputDir = settings.getOutputDir(task.args.input_path);
          const outputTitle = resolveOutputTitle(task);
          const ext =
            task.args.format ||
            getExtension(task.args.input_path) ||
            fallbackFormatByType(task.fileType);
          return {
            type: MediaTaskType.ConvertDenoise,
            args: {
              ...task.args,
              output_path: `${outputDir}/${outputTitle}.${ext}`,
              use_hardware_acceleration: useHw,
              use_ultra_fast_speed: useUFS,
            },
          };
        }),
        "normal",
        "denoise-media",
      );
    },
  }),
);

