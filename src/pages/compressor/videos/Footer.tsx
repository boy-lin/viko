import React, { useState } from "react";
import { Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { useCompressorStore } from './store'
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Slider } from "@/components/ui/slider";

export const CompressionFooter: React.FC = () => {
  const { t } = useTranslation("task");
  const videoConfig = useCompressorStore((state) => state.videoConfig);
  const updateGlobalConfig = useCompressorStore(
    (state) => state.updateGlobalConfig
  );
  const applyConfigToAllTasks = useCompressorStore(
    (state) => state.applyConfigToAllTasks
  );
  const clearCompressingTasks = useCompressorStore(
    (state) => state.clearCompressingTasks
  );

  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const handleCompressAll = async () => {
    try {
      await useCompressorStore.getState().pushTasksToQueue()
    } catch (error) {
      toast.error(t("footer.compress_all_failed_video"));
      console.error("Failed to compress all videos:", error);
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
            压缩质量
          </span>
          <div className="flex items-center gap-2">
            <div className="w-[10em]">
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="h-9 w-[10em] cursor-pointer"
                >
                  <Slider
                    value={[videoConfig.args.ratio??20]}
                    onValueChange={(ratio: number[]) => {
                      updateGlobalConfig({ args: { ratio: ratio[0] } });
                      const globalConfig = useCompressorStore.getState().videoConfig;
                      applyConfigToAllTasks({
                        ...globalConfig,
                        args: {
                          ...globalConfig.args,
                          ratio: ratio[0]
                        }
                      });
                    }}
                    min={10}
                    max={100}
                    step={2}
                    className="w-full cursor-pointer"
                  />
                  <Settings className="w-4 h-4 text-muted-foreground" />
                </Button>
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
          className="h-11 px-8 text-base font-semibold shadow cursor-pointer"
          onClick={handleCompressAll}
        >
          压缩全部
        </Button>
      </div>

    </div>
  );
};

