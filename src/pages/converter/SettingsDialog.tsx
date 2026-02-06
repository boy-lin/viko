import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConversionConfig, FileType } from "@/types/tasks";
import { ConvertAudioTaskArgs, ConvertImageTaskArgs, ConvertVideoTaskArgs } from "@/lib/bridge";

import { VideoSettingsSection } from "./components/VideoSettingsSection";
import { AudioSettingsSection } from "./components/AudioSettingsSection";
import { ImageSettingsSection } from "./components/ImageSettingsSection";
// import { SettingsDialogTitle } from "./components/SettingsDialogTitle";
import { defaultVideoConfig, defaultAudioConfig, defaultImageConfig } from "@/stores/converterStore";
import { useTranslation } from "react-i18next";
import { isAudioFormat, isVideoFormat, isImageFormat } from "@/data/formats";
interface ConversionSettingsDialogProps {
  fileType: FileType;
  onTaskConfigChange: (config: ConversionConfig) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmLabel?: string;
  descriptionOverride?: string;
  onConfirm?: (config: ConversionConfig) => void;
}

export const ConversionSettingsDialog: React.FC<
  ConversionSettingsDialogProps
> = ({
  fileType,
  onTaskConfigChange,
  open,
  onOpenChange,
  confirmLabel,
  descriptionOverride,
  onConfirm,
}) => {
    const { t } = useTranslation("converter");
    const [config, setConfig] = useState(defaultVideoConfig);

    useEffect(() => {
      if (fileType === FileType.Video) {
        setConfig(defaultVideoConfig);
      } else if (fileType === FileType.Audio) {
        setConfig(defaultAudioConfig);
      } else if (fileType === FileType.Image) {
        setConfig(defaultImageConfig);
      }
    }, []);

  const toVideoFile = useMemo(() => isVideoFormat(config.format), [config.format])
  const toAudioFile = useMemo(() => isAudioFormat(config.format), [config.format])
  const toImageFile = useMemo(() => isImageFormat(config.format), [config.format])
  

  const handleSave = useCallback(() => {
    onTaskConfigChange(config);

    if (onConfirm) {
      onConfirm(config);
      return;
    }
    onOpenChange(false);
  }, [config, onTaskConfigChange, onConfirm, onOpenChange ])

    // const handleTitleChange = (title: string) => {
    //   setConfig({ ...config, outputTitle: title });
    // };

    // Video config handlers
    const handleConfigChange = (vals: Partial<ConvertVideoTaskArgs | ConvertAudioTaskArgs | ConvertImageTaskArgs>) => {
      setConfig((prev) => {
        return {
          ...prev,
          ...vals,
        }
      });
    };

    if (!config.format) {
      return <div>error: no format</div>
    }

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pt-8 pb-4 px-4 border-b">
            {/* <SettingsDialogTitle
            title={config.outputTitle}
            onTitleChange={handleTitleChange}
          /> */}
            <DialogTitle className="">{t("settings.title")}</DialogTitle>
            <DialogDescription className="">
              {descriptionOverride ?? t("settings.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4 px-4">
            <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm text-foreground flex items-center gap-2">
              <span className="text-xs uppercase text-muted-foreground">{t("settings.targetFormatLabel")}</span>
              <span className="font-semibold">{config.format?.toUpperCase?.()}</span>
            </div>

            {toVideoFile && (
              () => {
                const videoConfig = config as ConvertVideoTaskArgs
                return (<>
                  <VideoSettingsSection
                    format={videoConfig.format}
                    video_encoder={videoConfig.video_encoder}
                    video_bitrate={videoConfig.video_bitrate}
                    resolution={videoConfig.resolution}
                    frame_rate={videoConfig.frame_rate}
                    onChange={handleConfigChange}
                  />
                  {videoConfig.audio_tracks && videoConfig.audio_tracks.length > 0 && (
                    <AudioSettingsSection
                      format={videoConfig.format}
                      audio_tracks={videoConfig.audio_tracks}
                      onAudioTracksChange={(audio_tracks) => handleConfigChange({ audio_tracks })}
                      multiTrack={true}
                    />
                  )}
                </>)
              }
            )()}

            {/* Audio Section */}
            {toAudioFile && (
              () => {
                const audioConfig = config as ConvertAudioTaskArgs
                return (<AudioSettingsSection
                  format={audioConfig.format}
                  audio_tracks={[{
                    codec: audioConfig.audio_encoder,
                  }]}
                  onAudioTracksChange={(audio_tracks) => handleConfigChange(audio_tracks[0])}
                  multiTrack={false}
                />)
              }
            )()}

            {/* Image Section */}
            {toImageFile && (
              () => {
                const imageConfig = config as ConvertImageTaskArgs
                return (<ImageSettingsSection
                  format={imageConfig.format}
                  image_encoder={imageConfig.image_encoder}
                  resolution={imageConfig.resolution}
                  onImageChange={handleConfigChange}
                />)
              }
            )()}
          </div>

          <div className="flex justify-end gap-2 py-4 px-4 border-t sticky bottom-0 bg-background/95 backdrop-blur z-10">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave}>
              {confirmLabel ?? t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };
