import { create } from "zustand";
import { FileType, MediaTaskType, CompressingTask } from "../../../types/tasks";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { getVideoCompressionPresetByRatio } from "./compressionPreset";
import { FormatEnum } from "@/types/options";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";

export const defaultVideoCompressionConfig = getVideoCompressionPresetByRatio(50, FormatEnum.MP4).patch as CompressVideoTaskArgs;

type CompressorStore = CreateTaskStoreState<
  CompressingTask,
  CompressVideoTaskArgs,
  Partial<CompressVideoTaskArgs>,
  "compressingTasks",
  "videoConfig",
  "clearCompressingTasks"
>;

export const useCompressorStore = create<CompressorStore>(
  createTaskStore<
    CompressingTask,
    CompressVideoTaskArgs,
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
