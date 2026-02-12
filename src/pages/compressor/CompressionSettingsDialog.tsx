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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompressorStore } from "@/pages/compressor/store";
import {
  CompressionConfig,
  VideoCompressionConfig,
  AudioCompressionConfig,
  ImageCompressionConfig,
} from "@/types/tasks";
import {
  defaultVideoCompressionConfig,
  defaultAudioCompressionConfig,
  defaultImageCompressionConfig,
} from "@/pages/compressor/store";
import { getMediaTaskQueue } from "@/lib/bridge";

interface CompressionSettingsDialogProps {
  taskConfig?: CompressionConfig;
  onTaskConfigChange?: (config: CompressionConfig) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CompressionSettingsDialog: React.FC<
  CompressionSettingsDialogProps
> = ({ taskConfig, onTaskConfigChange, open, onOpenChange }) => {
  const updateGlobalConfig = useCompressorStore(
    (state) => state.updateGlobalConfig
  );
  const compressionScope = useCompressorStore(
    (state) => state.compressionScope
  );
  const setCompressionScope = useCompressorStore(
    (state) => state.setCompressionScope
  );
  const videoConfig = useCompressorStore((state) => state.videoConfig);
  const audioConfig = useCompressorStore((state) => state.audioConfig);
  const imageConfig = useCompressorStore((state) => state.imageConfig);
  const compressingTasks = useCompressorStore(
    (state) => state.compressingTasks
  );
  const updateUnfinishedTaskConfig = useCompressorStore(
    (state) => state.updateUnfinishedTaskConfig
  );
  const isGlobalMode = !taskConfig;

  const [taskDraft, setTaskDraft] = useState<CompressionConfig>(() => {
    if (taskConfig) return taskConfig;
    return defaultVideoCompressionConfig;
  });

  useEffect(() => {
    if (taskConfig) {
      setTaskDraft(taskConfig);
    }
  }, [taskConfig]);

  const activeTab = isGlobalMode
    ? (compressionScope === "general" ? "video" : compressionScope)
    : taskDraft.type || "video";

  const handleSave = async () => {
    if (!isGlobalMode) {
      if (onTaskConfigChange) {
        onTaskConfigChange(taskDraft);
      }
      onOpenChange(false);
      return;
    }

    const targetType = activeTab as "video" | "audio" | "image";
    const getConfigByType = (type: "video" | "audio" | "image") => {
      if (type === "video") return videoConfig;
      if (type === "audio") return audioConfig;
      return imageConfig;
    };
    const pendingTasks = compressingTasks.filter(
      (task) => task.compressionConfig?.type === targetType
    );

    if (pendingTasks.length > 0) {
      for (const task of pendingTasks) {
        await updateUnfinishedTaskConfig(task.id, {
          ...getConfigByType(targetType),
          type: targetType,
        });
      }
      const tasks = useCompressorStore
        .getState()
        .compressingTasks.filter(
          (task) => task.compressionConfig?.type === targetType
        );
      await getMediaTaskQueue().add(tasks, "compress");
    }

    onOpenChange(false);
  };

  const parseOptionalInt = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const parseOptionalFloat = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const updateVideoConfig = (updates: Partial<VideoCompressionConfig>) => {
    if (isGlobalMode) {
      updateGlobalConfig({
        type: "video",
        ...updates,
      });
      return;
    }
    setTaskDraft((prev) => ({
      ...(prev.type === "video" ? prev : defaultVideoCompressionConfig),
      ...updates,
      type: "video",
    }));
  };

  const updateAudioConfig = (updates: Partial<AudioCompressionConfig>) => {
    if (isGlobalMode) {
      updateGlobalConfig({
        type: "audio",
        ...updates,
      });
      return;
    }
    setTaskDraft((prev) => ({
      ...(prev.type === "audio" ? prev : defaultAudioCompressionConfig),
      ...updates,
      type: "audio",
    }));
  };

  const updateImageConfig = (updates: Partial<ImageCompressionConfig>) => {
    if (isGlobalMode) {
      updateGlobalConfig({
        type: "image",
        ...updates,
      });
      return;
    }
    setTaskDraft((prev) => ({
      ...(prev.type === "image" ? prev : defaultImageCompressionConfig),
      ...updates,
      type: "image",
    }));
  };

  const handleVideoCompressionChange = (ratio: number[]) => {
    updateVideoConfig({
      compressionRatio: ratio[0],
    });
  };

  const handleAudioCompressionChange = (ratio: number[]) => {
    updateAudioConfig({
      compressionRatio: ratio[0],
    });
  };

  const handleImageQualityChange = (quality: number[]) => {
    updateImageConfig({
      quality: quality[0],
    });
  };

  const VIDEO_BITRATES = [500, 800, 1000, 1500, 2000, 2500, 4000, 6000, 8000];
  const VIDEO_CODECS = ["libx264", "h264", "libx265", "hevc", "libvpx-vp9", "libaom-av1"];
  const GOP_OPTIONS = [12, 15, 18, 24, 30, 48, 60, 120, 250];
  const COLOR_DEPTHS = [8, 10, 12];
  const VIDEO_PRESETS = ["ultrafast", "fast", "medium", "slow"];
  const AUDIO_BITRATES = [64, 96, 128, 160, 192, 256, 320];
  const AUDIO_CODECS = ["aac", "libmp3lame", "libopus", "flac", "alac", "ac3", "eac3"];
  const AUDIO_CHANNELS = [1, 2];
  const AUDIO_BIT_DEPTHS = [16, 24, 32];
  const IMAGE_COLOR_MODES = ["RGB", "RGBA", "Gray", "CMYK"];
  const IMAGE_DPI = [72, 96, 150, 300, 600];

  const renderSelect = (
    label: string,
    value: string | number | undefined,
    options: Array<string | number>,
    placeholder: string,
    onChange: (val?: string | number) => void
  ) => {
    const selectValue = value === undefined ? "auto" : String(value);
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (v === "auto") {
              onChange(undefined);
              return;
            }
            const matchNumber = options.find((opt) => String(opt) === v);
            onChange(matchNumber ?? v);
          }}
        >
          <SelectTrigger className="w-full" size="sm">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自动</SelectItem>
            {options.map((opt) => (
              <SelectItem key={String(opt)} value={String(opt)}>
                {String(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const currentVideoConfig = isGlobalMode
    ? videoConfig
    : (taskDraft.type === "video"
      ? taskDraft
      : defaultVideoCompressionConfig);
  const currentAudioConfig = isGlobalMode
    ? audioConfig
    : (taskDraft.type === "audio"
      ? taskDraft
      : defaultAudioCompressionConfig);
  const currentImageConfig = isGlobalMode
    ? imageConfig
    : (taskDraft.type === "image"
      ? taskDraft
      : defaultImageCompressionConfig);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pt-8 pb-4 px-4 border-b">
          <div className="space-y-1">
            <DialogTitle>压缩设置</DialogTitle>
            <DialogDescription>
              {isGlobalMode ? "配置压缩参数并立即开始压缩" : "仅修改当前任务的压缩参数"}
            </DialogDescription>
          </div>
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              if (isGlobalMode) {
                setCompressionScope(v as "video" | "audio" | "image");
              }
            }}
          >
            <TabsList className="h-7 p-0.5">
              <TabsTrigger
                value="video"
                className="px-2 py-0.5 text-xs"
                disabled={!isGlobalMode && taskDraft.type !== "video"}
              >
                视频
              </TabsTrigger>
              <TabsTrigger
                value="audio"
                className="px-2 py-0.5 text-xs"
                disabled={!isGlobalMode && taskDraft.type !== "audio"}
              >
                音频
              </TabsTrigger>
              <TabsTrigger
                value="image"
                className="px-2 py-0.5 text-xs"
                disabled={!isGlobalMode && taskDraft.type !== "image"}
              >
                图片
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </DialogHeader>

        <div className="space-y-6 py-4 px-4">
          {/* Video Section */}
          {activeTab === "video" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  压缩百分比: {currentVideoConfig.compressionRatio}%
                </label>
                <Slider
                  value={[currentVideoConfig.compressionRatio]}
                  onValueChange={handleVideoCompressionChange}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  压缩到原文件大小的 {currentVideoConfig.compressionRatio}%（通过调整比特率实现）
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {renderSelect(
                  "码率 (kbps)",
                  currentVideoConfig.bitrate,
                  VIDEO_BITRATES,
                  "自动",
                  (val) =>
                    updateVideoConfig({
                      bitrate:
                        typeof val === "number" ? val : parseOptionalInt(String(val)),
                    })
                )}
                <div className="space-y-2">
                  <Label>帧率</Label>
                  <Input
                    type="number"
                    placeholder="自动"
                    value={currentVideoConfig.frameRate ?? ""}
                    onChange={(e) =>
                      updateVideoConfig({ frameRate: parseOptionalFloat(e.target.value) })
                    }
                  />
                </div>
                {renderSelect(
                  "编码器",
                  currentVideoConfig.codec,
                  VIDEO_CODECS,
                  "自动",
                  (val) =>
                    updateVideoConfig({
                      codec: typeof val === "string" ? val : undefined,
                    })
                )}
                {renderSelect(
                  "GOP 间隔",
                  currentVideoConfig.keyframeInterval,
                  GOP_OPTIONS,
                  "默认",
                  (val) =>
                    updateVideoConfig({
                      keyframeInterval:
                        typeof val === "number" ? val : parseOptionalInt(String(val)),
                    })
                )}
                {renderSelect(
                  "色深 (bit)",
                  currentVideoConfig.colorDepth,
                  COLOR_DEPTHS,
                  "自动",
                  (val) =>
                    updateVideoConfig({
                      colorDepth:
                        typeof val === "number" ? val : parseOptionalInt(String(val)),
                    })
                )}
                {renderSelect(
                  "音频码率 (kbps)",
                  currentVideoConfig.audioBitrate,
                  AUDIO_BITRATES,
                  "默认",
                  (val) =>
                    updateVideoConfig({
                      audioBitrate:
                        typeof val === "number" ? val : parseOptionalInt(String(val)),
                    })
                )}
                {renderSelect(
                  "预设",
                  currentVideoConfig.preset,
                  VIDEO_PRESETS,
                  "默认",
                  (val) =>
                    updateVideoConfig({
                      preset: typeof val === "string" ? val : undefined,
                    })
                )}
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={currentVideoConfig.removeAudio ?? false}
                    onCheckedChange={(checked) =>
                      updateVideoConfig({ removeAudio: checked === true })
                    }
                  />
                  <Label>移除音轨</Label>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={currentVideoConfig.useHardwareAcceleration ?? false}
                    onCheckedChange={(checked) =>
                      updateVideoConfig({ useHardwareAcceleration: checked === true })
                    }
                  />
                  <Label>硬件加速</Label>
                </div>
              </div>
            </div>
          )}

          {/* Audio Section */}
          {activeTab === "audio" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  压缩百分比: {currentAudioConfig.compressionRatio}%
                </label>
                <Slider
                  value={[currentAudioConfig.compressionRatio]}
                  onValueChange={handleAudioCompressionChange}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  压缩到原文件大小的 {currentAudioConfig.compressionRatio}%（通过调整比特率实现）
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>采样率</Label>
                  <Input
                    type="number"
                    placeholder="自动"
                    value={currentAudioConfig.sampleRate ?? ""}
                    onChange={(e) =>
                      updateAudioConfig({ sampleRate: parseOptionalInt(e.target.value) })
                    }
                  />
                </div>
                {renderSelect(
                  "码率 (kbps)",
                  currentAudioConfig.bitrate,
                  AUDIO_BITRATES,
                  "自动",
                  (val) =>
                    updateAudioConfig({
                      bitrate:
                        typeof val === "number" ? val : parseOptionalInt(String(val)),
                    })
                )}
                {renderSelect(
                  "编码器",
                  currentAudioConfig.codec,
                  AUDIO_CODECS,
                  "自动",
                  (val) =>
                    updateAudioConfig({
                      codec: typeof val === "string" ? val : undefined,
                    })
                )}
                {renderSelect(
                  "声道数",
                  currentAudioConfig.channels,
                  AUDIO_CHANNELS,
                  "自动",
                  (val) =>
                    updateAudioConfig({
                      channels:
                        typeof val === "number" ? val : parseOptionalInt(String(val)),
                    })
                )}
                {renderSelect(
                  "位深",
                  currentAudioConfig.bitDepth,
                  AUDIO_BIT_DEPTHS,
                  "自动",
                  (val) =>
                    updateAudioConfig({
                      bitDepth:
                        typeof val === "number" ? val : parseOptionalInt(String(val)),
                    })
                )}
                <div className="space-y-2">
                  <Label>静音阈值 (dB)</Label>
                  <Input
                    type="number"
                    placeholder="-50"
                    value={currentAudioConfig.silenceThreshold ?? ""}
                    onChange={(e) =>
                      updateAudioConfig({
                        silenceThreshold: parseOptionalFloat(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>音量增益 (dB)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={currentAudioConfig.volumeGain ?? ""}
                    onChange={(e) =>
                      updateAudioConfig({ volumeGain: parseOptionalFloat(e.target.value) })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={currentAudioConfig.removeSilence ?? false}
                    onCheckedChange={(checked) =>
                      updateAudioConfig({ removeSilence: checked === true })
                    }
                  />
                  <Label>移除静音</Label>
                </div>
              </div>
            </div>
          )}

          {/* Image Section */}
          {activeTab === "image" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  质量百分比: {currentImageConfig.quality}%
                </label>
                <Slider
                  value={[currentImageConfig.quality]}
                  onValueChange={handleImageQualityChange}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  图片质量设置为 {currentImageConfig.quality}%（数值越高，质量越好，文件越大）
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {renderSelect(
                  "颜色模式",
                  currentImageConfig.colorMode,
                  IMAGE_COLOR_MODES,
                  "自动",
                  (val) =>
                    updateImageConfig({
                      colorMode: typeof val === "string" ? val : undefined,
                    })
                )}
                {renderSelect(
                  "DPI",
                  currentImageConfig.dpi,
                  IMAGE_DPI,
                  "默认",
                  (val) =>
                    updateImageConfig({
                      dpi:
                        typeof val === "number" ? val : parseOptionalFloat(String(val)),
                    })
                )}
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={currentImageConfig.stripMetadata ?? true}
                    onCheckedChange={(checked) =>
                      updateImageConfig({ stripMetadata: checked === true })
                    }
                  />
                  <Label>去除元数据</Label>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={currentImageConfig.keepTransparency ?? true}
                    onCheckedChange={(checked) =>
                      updateImageConfig({ keepTransparency: checked === true })
                    }
                  />
                  <Label>保留透明</Label>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={currentImageConfig.cropWhitespace ?? false}
                    onCheckedChange={(checked) =>
                      updateImageConfig({ cropWhitespace: checked === true })
                    }
                  />
                  <Label>裁剪空白</Label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 py-4 px-4 border-t sticky bottom-0 bg-background/95 backdrop-blur z-10">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>
            {isGlobalMode
              ? `压缩全部${activeTab === "video" ? "视频" : activeTab === "audio" ? "音频" : "图片"}`
              : "保存"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
