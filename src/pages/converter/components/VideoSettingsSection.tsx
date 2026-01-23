import React from "react";
import { Button } from "@/components/ui/button";
import { VideoTrackConfig } from "@/types/converter";
import { RefreshCw } from "lucide-react";
import { VideoEncoderSelect } from "@/components/biz-form/VideoEncoderSelect";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoFrameRateSelect } from "@/components/biz-form/VideoFrameRateSelect";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { ColorSpaceSelect } from "@/components/biz-form/ColorSpaceSelect";
import { getVideoEncoderOptions } from "@/data/encoder_options";

interface VideoSettingsSectionProps {
  video: VideoTrackConfig;
  onVideoChange: (video: VideoTrackConfig) => void;
  onReset?: () => void;
  allowedEncoders?: string[];
  allowedResolutions?: string[];
  maxResolution?: string;
  maxFrameRate?: string;
}

const parseResolution = (res: string) => {
  const match = res.match(/(\d+)x(\d+)/);
  if (!match) return null;
  return { w: parseInt(match[1]), h: parseInt(match[2]) };
};

export const VideoSettingsSection: React.FC<VideoSettingsSectionProps> = ({
  video,
  onVideoChange,
  onReset,
  allowedEncoders,
  allowedResolutions,
  maxResolution,
  maxFrameRate,
}) => {
  const encoderOptions = getVideoEncoderOptions(video.encoder);

  // Filter Resolutions
  const filteredResolutions = encoderOptions.resolutions.filter((opt) => {
    if (opt.value === "auto") return true;

    // 1. Allowed List Check
    if (allowedResolutions && allowedResolutions.length > 0) {
      return allowedResolutions.includes(opt.value);
    }

    // 2. Max Resolution Check
    if (maxResolution) {
      const max = parseResolution(maxResolution);
      const current = parseResolution(opt.value);
      if (max && current) {
        return current.w * current.h <= max.w * max.h;
      }
    }
    return true;
  });

  // Filter Frame Rates
  const filteredFrameRates = encoderOptions.frameRates.filter((opt) => {
    if (opt.value === "auto") return true;
    if (maxFrameRate) {
      const max = parseFloat(maxFrameRate);
      const current = parseFloat(opt.value);
      if (!isNaN(max) && !isNaN(current)) {
        return current <= max;
      }
    }
    return true;
  });


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
          allowedEncoders={allowedEncoders}
        />

        <VideoResolutionSelect
          value={video.resolution}
          onValueChange={(v) => onVideoChange({ ...video, resolution: v })}
          options={filteredResolutions}
        />

        <VideoFrameRateSelect
          value={video.frameRate}
          onValueChange={(v) => onVideoChange({ ...video, frameRate: v })}
          options={filteredFrameRates}
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
