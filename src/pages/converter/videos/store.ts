import { create } from "zustand";
import {
  ConverterTask,
  FileType,
  MediaDetails,
} from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";
import { FormatEnum, FormatOption, VideoEncoderEnum } from "@/types/options";
import { formatToDefinition } from "@/data/capabilities";
import { MediaTaskType } from "@/types/tasks";

export enum ActiveCategoryEnum {
  Recents = "recents",
}

export interface GlobalConverterConfig extends Pick<ConverterTask, "taskType" | "args"> {
  activeCategory: FileType.Video | FileType.Audio | FileType.Image | ActiveCategoryEnum.Recents;
}

export const defaultVideoConfig: GlobalConverterConfig = {
  taskType: MediaTaskType.ConvertVideo,
  activeCategory: FileType.Video,
  args: {
    task_id: '',
    input_path: "",
    format: FormatEnum.MP4,
    video_encoder: VideoEncoderEnum.H264
  },
};

interface ConverterState {
  convertingTasks: ConverterTask[];
  isLoading: boolean;
  globalConfig: GlobalConverterConfig;
  formatRecents: FormatOption[];
  addTasksByMediaList: (mediaList: MediaDetails[]) => void;
  addTasksByPaths: (paths: string[]) => void;
  clearConvertingTasks: () => Promise<void>;
  updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
  removeTask: (id: string) => void;
  updateGlobalConfig: (config: Partial<GlobalConverterConfig>) => Promise<void>;
  addToRecents: (format: FormatOption) => Promise<void>;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  convertingTasks: [],
  isLoading: true,
  globalConfig: defaultVideoConfig,
  formatRecents: [],

  addTasksByMediaList: async (mediaList) => {
    const newTasks: ConverterTask[] = [];
    for (const mediaInfo of mediaList) {
      if (!mediaInfo.path) continue;
      const outputDir = useSettingsStore.getState().getOutputDir(mediaInfo.path);
      let taskType = MediaTaskType.ConvertVideo
      let outputArgs: any = {
        task_id: crypto.randomUUID(),
        title: mediaInfo.title,
        input_path: mediaInfo.path,
        output_path: '',
      }
      outputArgs.format = FormatEnum.MP4
      outputArgs.output_path = `${outputDir}/${mediaInfo.title}.${FormatEnum.MP4}`
      const containerDefinition = formatToDefinition.get(FormatEnum.MP4);
      outputArgs.video_encoder = containerDefinition?.video?.defaultEncoder
      outputArgs.audio_tracks = mediaInfo.streams.filter((stream) => stream.codec_type === "audio").map((stream) => {
        return {
          trackIndex: stream.index,
          encoder: containerDefinition?.audio?.defaultEncoder
        }
      })

      newTasks.push({
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        mediaDetails: mediaInfo,
        args: outputArgs,
        fileType: FileType.Image,
        taskType
      });

    }

    if (newTasks.length > 0) {
      set((state) => ({
        convertingTasks: [...state.convertingTasks, ...newTasks],
      }));
    }

  },
  addTasksByPaths: async (paths) => {
    const newTasks: ConverterTask[] = [];
    for (const path of paths) {
      if (!path) continue;
      let outputArgs: any = {
        task_id: crypto.randomUUID(),
        input_path: path,
        output_path: '',
      }
      let taskType = MediaTaskType.ConvertImage;
      outputArgs.format = FormatEnum.MP4
      newTasks.push({
        id: outputArgs.task_id,
        status: "idle",
        progress: 0,
        args: outputArgs,
        fileType: FileType.Image,
        taskType
      });

    }
    if (newTasks.length > 0) {
      set((state) => ({
        convertingTasks: [...state.convertingTasks, ...newTasks],
      }));
    }
  },
  clearConvertingTasks: async () => {
    try {
      // 从状态中删除
      set({
        convertingTasks: [],
      });
      // 停止task任务

    } catch (error) {
      console.error("Failed to clear converting tasks:", error);
    }
  },
  updateTaskById: async (id, updates) => {
    try {
      const { convertingTasks } = get();
      const task =
        convertingTasks.find((t) => t.id === id)
      if (task) {
        const updatedTask = { ...task, ...updates };
        const isFinished = updatedTask.status === "finished";
        const currentState = get();
        if (isFinished) {
          // Remove from converting tasks
          set({
            convertingTasks: currentState.convertingTasks.filter(
              (t) => t.id !== id
            ),
          });
        } else if (updatedTask.status === "error") {
          set({
            convertingTasks: currentState.convertingTasks.filter(
              (t) => t.id !== id
            ),
          });
        } else {
          set({
            convertingTasks: currentState.convertingTasks.map((t) =>
              t.id === id ? updatedTask : t
            ),
          });
        }
      }
    } catch (error) {
      console.error(
        `Failed to update task ${id} with updates:`,
        updates,
        error
      );
    }
  },
  removeTask: async (id: string) => {
    const { convertingTasks } = get();
    set({
      convertingTasks: convertingTasks.filter((t) => t.id !== id),
    });
  },
  updateGlobalConfig: async (config) => {
    const { args, ...rest } = get().globalConfig
    set({
      globalConfig: {
        ...rest,
        ...config,
        args: { ...args, ...config.args }
      }
    });
  },
  addToRecents: async (format: FormatOption) => {
    const { formatRecents } = get();
    // Keep only last 10, remove if exists to push to top
    const newRecents = [
      format,
      ...formatRecents.filter((f) => f.id !== format.id),
    ].slice(0, 10);

    set({ formatRecents: newRecents });
  }
}));
