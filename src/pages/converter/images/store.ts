import { create } from "zustand";
import { ConverterTask, FileType, MediaTaskType } from "@/types/tasks";
import { FormatEnum } from "@/types/options";
import { useSettingsStore } from "@/stores/settingsStore";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { createTaskStore, CreateTaskStoreState, resolveOutputTitle } from "@/lib/createTaskStore";
import { ConvertImageTaskArgs } from "@/lib/mediaTaskEvent";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "args" | "activeCategory"> {}

export const defaultVideoConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertImage,
  activeCategory: FileType.Image,
  args: {
    format: FormatEnum.PNG,
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
    defaultConfig: defaultVideoConfig,
    createTaskByPath: (path, config) => {
      const outputArgs: ConvertImageTaskArgs = {
        ...config.args,
        task_id: crypto.randomUUID(),
        input_path: path,
        format: FormatEnum.PNG,
      };
      return {
        ...config,
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Image,
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
    applyConfigToTask: (task, config) => ({
      ...task,
      taskType: config.taskType,
      args: {
        ...task.args,
        ...config.args,
      },
    }),
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
