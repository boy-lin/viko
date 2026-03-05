import React, { startTransition, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useCompressorStore } from './store'
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { buildDefaultImageArgs } from "./TaskItem";

export const CompressionFooter: React.FC = () => {
  const { t } = useTranslation("task");
  const imageConfig = useCompressorStore((state) => state.imageConfig);
  const updateGlobalConfig = useCompressorStore(
    (state) => state.updateGlobalConfig
  );
  const clearCompressingTasks = useCompressorStore(
    (state) => state.clearCompressingImageTasks
  );

  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const handleCompressAll = async () => {
    try {
      await useCompressorStore.getState().pushTasksToQueue()
    } catch (error) {
      toast.error(t("footer.compress_all_failed_image"));
      console.error("Failed to compress all images:", error);
    }
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

  return (
    <div className="w-full flex items-end justify-between bg-background mt-auto">
      <div className="flex items-center gap-6">
        {/* Compression Ratio Label and Slider */}
        <div className="flex flex-col gap-2 items-start">
          <span className="text-sm font-medium text-muted-foreground">
            {t("footer.quality")}
          </span>
          <div className="flex items-center gap-2">
            <div className="w-[10em]">
                <Slider
                value={[imageConfig.ratio??50]}
                  onValueChange={(ratio: number[]) => {
                    updateGlobalConfig({ ratio: ratio[0] });

                    const tasks = useCompressorStore.getState().CompressingImageTasks;
                    const updateTaskById = useCompressorStore.getState().updateTaskById;

                    tasks.forEach((task) => {
                      startTransition(() => {
                        if (task.mediaDetails) {
                          updateTaskById(task.id, {
                            args: buildDefaultImageArgs({
                              ...task,
                              args: {
                                ...task.args,
                                ratio: ratio[0],
                              }
                            }, task.mediaDetails)
                          });
                        }
                      })
                    });
                  }}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
            </div>

          </div>
        </div>

        {/* Save to Label and Select */}
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t("footer.save_to")}
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
          className="h-11 px-8 text-base font-semibold shadow cursor-pointer"
          onClick={handleCompressAll}
        >
          {t("footer.compress_all")}
        </Button>
      </div>

    </div>
  );
};

