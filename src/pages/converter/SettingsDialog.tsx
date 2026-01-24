import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ConversionConfig,
  isVideoConfig,
  isAudioConfig,
  isImageConfig,
  VideoConversionConfig,
  AudioConversionConfig,
  ImageConversionConfig,
  AudioTrackConfig,
} from "@/types/converter";
import { VideoSettingsSection } from "./components/VideoSettingsSection";
import { AudioSettingsSection } from "./components/AudioSettingsSection";
import { ImageSettingsSection } from "./components/ImageSettingsSection";
// import { SettingsDialogTitle } from "./components/SettingsDialogTitle";
import { defaultVideoConfig } from "@/stores/converterStore";
import {
  getValidVideoEncoders,
  getAvailableResolutions,
} from "@/data/capabilities";
interface ConversionSettingsDialogProps {
  taskConfig: ConversionConfig;
  onTaskConfigChange: (config: ConversionConfig) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConversionSettingsDialog: React.FC<
  ConversionSettingsDialogProps
> = ({ taskConfig, onTaskConfigChange, open, onOpenChange }) => {
  const [config, setConfig] = useState<ConversionConfig>(() => {
    if (taskConfig) return taskConfig;
    // 默认配置
    return defaultVideoConfig;
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

  // const handleTitleChange = (title: string) => {
  //   setConfig({ ...config, outputTitle: title });
  // };

  // Video config handlers
  const handleVideoChange = (video: VideoConversionConfig["video"]) => {
    if (isVideoConfig(config)) {
      setConfig({ ...config, video } as VideoConversionConfig);
    }
  };

  const handleVideoAudioTracksChange = (audioTracks: AudioTrackConfig[]) => {
    if (isVideoConfig(config)) {
      setConfig({ ...config, audioTracks } as VideoConversionConfig);
    }
  };

  // Audio config handlers
  const handleAudioTracksChange = (audioTracks: AudioTrackConfig[]) => {
    if (isAudioConfig(config)) {
      setConfig({ ...config, audioTracks } as AudioConversionConfig);
    }
  };

  // Image config handlers
  const handleImageChange = (image: ImageConversionConfig["image"]) => {
    if (isImageConfig(config)) {
      setConfig({ ...config, image } as ImageConversionConfig);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pt-8 pb-4 px-4 border-b">
          {/* <SettingsDialogTitle
            title={config.outputTitle}
            onTitleChange={handleTitleChange}
          /> */}
          <DialogTitle className="">Settings</DialogTitle>
          <DialogDescription className="">
            Configure output settings for the converting task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 px-4">
          {/* Video Section */}
          {isVideoConfig(config) && (
            <>
              <VideoSettingsSection
                video={config.video}
                onVideoChange={handleVideoChange}
                {...(() => {
                  const currentGroup = config?.group || "";
                  const validEncoders = getValidVideoEncoders(currentGroup);
                  // Dynamic resolutions based on selected encoder
                  const validResolutions = getAvailableResolutions(currentGroup, config.video.encoder);

                  return {
                    allowedEncoders: validEncoders,
                    availableResolutions: validResolutions,
                    // maxFrameRate is now handled inside capabilities logic implicitly or we can add helper
                  };
                })()}
              />
              {config.audioTracks && config.audioTracks.length > 0 && (
                <AudioSettingsSection
                  audioTracks={config.audioTracks}
                  outputFormat={config.outputFormat}
                  onAudioTracksChange={handleVideoAudioTracksChange}
                  multiTrack={true}
                />
              )}
            </>
          )}

          {/* Audio Section */}
          {isAudioConfig(config) && (
            <AudioSettingsSection
              audioTracks={config.audioTracks}
              outputFormat={config.outputFormat}
              onAudioTracksChange={handleAudioTracksChange}
              multiTrack={false}
            />
          )}

          {/* Image Section */}
          {isImageConfig(config) && (
            <ImageSettingsSection
              image={config.image}
              onImageChange={handleImageChange}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 py-4 px-4 border-t sticky bottom-0 bg-background/95 backdrop-blur z-10">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
