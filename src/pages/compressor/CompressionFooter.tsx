import React, { useState } from "react";
import { Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { useCompressorStore } from "@/stores/compressorStore";
import { CompressionSettingsDialog } from "./CompressionSettingsDialog";
import { getMediaTaskQueue } from "@/lib/bridge";
import { Slider } from "@/components/ui/slider";

export const CompressionFooter: React.FC = () => {
  const videoConfig = useCompressorStore((state) => state.videoConfig);
  const audioConfig = useCompressorStore((state) => state.audioConfig);
  const imageConfig = useCompressorStore((state) => state.imageConfig);
  const compressingTasks = useCompressorStore(
    (state) => state.compressingTasks
  );
  const updateGlobalConfig = useCompressorStore(
    (state) => state.updateGlobalConfig
  );
  const clearCompressingTasks = useCompressorStore(
    (state) => state.clearCompressingTasks
  );
  const updateUnfinishedTaskConfig = useCompressorStore(
    (state) => state.updateUnfinishedTaskConfig
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const handleCompressionChange = (value: number[]) => {
    const newValue = value[0];
    updateGlobalConfig({
      type: "video",
      compressionRatio: newValue,
    });
    updateGlobalConfig({
      type: "audio",
      compressionRatio: newValue,
    });
    updateGlobalConfig({
      type: "image",
      quality: newValue,
    });
  };

  const handleCompressAll = async () => {
    const activeTab = useCompressorStore.getState().activeTab;
    if (activeTab === "finished") {
      return;
    }

    const getConfigByType = (type: "video" | "audio" | "image") => {
      if (type === "video") return videoConfig;
      if (type === "audio") return audioConfig;
      return imageConfig;
    };

    const pendingTasks = compressingTasks.filter(
      (task) => task.compressionConfig?.type
    );

    if (pendingTasks.length > 0) {
      for (const task of pendingTasks) {
        const targetType = task.compressionConfig?.type as
          | "video"
          | "audio"
          | "image";
        await updateUnfinishedTaskConfig(task.id, {
          ...getConfigByType(targetType),
          type: targetType,
        });
      }
      const tasks = useCompressorStore
        .getState()
        .compressingTasks.filter((task) => task.compressionConfig?.type);
      await getMediaTaskQueue().add(tasks, "compress");
    }
  };

  const handleDelete = async () => {
    const hasRunningTasks = await getMediaTaskQueue().hasRunningTasks();

    if (!hasRunningTasks) {
      // 没有运行中的任务，直接清空
      await clearCompressingTasks();
      await getMediaTaskQueue().clearQueue();
    } else {
      // 有运行中的任务，打开确认弹窗
      setIsDeletePopoverOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    // 清空队列
    await getMediaTaskQueue().clearQueue();
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
                <Slider
                  value={[videoConfig.compressionRatio]}
                  onValueChange={handleCompressionChange}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <span className="text-xs text-muted-foreground">
                  {videoConfig.compressionRatio}%
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Save to Label and Select */}
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            保存到
          </span>
          <div className="flex items-center gap-2">
            <OutputLocationSelect className="w-[10em]" />
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
          onClick={handleCompressAll}
        >
          压缩全部
        </Button>
      </div>

      <CompressionSettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </div>
  );
};
