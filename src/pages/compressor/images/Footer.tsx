import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { CompressionSettingsPopover } from "./SettingsDialog";
import { CompressImageTaskArgs, getMediaTaskQueue } from "@/lib/bridge";
import { useAppStore } from "@/stores/app";
import { useCompressorStore } from './store'

export const CompressionFooter: React.FC = () => {
  const imageConfig = useCompressorStore((state) => state.imageConfig);
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);
  const updateGlobalConfig = useCompressorStore(
    (state) => state.updateGlobalConfig
  );
  const clearCompressingTasks = useCompressorStore(
    (state) => state.clearCompressingTasks
  );

  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const handleSaveConfig = (vals: CompressImageTaskArgs) => {
    const pendingTasks = useCompressorStore.getState().compressingTasks;
    // 为每个任务设置 config（浅拷贝 globalConfig）
    for (const task of pendingTasks) {
      updateTaskById(task.id, {
        args: {
          ...task.args,
          ...vals
        },
      });
    }
  };

  const handleCompressAll = async () => {
    await useCompressorStore.getState().pushTasksToQueue()
  };

  const handleDelete = async () => {
    const hasRunningTasks = await getMediaTaskQueue().hasRunningTasksByType();

    if (!hasRunningTasks) {
      // 没有运行中的任务，直接清空
      await clearCompressingTasks();
      await getMediaTaskQueue().clearQueueByType();
    } else {
      // 有运行中的任务，打开确认弹窗
      setIsDeletePopoverOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    // 清空队列
    await getMediaTaskQueue().clearQueueByType();
    // 清空压缩中的任务
    await clearCompressingTasks();
    // 关闭弹窗
    setIsDeletePopoverOpen(false);
  };

  React.useEffect(() => {
    const queue = getMediaTaskQueue();
    const handleEvent = (payload: any) => {
      if (payload.task_type !== "compress") return;
      const { task_id, event_type, progress, error_message } = payload;
      const store = useCompressorStore.getState();

      // Check if this task belongs to video converter store
      // We might want to check if task exists in convertingTasks
      const taskExists = store.compressingTasks.some(t => t.id === task_id);
      if (!taskExists && event_type !== 'complete') {
        // If complete, it might have been moved? No, complete moves it.
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

  return (
    <div className="w-full flex items-end justify-between bg-background mt-auto">
      <div className="flex items-center gap-6">
        {/* Compression Ratio Label and Slider */}
        <div className="flex flex-col gap-2 items-start">
          <span className="text-sm font-medium text-muted-foreground">
            压缩质量
          </span>
          <div className="flex items-center gap-2">
            <div className="w-[10em]">
              <div className="space-y-2">
                <CompressionSettingsPopover
                  config={imageConfig}
                  onConfigChange={updateGlobalConfig}
                  onSave={handleSaveConfig}
                />
              </div>
            </div>

          </div>
        </div>

        {/* Save to Label and Select */}
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            保存到
          </span>
          <div className="flex items-center gap-2">
            <OutputLocationSelect className="" />
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
          className="bg-purple-600 hover:bg-purple-700 text-white h-11 px-8 text-base font-semibold shadow-lg shadow-purple-200 dark:shadow-purple-900/20 cursor-pointer"
          onClick={handleCompressAll}
        >
          压缩全部
        </Button>
      </div>

    </div>
  );
};
