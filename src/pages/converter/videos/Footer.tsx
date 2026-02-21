import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { FormatSelector } from "@/components/biz-form/FormatSelector";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { GlobalConverterConfig, useConverterStore } from "./store";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const ConverterFooter: React.FC<{}> = () => {
  const { t } = useTranslation("converter");
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
    try {
      await useConverterStore.getState().pushTasksToQueue()
    } catch (error) {
      toast.error(t("footer.convert_all_failed_video"));
      console.error("Failed to convert all videos:", error);
    }
  };

  const handleDelete = async () => {
    const hasRunningTasks = await getMediaTaskQueue().hasRunningTasksByType();

    if (!hasRunningTasks) {
      // 没有运行中的任务，直接清空
      await clearConvertingTasks();
      await getMediaTaskQueue().clearQueueByType(true);
    } else {
      // 有运行中的任务，打开确认弹窗
      setIsDeletePopoverOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    // 清空队列
    await getMediaTaskQueue().clearQueueByType(true);
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
            {t("footer.target_format")}
          </span>
          <div className="flex items-center gap-2">
            <FormatSelector
              config={globalConfig}
              recentKey="converter-videos-footer"
              onValueChange={updateGlobalConfig}
              applyConfigToAllTasks={applyConfigToAllTasks}
            />
          </div>
        </div>

        {/* Save to Label and Select */}
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t("footer.save_to")}
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
                className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </PopoverAnchor>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">{t("footer.confirm_delete_title")}</h4>
                  <p className="text-xs text-muted-foreground">
                    {t("footer.confirm_delete_desc")}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeletePopoverOpen(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleConfirmDelete}
                  >
                    {t("footer.confirm_delete")}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white h-11 px-8 text-base font-semibold shadow-lg shadow-purple-200 dark:shadow-purple-900/20 cursor-pointer"
          onClick={handleConvertAll}
        >
          {t("footer.convert_all")}
        </Button>
      </div>

    </div>
  );
};
