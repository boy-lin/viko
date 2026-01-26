import React from "react";
import { Button } from "@/components/ui/button";
import { VideoTrackConfig } from "@/types/converter";
import { RefreshCw } from "lucide-react";
import { VideoEncoderSelect } from "@/components/biz-form/VideoEncoderSelect";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoFrameRateSelect } from "@/components/biz-form/VideoFrameRateSelect";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { ColorSpaceSelect } from "@/components/biz-form/ColorSpaceSelect";
import { getVideoEncoderOptions } from "@/data/capabilities";

interface VideoSettingsSectionProps {
  video: VideoTrackConfig;
  onVideoChange: (video: VideoTrackConfig) => void;
  onReset?: () => void;
}

export const VideoSettingsSection: React.FC<VideoSettingsSectionProps> = ({
  video,
  onVideoChange,
  onReset,
}) => {
  const encoderOptions = getVideoEncoderOptions(video.encoder);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Video:</h3>
        {onReset && (
          <Button variant="ghost" size="icon" onClick={onReset}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <VideoEncoderSelect
          value={video.encoder}
          onValueChange={(v) => onVideoChange({ ...video, encoder: v })}
        />

        <VideoResolutionSelect
          value={video.resolution}
          onValueChange={(v) => onVideoChange({ ...video, resolution: v })}
          options={encoderOptions.resolutions}
        />

        <VideoFrameRateSelect
          value={video.frameRate}
          onValueChange={(v) => onVideoChange({ ...video, frameRate: v })}
          options={encoderOptions.frameRates}
        />

        <VideoBitrateSelect
          value={video.bitrate}
          onValueChange={(v) => onVideoChange({ ...video, bitrate: v })}
          options={encoderOptions.bitrates}
        />
      </div>

      <ColorSpaceSelect
        value="auto"
        onValueChange={() => { }}
        options={encoderOptions.colorSpaces}
      />

      <div className="w-full h-px bg-border"></div>
    </div>
  );
};
