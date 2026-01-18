import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  ConverterTask,
  ConversionConfig,
  isVideoConfig,
  isAudioConfig,
  isImageConfig,
  VideoConversionConfig,
  AudioConversionConfig,
  ImageConversionConfig,
} from "@/types/converter";
import { useConverterStore } from "@/stores/converterStore";
import { RefreshCw, X } from "lucide-react";
import { VideoEncoderSelect } from "@/components/biz-form/VideoEncoderSelect";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoFrameRateSelect } from "@/components/biz-form/VideoFrameRateSelect";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { ColorSpaceSelect } from "@/components/biz-form/ColorSpaceSelect";
import { AudioEncoderSelect } from "@/components/biz-form/AudioEncoderSelect";
import { AudioChannelSelect } from "@/components/biz-form/AudioChannelSelect";
import { AudioSampleRateSelect } from "@/components/biz-form/AudioSampleRateSelect";
import { AudioBitrateSelect } from "@/components/biz-form/AudioBitrateSelect";
import { isAudioFormat, isImageFormat } from "@/data/formats";

interface ConversionSettingsDialogProps {
  task: ConverterTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConversionSettingsDialog: React.FC<
  ConversionSettingsDialogProps
> = ({ task, open, onOpenChange }) => {
  const { updateUnfinishedTaskConfig } = useConverterStore();
  const [config, setConfig] = useState<ConversionConfig>(
    task.config ||
      ({
        type: "video",
        outputTitle: task?.title,
        outputFormat: "mp4",
        video: {
          encoder: "h264",
          resolution: "original",
          frameRate: "original",
          bitrate: "auto",
        },
        audioTracks: [],
      } as VideoConversionConfig)
  );
  const outputFormat = task.config?.outputFormat || "";

  useEffect(() => {
    if (task.config) {
      setConfig(task.config);
    }
  }, [task]);

  const handleSave = () => {
    if (isVideoConfig(config)) {
      updateUnfinishedTaskConfig(task.id, {
        outputTitle: config.outputTitle,
        video: config.video,
        audioTracks: config.audioTracks,
      });
    } else if (isAudioConfig(config)) {
      updateUnfinishedTaskConfig(task.id, {
        outputTitle: config.outputTitle,
        audioTracks: config.audioTracks,
      });
    } else if (isImageConfig(config)) {
      updateUnfinishedTaskConfig(task.id, {
        outputTitle: config.outputTitle,
        image: config.image,
      });
    }
    onOpenChange(false);
  };

  // Helper to update specific audio track
  const updateAudioTrack = (index: number, field: string, value: string) => {
    if (isVideoConfig(config) || isAudioConfig(config)) {
      const newTracks = config.audioTracks ? [...config.audioTracks] : [];
      newTracks[index] = { ...newTracks[index], [field]: value };
      if (isVideoConfig(config)) {
        setConfig({
          ...config,
          audioTracks: newTracks,
        } as VideoConversionConfig);
      } else {
        setConfig({
          ...config,
          audioTracks: newTracks,
        } as AudioConversionConfig);
      }
    }
  };

  const isAudioTarget = isAudioFormat(outputFormat);
  const isImageTarget = isImageFormat(outputFormat);
  const isVideoTarget = !isAudioTarget && !isImageTarget;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="flex-1 flex items-center gap-2 mr-8">
            <Label htmlFor="title" className="shrink-0 text-muted-foreground">
              Title:
            </Label>
            <div className="relative flex-1">
              <Input
                id="title"
                value={config.outputTitle}
                onChange={(e) =>
                  setConfig({ ...config, outputTitle: e.target.value })
                }
                className="h-8 border-purple-500 ring-1 ring-purple-500/20"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => setConfig({ ...config, outputTitle: "" })}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Configure output settings for the conversion task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Video Section - Only show if video config */}
          {isVideoTarget && isVideoConfig(config) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Video:</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    // Reset logic if needed
                  }}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <VideoEncoderSelect
                  value={config.video.encoder}
                  onValueChange={(v) =>
                    setConfig({
                      ...config,
                      video: { ...config.video, encoder: v },
                    } as VideoConversionConfig)
                  }
                />

                <VideoResolutionSelect
                  value={config.video.resolution}
                  onValueChange={(v) =>
                    setConfig({
                      ...config,
                      video: { ...config.video, resolution: v },
                    } as VideoConversionConfig)
                  }
                />

                <VideoFrameRateSelect
                  value={config.video.frameRate}
                  onValueChange={(v) =>
                    setConfig({
                      ...config,
                      video: { ...config.video, frameRate: v },
                    } as VideoConversionConfig)
                  }
                />

                <VideoBitrateSelect
                  value={config.video.bitrate}
                  onValueChange={(v) =>
                    setConfig({
                      ...config,
                      video: { ...config.video, bitrate: v },
                    } as VideoConversionConfig)
                  }
                />
              </div>

              <ColorSpaceSelect
                value="auto" // Currently hardcoded in original
                onValueChange={() => {}}
              />

              <div className="w-full h-px bg-border"></div>
            </div>
          )}

          {/* Image Section - Only show if image config */}
          {isImageTarget && isImageConfig(config) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Image:</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    // Reset logic if needed
                  }}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Image settings: Quality: {config.image.quality || "80"},
                Resolution: {config.image.resolution || "original"}
              </p>
              <div className="w-full h-px bg-border"></div>
            </div>
          )}

          {/* Audio Section */}
          <div className="space-y-6">
            {isAudioTarget && isAudioConfig(config) ? (
              // Simplified Audio View for Audio-Only formats
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">Audio:</h3>
                  <Button variant="ghost" size="icon">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                {config.audioTracks && config.audioTracks.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    <AudioEncoderSelect
                      value={config.audioTracks[0].encoder}
                      onValueChange={(v) => updateAudioTrack(0, "encoder", v)}
                      format={outputFormat}
                    />

                    <AudioChannelSelect
                      value={config.audioTracks[0].channels}
                      onValueChange={(v) => updateAudioTrack(0, "channels", v)}
                    />

                    <AudioSampleRateSelect
                      value={config.audioTracks[0].sampleRate}
                      onValueChange={(v) =>
                        updateAudioTrack(0, "sampleRate", v)
                      }
                    />

                    <AudioBitrateSelect
                      value={config.audioTracks[0].bitrate}
                      onValueChange={(v) => updateAudioTrack(0, "bitrate", v)}
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No audio track available.
                  </p>
                )}
              </div>
            ) : (
              // Multi-track view for Video
              isVideoConfig(config) &&
              config.audioTracks &&
              config.audioTracks.length > 0 &&
              config.audioTracks.map((track, index) => (
                <div key={index} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`audio-check-${index}`}
                        checked={true} // For now assume all tracks are processed, logic to disable track can be added
                        onCheckedChange={(c) => {
                          // Logic to remove/disable track
                        }}
                      />
                      <Label
                        htmlFor={`audio-check-${index}`}
                        className="font-bold text-lg cursor-pointer"
                      >
                        Audio Track {index + 1}
                      </Label>
                    </div>

                    <Button variant="ghost" size="icon">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    <AudioEncoderSelect
                      value={track.encoder}
                      onValueChange={(v) =>
                        updateAudioTrack(index, "encoder", v)
                      }
                      format={outputFormat}
                    />

                    <AudioChannelSelect
                      value={track.channels}
                      onValueChange={(v) =>
                        updateAudioTrack(index, "channels", v)
                      }
                    />

                    <AudioSampleRateSelect
                      value={track.sampleRate}
                      onValueChange={(v) =>
                        updateAudioTrack(index, "sampleRate", v)
                      }
                    />

                    <AudioBitrateSelect
                      value={track.bitrate}
                      onValueChange={(v) =>
                        updateAudioTrack(index, "bitrate", v)
                      }
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-background/95 backdrop-blur z-10">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
