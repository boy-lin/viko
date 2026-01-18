import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  CompressionConfig,
  isVideoCompressionConfig,
  isAudioCompressionConfig,
  isImageCompressionConfig,
  VideoCompressionConfig,
  AudioCompressionConfig,
  ImageCompressionConfig,
} from "@/types/converter";
import {
  defaultVideoCompressionConfig,
  defaultAudioCompressionConfig,
  defaultImageCompressionConfig,
} from "@/stores/compressorStore";

interface CompressionSettingsDialogProps {
  taskConfig?: CompressionConfig;
  onTaskConfigChange: (config: CompressionConfig) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CompressionSettingsDialog: React.FC<
  CompressionSettingsDialogProps
> = ({ taskConfig, onTaskConfigChange, open, onOpenChange }) => {
  const [config, setConfig] = useState<CompressionConfig>(() => {
    if (taskConfig) return taskConfig;
    // 默认配置
    return defaultVideoCompressionConfig;
  });

  useEffect(() => {
    if (taskConfig) {
      setConfig(taskConfig);
    }
  }, [taskConfig]);

  const handleSave = () => {
    onTaskConfigChange(config);
    onOpenChange(false);
  };

  const handleVideoCompressionChange = (ratio: number[]) => {
    setConfig({
      type: "video",
      compressionRatio: ratio[0],
    } as VideoCompressionConfig);
  };

  const handleAudioCompressionChange = (ratio: number[]) => {
    setConfig({
      type: "audio",
      compressionRatio: ratio[0],
    } as AudioCompressionConfig);
  };

  const handleImageQualityChange = (quality: number[]) => {
    setConfig({
      type: "image",
      quality: quality[0],
    } as ImageCompressionConfig);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pt-8 pb-4 px-4 border-b">
          <DialogTitle>压缩设置</DialogTitle>
          <DialogDescription>
            配置压缩参数，其他参数保持原文件设置
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 px-4">
          {/* Video Section */}
          {isVideoCompressionConfig(config) && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  压缩百分比: {config.compressionRatio}%
                </label>
                <Slider
                  value={[config.compressionRatio]}
                  onValueChange={handleVideoCompressionChange}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  压缩到原文件大小的 {config.compressionRatio}%（通过调整比特率实现）
                </p>
              </div>
            </div>
          )}

          {/* Audio Section */}
          {isAudioCompressionConfig(config) && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  压缩百分比: {config.compressionRatio}%
                </label>
                <Slider
                  value={[config.compressionRatio]}
                  onValueChange={handleAudioCompressionChange}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  压缩到原文件大小的 {config.compressionRatio}%（通过调整比特率实现）
                </p>
              </div>
            </div>
          )}

          {/* Image Section */}
          {isImageCompressionConfig(config) && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  质量百分比: {config.quality}%
                </label>
                <Slider
                  value={[config.quality]}
                  onValueChange={handleImageQualityChange}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  图片质量设置为 {config.quality}%（数值越高，质量越好，文件越大）
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 py-4 px-4 border-t sticky bottom-0 bg-background/95 backdrop-blur z-10">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
