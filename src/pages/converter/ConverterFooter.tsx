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
import { useConverterStore, defaultVideoConfig } from "@/stores/converterStore";
import type { FormatSelectorValue } from "@/components/biz-form/FormatSelector";
import { getMediaTaskQueue } from "@/lib/bridge";
import { isAudioFormat, isVideoFormat, isImageFormat } from "@/data/formats";
import {
  isVideoConfig,
  isAudioConfig,
  isImageConfig,
  type ConversionConfig,
  FileType,
} from "@/types/tasks";
import type { ConverterTask } from "@/types/tasks";

export const ConverterFooter: React.FC<{
  fileType: FileType;
}> = ({ fileType }) => {
  const globalConfig = useConverterStore((state) => state.globalConfig);
  const convertingTasks = useConverterStore((state) => state.convertingTasks);
  const updateGlobalConfig = useConverterStore(
    (state) => state.updateGlobalConfig
  );
  const clearConvertingTasks = useConverterStore(
    (state) => state.clearConvertingTasks
  );
  const updateUnfinishedTaskConfig = useConverterStore(
    (state) => state.updateUnfinishedTaskConfig
  );

  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const handleFormatChange = (
    formatType: string,
    updates: FormatSelectorValue
  ) => {
    console.log("updates", updates);

    if (!globalConfig) return;
    // 根据当前配置类型和新格式类型创建新配置
    let newConfig: ConversionConfig;
    if (formatType === "video") {
      const prevVideo = isVideoConfig(globalConfig)
        ? globalConfig.video
        : defaultVideoConfig.video;

      const prevAudioTracks =
        isVideoConfig(globalConfig) || isAudioConfig(globalConfig)
          ? globalConfig.audioTracks
          : undefined;
      // 创建或更新 Video 配置
      newConfig = {
        type: "video",
        outputTitle: globalConfig.outputTitle,
        outputFormat: updates.outputFormat,
        group: updates.group,
        video: {
          ...prevVideo,
          encoder: updates.videoEncoder || prevVideo.encoder,
          resolution: updates.resolution || prevVideo.resolution,
        },
        audioTracks: prevAudioTracks?.map((it) => {
          return {
            ...it,
            encoder: updates.audioEncoder || it.encoder,
            bitrate: updates.audioBitrate || it.bitrate,
            sampleRate: updates.audioSampleRate || it.sampleRate,
            channels: updates.audioChannels || it.channels,
          };
        }),
      };
    } else if (formatType === "audio") {
      // 创建或更新 Audio 配置
      const existingAudioTracks = isAudioConfig(globalConfig)
        ? globalConfig.audioTracks
        : [
          {
            trackIndex: 0,
            encoder: "aac",
            channels: "auto",
            sampleRate: "auto",
            bitrate: "auto",
          },
        ];
      newConfig = {
        type: "audio",
        outputFormat: updates.outputFormat || globalConfig.outputFormat,
        outputTitle: globalConfig.outputTitle,
        audioTracks: existingAudioTracks.map((track) => ({
          ...track,
          encoder: updates.audioEncoder || track.encoder,
          bitrate: updates.audioBitrate || track.bitrate,
          sampleRate: updates.audioSampleRate || track.sampleRate,
          channels: updates.audioChannels || track.channels,
        })),
      };
      console.log("newConfig", updates, globalConfig);
    } else if (formatType === "image") {
      // Image 配置
      const existingImage = isImageConfig(globalConfig)
        ? globalConfig.image
        : { quality: "80" };

      newConfig = {
        type: "image",
        outputFormat: updates.outputFormat || globalConfig.outputFormat,
        outputTitle: globalConfig.outputTitle,
        image: {
          ...existingImage,
          quality: updates.quality || existingImage.quality,
          resolution: updates.resolution || existingImage.resolution,
        },
      };
    } else {
      return;
    }
    updateGlobalConfig(newConfig);
  };

  const handleConvertAll = async () => {
    const pendingTasks = convertingTasks;
    if (pendingTasks.length > 0 && globalConfig) {
      console.log("globalConfig", globalConfig);
      // 为每个任务设置 config（浅拷贝 globalConfig）
      for (const task of pendingTasks) {
        await updateUnfinishedTaskConfig(task.id, { ...globalConfig });
      }
      const tasks = useConverterStore.getState().convertingTasks;
      await getMediaTaskQueue().addConvertTasks(tasks.map((task) => ({
        kind: task.taskType,
        args: task.args
      })));
    }
  };

  const handleDelete = async () => {
    const hasRunningTasks = await getMediaTaskQueue().hasRunningTasks();

    if (!hasRunningTasks) {
      // 没有运行中的任务，直接清空
      await clearConvertingTasks();
      await getMediaTaskQueue().clearQueue();
    } else {
      // 有运行中的任务，打开确认弹窗
      setIsDeletePopoverOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    // 清空队列
    await getMediaTaskQueue().clearQueue();
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
            <FormatSelector
              className="w-[14em]"
              onValueChange={handleFormatChange}
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
