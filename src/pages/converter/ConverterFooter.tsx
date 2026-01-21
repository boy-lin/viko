import React, { useState } from "react";
import { Trash2, Settings } from "lucide-react";
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
import { ConversionSettingsDialog } from "./SettingsDialog";
import { converterQueue } from "@/lib/bridge";
import { isAudioFormat, isVideoFormat, isImageFormat } from "@/data/formats";
import {
  isVideoConfig,
  isAudioConfig,
  isImageConfig,
  type ConversionConfig,
} from "@/types/converter";

export const ConverterFooter: React.FC = () => {
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

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const handleFormatChange = (
    formatType: string,
    updates: FormatSelectorValue
  ) => {
    if (!globalConfig) return;
    // 根据当前配置类型和新格式类型创建新配置
    let newConfig: ConversionConfig;

    if (formatType === "video") {
      // 创建或更新 Video 配置
      const existingVideo = isVideoConfig(globalConfig)
        ? globalConfig.video
        : {
          encoder: "h264",
          resolution: "1920x1080",
          frameRate: "30",
          bitrate: "1000",
        };

      newConfig = {
        type: "video",
        outputFormat: updates.outputFormat || globalConfig.outputFormat,
        outputTitle: globalConfig.outputTitle,
        video: {
          ...existingVideo,
          resolution: updates.resolution || existingVideo.resolution,
          encoder: updates.videoEncoder || existingVideo.encoder,
        },
        // 保留现有的 audioTracks（如果有）
        audioTracks:
          isVideoConfig(globalConfig) &&
            globalConfig.audioTracks &&
            globalConfig.audioTracks.length > 0
            ? globalConfig.audioTracks
            : defaultVideoConfig.audioTracks,
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
      converterQueue.add(tasks);
    }
  };

  const handleDelete = async () => {
    const hasRunningTasks = converterQueue.hasRunningTasks();

    if (!hasRunningTasks) {
      // 没有运行中的任务，直接清空
      await clearConvertingTasks();
      converterQueue.clearQueue();
    } else {
      // 有运行中的任务，打开确认弹窗
      setIsDeletePopoverOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    // 清空队列
    converterQueue.clearQueue();
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
            {(() => {
              const formatType = isVideoFormat(globalConfig.outputFormat)
                ? "video"
                : isAudioFormat(globalConfig.outputFormat)
                  ? "audio"
                  : isImageFormat(globalConfig.outputFormat)
                    ? "image"
                    : "video"; // 默认值

              if (formatType === "video") {
                return (
                  <FormatSelector
                    className="w-[14em]"
                    formatType="video"
                    format={globalConfig.outputFormat}
                    encoder={
                      isVideoConfig(globalConfig)
                        ? globalConfig.video.encoder
                        : undefined
                    }
                    resolution={
                      isVideoConfig(globalConfig)
                        ? globalConfig.video.resolution
                        : undefined
                    }
                    onValueChange={handleFormatChange}
                  />
                );
              } else if (formatType === "audio") {
                return (
                  <FormatSelector
                    className="w-[14em]"
                    formatType="audio"
                    format={globalConfig.outputFormat}
                    audioEncoder={
                      isAudioConfig(globalConfig) &&
                        globalConfig.audioTracks.length > 0
                        ? globalConfig.audioTracks[0].encoder
                        : undefined
                    }
                    audioBitrate={
                      isAudioConfig(globalConfig) &&
                        globalConfig.audioTracks.length > 0
                        ? globalConfig.audioTracks[0].bitrate
                        : undefined
                    }
                    onValueChange={handleFormatChange}
                  />
                );
              } else {
                return (
                  <FormatSelector
                    className="w-[14em]"
                    formatType="image"
                    format={globalConfig.outputFormat}
                    quality={
                      isImageConfig(globalConfig)
                        ? globalConfig.image.quality
                        : undefined
                    }
                    resolution={
                      isImageConfig(globalConfig)
                        ? globalConfig.image.resolution
                        : undefined
                    }
                    onValueChange={handleFormatChange}
                  />
                );
              }
            })()}
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

      <ConversionSettingsDialog
        taskConfig={globalConfig}
        onTaskConfigChange={updateGlobalConfig}
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </div>
  );
};
