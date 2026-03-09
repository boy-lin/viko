import { StateCreator } from "zustand";

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
  TApplyConfig,
  TTasksKey extends string,
  TConfigKey extends string,
  TClearActionKey extends string,
> = WithTaskList<TTask, TTasksKey> &
  WithConfig<TConfig, TConfigKey> &
  WithClearAction<TClearActionKey> & {
    taskIndexById: Record<string, number>;
    addTasksByPaths: (paths: string[]) => void;
    updateTaskById: (id: string, updates: Partial<TTask>) => void;
    applyToTaskArgs: (task: TTask, args: TApplyConfig) => TTask;
    applyConfigToAllTasks: (args: TApplyConfig) => void;
    removeTask: (id: string) => void;
    updateGlobalConfig: (config: Partial<TConfig>) => void | Promise<void>;
    pushTasksToQueue: (tasks?: TTask[]) => Promise<void>;
  };

type CreateTaskStoreOptions<
  TTask extends TaskWithIndex,
  TConfig,
  TApplyConfig,
  TTasksKey extends string,
  TConfigKey extends string,
  TClearActionKey extends string,
> = {
  tasksKey: TTasksKey;
  configKey: TConfigKey;
  clearActionKey: TClearActionKey;
  defaultConfig: TConfig;
  createTaskByPath: (path: string, config: TConfig) => TTask | null;
  mergeConfig: (current: TConfig, patch: Partial<TConfig>) => TConfig;
  applyToTaskArgs?: (task: TTask, args: TApplyConfig) => TTask;
  queueAdapter: (tasks: TTask[]) => Promise<void>;
  shouldRemoveTask?: (task: TTask) => boolean;
};

const defaultApplyToTaskArgs = <
  TTask extends TaskWithIndex,
  TApplyConfig,
>(
  task: TTask,
  args: TApplyConfig,
): TTask => {
  const clonedTask = structuredClone(task);
  const clonedArgs = structuredClone(args);

  clonedTask.args = {
    ...clonedTask.args,
    ...clonedArgs,
  };
  return clonedTask;
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

const mergeTaskUpdate = <TTask extends TaskWithIndex>(
  current: TTask,
  updates: Partial<TTask>,
): TTask => {
  const currentArgs = current.args;
  const updatesArgs = updates.args || {};
  return {
    ...current,
    ...updates,
    args: {
      ...currentArgs,
      ...updatesArgs,
    } as TTask["args"],
  };
};

export function createTaskStore<
  TTask extends TaskWithIndex,
  TConfig,
  TApplyConfig,
  TTasksKey extends string,
  TConfigKey extends string,
  TClearActionKey extends string,
>(
  options: CreateTaskStoreOptions<
    TTask,
    TConfig,
    TApplyConfig,
    TTasksKey,
    TConfigKey,
    TClearActionKey
  >,
): StateCreator<
  CreateTaskStoreState<
    TTask,
    TConfig,
    TApplyConfig,
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
    mergeConfig,
    applyToTaskArgs = defaultApplyToTaskArgs,
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
        TApplyConfig,
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
            TApplyConfig,
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
          TApplyConfig,
          TTasksKey,
          TConfigKey,
          TClearActionKey
        >
      >);
    },
    applyToTaskArgs: (task, args) => {
      return applyToTaskArgs(task, args);
    },
    applyConfigToAllTasks: (args) => {
      set((state) => {
        const tasks = state[tasksKey] as TTask[];
        const nextTasks = tasks.map((task) => applyToTaskArgs(task, args));
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
            TApplyConfig,
            TTasksKey,
            TConfigKey,
            TClearActionKey
          >
        >;
      });
    },
    updateTaskById: (id: string, updates: Partial<TTask>) => {
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
              TApplyConfig,
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
            TApplyConfig,
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
            TApplyConfig,
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
          [configKey]: mergeConfig(currentConfig, patch),
        } as Partial<
          CreateTaskStoreState<
            TTask,
            TConfig,
            TApplyConfig,
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
    TApplyConfig,
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
