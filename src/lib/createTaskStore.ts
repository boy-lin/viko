import { StateCreator } from "zustand";
import { AudioTrackConfig } from "@/lib/mediaTaskEvent";

export type TaskWithIndex = {
  id: string;
  status: string;
  args: any;
};


type WithTaskList<TTask, TTasksKey extends string> = Record<TTasksKey, TTask[]>;
type WithConfig<TConfig, TConfigKey extends string> = Record<TConfigKey, TConfig>;
type WithClearAction<TClearActionKey extends string> = Record<TClearActionKey, () => void>;

export type CreateTaskStoreState<
  TTask extends TaskWithIndex,
  TConfig,
  TTasksKey extends string,
  TConfigKey extends string,
  TClearActionKey extends string,
> = WithTaskList<TTask, TTasksKey> &
  WithConfig<TConfig, TConfigKey> &
  WithClearAction<TClearActionKey> & {
    taskIndexById: Record<string, number>;
    addTasksByPaths: (paths: string[]) => void;
    updateTaskById: (id: string, updates: Partial<TTask>) => void;
    applyConfigToAllTasks: (config: TConfig) => void;
    removeTask: (id: string) => void;
    updateGlobalConfig: (config: Partial<TConfig>) => void | Promise<void>;
    pushTasksToQueue: (tasks?: TTask[]) => Promise<void>;
  };

type CreateTaskStoreOptions<
  TTask extends TaskWithIndex,
  TConfig,
  TTasksKey extends string,
  TConfigKey extends string,
  TClearActionKey extends string,
> = {
  tasksKey: TTasksKey;
  configKey: TConfigKey;
  clearActionKey: TClearActionKey;
  defaultConfig: TConfig;
  createTaskByPath: (path: string, config: TConfig) => TTask | null;
  queueAdapter: (tasks: TTask[]) => Promise<void>;
  shouldRemoveTask?: (task: TTask) => boolean;
};

const appendTaskIndex = <TTask extends TaskWithIndex>(
  currentIndex: Record<string, number>,
  currentLength: number,
  newTasks: TTask[],
): Record<string, number> => {
  const nextIndex = { ...currentIndex };
  for (let i = 0; i < newTasks.length; i++) {
    nextIndex[newTasks[i].id] = currentLength + i;
  }
  return nextIndex;
};

const removeTaskAtIndex = <TTask extends TaskWithIndex>(
  tasks: TTask[],
  taskIndexById: Record<string, number>,
  idx: number,
  removedTaskId: string,
) => {
  const nextTasks = tasks.slice();
  nextTasks.splice(idx, 1);

  const nextIndex = { ...taskIndexById };
  delete nextIndex[removedTaskId];
  for (let i = idx; i < nextTasks.length; i++) {
    nextIndex[nextTasks[i].id] = i;
  }

  return { nextTasks, nextIndex };
};


const mergeAudioTracks = (currentTracks: AudioTrackConfig[] = [], patchTracks: AudioTrackConfig[] = []) => {
  const mergedTracks = currentTracks.map((track) => ({ ...track }));

  patchTracks.forEach((patchTrack, patchIndex) => {
    const patchTrackKey = patchTrack.source_stream_index;
    const matchedIndex = mergedTracks.findIndex((currentTrack, currentIndex) => {
      const currentTrackKey = currentTrack.source_stream_index;
      return patchTrackKey !== undefined ? currentTrackKey === patchTrackKey : currentIndex === patchIndex;
    });

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

const mergeTaskUpdate = (
  current: any,
  config: any,
) => {
  const currentArgs = current?.args || {}
  const updatesArgs = config?.args || {}
  const mergedAudioTracks = mergeAudioTracks(
    currentArgs.audio_tracks ?? [],
    updatesArgs.audio_tracks ?? [],
  );
  
  return {
    ...current,
    ...config,
    args: {
      ...currentArgs,
      ...updatesArgs,
      ...(mergedAudioTracks.length > 0 ? { audio_tracks: mergedAudioTracks } : {}),
    },
  };
};

export function createTaskStore<
  TTask extends TaskWithIndex,
  TConfig,
  TTasksKey extends string,
  TConfigKey extends string,
  TClearActionKey extends string,
>(
  options: CreateTaskStoreOptions<
    TTask,
    TConfig,
    TTasksKey,
    TConfigKey,
    TClearActionKey
  >,
): StateCreator<
  CreateTaskStoreState<
    TTask,
    TConfig,
    TTasksKey,
    TConfigKey,
    TClearActionKey
  >
> {
  const {
    tasksKey,
    configKey,
    clearActionKey,
    defaultConfig,
    createTaskByPath,
    queueAdapter,
    shouldRemoveTask = (task) => ["finished", "cancelled"].includes(task.status),
  } = options;

  return (set, get) => ({
    [tasksKey]: [],
    taskIndexById: {},
    [configKey]: defaultConfig,
    addTasksByPaths: (paths: string[]) => {
      const state = get() as CreateTaskStoreState<
        TTask,
        TConfig,
        TTasksKey,
        TConfigKey,
        TClearActionKey
      >;
      const config = state[configKey];
      const newTasks: TTask[] = [];

      for (const path of paths) {
        if (!path) continue;
        const task = createTaskByPath(path, config);
        if (task) newTasks.push(task);
      }

      if (newTasks.length === 0) return;

      set((currentState) => {
        const currentTasks = currentState[tasksKey] as TTask[];
        return {
          [tasksKey]: [...currentTasks, ...newTasks],
          taskIndexById: appendTaskIndex(
            currentState.taskIndexById,
            currentTasks.length,
            newTasks,
          ),
        } as Partial<
          CreateTaskStoreState<
            TTask,
            TConfig,
            TTasksKey,
            TConfigKey,
            TClearActionKey
          >
        >;
      });
    },
    [clearActionKey]: () => {
      set({
        [tasksKey]: [],
        taskIndexById: {},
      } as Partial<
        CreateTaskStoreState<
          TTask,
          TConfig,
          TTasksKey,
          TConfigKey,
          TClearActionKey
        >
      >);
    },
    applyConfigToAllTasks: (config) => {
      set((state) => {
        const tasks = state[tasksKey] as TTask[];
        const nextTasks = tasks.map((task) => mergeTaskUpdate(task, config));
        const nextIndex = nextTasks.reduce<Record<string, number>>((acc, task, idx) => {
          acc[task.id] = idx;
          return acc;
        }, {});

        return {
          [tasksKey]: nextTasks,
          taskIndexById: nextIndex,
        } as Partial<
          CreateTaskStoreState<
            TTask,
            TConfig,
            TTasksKey,
            TConfigKey,
            TClearActionKey
          >
        >;
      });
    },
    updateTaskById: (id: string, updates) => {
      const idx = get().taskIndexById[id];
      if (idx === undefined) return;

      set((state) => {
        const tasks = state[tasksKey] as TTask[];
        const current = tasks[idx];
        if (!current) return {};

        const updatedTask = mergeTaskUpdate(current, updates);
        if (shouldRemoveTask(updatedTask)) {
          const { nextTasks, nextIndex } = removeTaskAtIndex(
            tasks,
            state.taskIndexById,
            idx,
            current.id,
          );
          return {
            [tasksKey]: nextTasks,
            taskIndexById: nextIndex,
          } as Partial<
            CreateTaskStoreState<
              TTask,
              TConfig,
              TTasksKey,
              TConfigKey,
              TClearActionKey
            >
          >;
        }

        const nextTasks = tasks.slice();
        nextTasks[idx] = updatedTask;
        return {
          [tasksKey]: nextTasks,
        } as Partial<
          CreateTaskStoreState<
            TTask,
            TConfig,
            TTasksKey,
            TConfigKey,
            TClearActionKey
          >
        >;
      });
    },
    removeTask: (id: string) => {
      const idx = get().taskIndexById[id];
      if (idx === undefined) return;

      set((state) => {
        const tasks = state[tasksKey] as TTask[];
        const { nextTasks, nextIndex } = removeTaskAtIndex(
          tasks,
          state.taskIndexById,
          idx,
          id,
        );
        return {
          [tasksKey]: nextTasks,
          taskIndexById: nextIndex,
        } as Partial<
          CreateTaskStoreState<
            TTask,
            TConfig,
            TTasksKey,
            TConfigKey,
            TClearActionKey
          >
        >;
      });
    },
    updateGlobalConfig: (patch: Partial<TConfig>) => {
      set((state) => {
        const currentConfig = state[configKey] as TConfig;
        return {
          [configKey]: mergeTaskUpdate(currentConfig, patch),
        } as Partial<
          CreateTaskStoreState<
            TTask,
            TConfig,
            TTasksKey,
            TConfigKey,
            TClearActionKey
          >
        >;
      });
    },
    pushTasksToQueue: async (tasks?: TTask[]) => {
      const state = get();
      const tasksToPush = tasks || (state[tasksKey] as TTask[]);
      if (tasksToPush.length === 0) return;
      await queueAdapter(tasksToPush);
      tasksToPush.forEach((task) => {
        get().updateTaskById(task.id, {
          status: "queued",
          progress: 0,
          errorMessage: undefined,
        } as unknown as Partial<TTask>);
      });
    },
  }) as CreateTaskStoreState<
    TTask,
    TConfig,
    TTasksKey,
    TConfigKey,
    TClearActionKey
  >;
}

export const resolveOutputTitle = (task: TaskWithIndex): string => {
  const args = task.args as { title?: string; input_path?: string };
  const explicitTitle = args.title?.trim();
  if (explicitTitle) return explicitTitle;

  const inputPath = args.input_path || "";
  const fileName = inputPath.split(/[\\/]/).pop() || "";
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  if (baseName) return baseName;

  return `untitled-${task.id.slice(0, 8)}`;
};
