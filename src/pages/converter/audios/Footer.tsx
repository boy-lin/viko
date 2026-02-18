import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { FormatSelectorPopover } from "@/components/biz-form/format-selector";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { GlobalConverterConfig, useConverterStore } from "./store";
import { getMediaTaskQueue } from "@/lib/bridge";
import { useAppStore } from "@/stores/app";
import { useSettingsStore } from "@/stores/settingsStore";

export const ConverterFooter: React.FC<{}> = () => {
  const globalConfig = useConverterStore((state) => state.globalConfig);
  const convertingTasks = useConverterStore((state) => state.convertingTasks);
  const updateGlobalConfig = useConverterStore(
    (state) => state.updateGlobalConfig
  );
  const clearConvertingTasks = useConverterStore(
    (state) => state.clearConvertingTasks
  );
  const updateTaskById = useConverterStore(
    (state) => state.updateTaskById
  );

  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  React.useEffect(() => {
    const queue = getMediaTaskQueue();
    const handleEvent = (payload: any) => {
      if (payload.task_type !== "convert") return;
      const { task_id, event_type, progress, error_message } = payload;
      const store = useConverterStore.getState();

      const taskExists = store.convertingTasks.some(t => t.id === task_id);
      if (!taskExists && event_type !== 'complete') {
        return;
      }

      if (event_type === "progress") {
        store.updateTaskById(task_id, {
          status: "processing",
          progress: Math.min(100, Math.max(0, progress || 0)),
        });
      } else if (event_type === "complete") {
        store.removeTask(task_id);
        useAppStore.getState().incrementUnreadFinishedCount();
      } else if (event_type === "error") {
        store.updateTaskById(task_id, {
          status: error_message === "Task cancelled" ? "cancelled" : "error",
          errorMessage: error_message,
        });
      }
    };

    const unsubscribe = queue.on(handleEvent);
    return () => {
      unsubscribe();
    };
  }, []);

  const handleFormatChange = (
    config: GlobalConverterConfig
  ) => {
    updateGlobalConfig(config);
  };

  const applyConfigToAllTasks = async (config: GlobalConverterConfig) => {

    const pendingTasks = convertingTasks;
    // 为每个任务设置 config（浅拷贝 globalConfig）
    for (const task of pendingTasks) {
      updateTaskById(task.id, {
        taskType: config.taskType,
        args: config.args,
      });
    }
  };

  const handleConvertAll = async () => {
    const tasks = useConverterStore.getState().convertingTasks
    if (tasks.length > 0 && globalConfig) {

      await getMediaTaskQueue().addConvertTasks(tasks.map((task) => {
        const outputDir = useSettingsStore.getState().getOutputDir(task.args.input_path);
        return {
          kind: task.taskType,
          args: {
            ...task.args,
            output_path: `${outputDir}/${task.args.title}.${task.args.format}`
          }
        }
      }));
    }
  };

  const handleDelete = async () => {
    const hasRunningTasks = await getMediaTaskQueue().hasRunningTasksByType();

    if (!hasRunningTasks) {
      // 没有运行中的任务，直接清空
      await clearConvertingTasks();
      await getMediaTaskQueue().clearQueueByType();
    } else {
      // 有运行中的任务，打开确认弹窗
      setIsDeletePopoverOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    // 清空队列
    await getMediaTaskQueue().clearQueueByType();
    // 清空转换中的任务
    await clearConvertingTasks();
    // 关闭弹窗
    setIsDeletePopoverOpen(false);
  };

  return (
    <div className="w-full flex items-end justify-between bg-background mt-auto">
      <div className="flex items-center gap-6">
        {/* Convert to Label and Select */}
        <div className="flex flex-col gap-2 items-start">
          <span className="text-sm font-medium text-muted-foreground">
            目标格式
          </span>
          <div className="flex items-center gap-2">
            <FormatSelectorPopover
              className=""
              config={globalConfig}
              recentKey="converter-audios-footer"
              onValueChange={handleFormatChange}
              applyConfigToAllTasks={applyConfigToAllTasks}
            />
          </div>
        </div>

        {/* Save to Label and Select */}
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            保存到
          </span>
          <div className="flex items-center gap-2">
            <OutputLocationSelect className="w-[14em]" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Popover
            open={isDeletePopoverOpen}
            onOpenChange={setIsDeletePopoverOpen}
          >
            <PopoverAnchor asChild>
              <Button
                variant="outline"
                size="icon"
                className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </PopoverAnchor>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">确认删除</h4>
                  <p className="text-xs text-muted-foreground">
                    当前有任务正在执行中，是否中断并清空所有转换中的任务？
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeletePopoverOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleConfirmDelete}
                  >
                    确认删除
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white h-11 px-8 text-base font-semibold shadow-lg shadow-purple-200 dark:shadow-purple-900/20"
          onClick={handleConvertAll}
        >
          转换全部
        </Button>
      </div>

    </div>
  );
};
