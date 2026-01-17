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
import { ConverterTask, ConversionConfig } from "@/types/converter";
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
import { isAudioFormat } from "@/data/formats";

interface ConversionSettingsDialogProps {
  taskConfig: ConversionConfig;
  onTaskConfigChange: (config: Partial<ConversionConfig>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConversionSettingsDialog: React.FC<
  ConversionSettingsDialogProps
> = ({ taskConfig, onTaskConfigChange, open, onOpenChange }) => {
  const [config, setConfig] = useState<ConversionConfig>(
    taskConfig || {
      outputTitle: "",
      outputFormat: "mp4",
      video: {
        encoder: "h264",
        resolution: "original",
        frameRate: "original",
        bitrate: "auto",
      },
      audioTracks: [],
    }
  );
  const outputFormat = config.outputFormat || "";

  useEffect(() => {
    if (taskConfig) {
      console.log(`taskConfig ${JSON.stringify(taskConfig)}`);
      setConfig(taskConfig);
    }
  }, [taskConfig]);

  const handleSave = () => {
    onTaskConfigChange({
      outputTitle: config.outputTitle,
      video: config.video,
      audioTracks: config.audioTracks,
    });
    onOpenChange(false);
  };

  // Helper to update specific audio track
  const updateAudioTrack = (index: number, field: string, value: string) => {
    const newTracks = config.audioTracks ? [...config.audioTracks] : [];
    newTracks[index] = { ...newTracks[index], [field]: value };
    setConfig({ ...config, audioTracks: newTracks });
  };

  const isAudioTarget = isAudioFormat(outputFormat);

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
          {/* Video Section - Only show if not audio format */}
          {!isAudioTarget && (
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
                  value={config.video!.encoder}
                  onValueChange={(v) =>
                    setConfig({
                      ...config,
                      video: { ...config.video, encoder: v },
                    })
                  }
                />

                <VideoResolutionSelect
                  value={config.video!.resolution}
                  onValueChange={(v) =>
                    setConfig({
                      ...config,
                      video: { ...config.video, resolution: v },
                    })
                  }
                />

                <VideoFrameRateSelect
                  value={config.video!.frameRate}
                  onValueChange={(v) =>
                    setConfig({
                      ...config,
                      video: { ...config.video, frameRate: v },
                    })
                  }
                />

                <VideoBitrateSelect
                  value={config.video!.bitrate}
                  onValueChange={(v) =>
                    setConfig({
                      ...config,
                      video: { ...config.video, bitrate: v },
                    })
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

          {/* Audio Section */}
          <div className="space-y-6">
            {isAudioTarget ? (
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
