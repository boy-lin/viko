import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AudioTrackConfig } from "@/types/converter";
import { RefreshCw } from "lucide-react";
import { AudioEncoderSelect } from "@/components/biz-form/AudioEncoderSelect";
import { AudioChannelSelect } from "@/components/biz-form/AudioChannelSelect";
import { AudioSampleRateSelect } from "@/components/biz-form/AudioSampleRateSelect";
import { AudioBitrateSelect } from "@/components/biz-form/AudioBitrateSelect";
import { getAudioEncoderOptions } from "@/data/capabilities";
import { useTranslation } from "react-i18next";

interface AudioSettingsSectionProps {
  audioTracks: AudioTrackConfig[];
  outputFormat: string;
  onAudioTracksChange: (tracks: AudioTrackConfig[]) => void;
  onReset?: () => void;
  // 是否为多轨道模式（video 类型）或单轨道模式（audio 类型）
  multiTrack?: boolean;
}

export const AudioSettingsSection: React.FC<AudioSettingsSectionProps> = ({
  audioTracks,
  outputFormat,
  onAudioTracksChange,
  onReset,
  multiTrack = false,
}) => {
  const { t } = useTranslation("converter");
  const updateTrack = (index: number, field: keyof AudioTrackConfig, value: string) => {
    const newTracks = [...audioTracks];
    newTracks[index] = { ...newTracks[index], [field]: value };
    onAudioTracksChange(newTracks);
  };
  const getEncoderOptions = (encoder?: string) => getAudioEncoderOptions(encoder);

  if (audioTracks.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">{t("settings.audio.title")}</h3>
          {onReset && (
            <Button variant="ghost" size="icon" onClick={onReset}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-muted-foreground">No audio track available.</p>
      </div>
    );
  }

  // 单轨道模式（audio 类型）
  if (!multiTrack && audioTracks.length > 0) {
    const track = audioTracks[0];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">{t("settings.audio.title")}</h3>
          {onReset && (
            <Button variant="ghost" size="icon" onClick={onReset}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <AudioEncoderSelect
            value={track.encoder}
            onValueChange={(v) => updateTrack(0, "encoder", v)}
            format={outputFormat}
          />
          <AudioChannelSelect
            value={track.channels}
            onValueChange={(v) => updateTrack(0, "channels", v)}
            options={getEncoderOptions(track.encoder).channels}
          />
          <AudioSampleRateSelect
            value={track.sampleRate}
            onValueChange={(v) => updateTrack(0, "sampleRate", v)}
            options={getEncoderOptions(track.encoder).sampleRates}
          />
          <AudioBitrateSelect
            value={track.bitrate}
            onValueChange={(v) => updateTrack(0, "bitrate", v)}
            options={getEncoderOptions(track.encoder).bitrates}
          />
        </div>
      </div>
    );
  }

  // 多轨道模式（video 类型）
  return (
    <div className="space-y-6">
      {audioTracks.map((track, index) => (
        <div key={index} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`audio-check-${index}`}
                checked={true}
                onCheckedChange={() => {
                  // TODO: Logic to remove/disable track
                }}
              />
              <Label
                htmlFor={`audio-check-${index}`}
                className="font-bold text-lg cursor-pointer"
              >
                {t("settings.audio.trackLabel", { index: index + 1 })}
              </Label>
            </div>
            {onReset && (
              <Button variant="ghost" size="icon" onClick={onReset}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <AudioEncoderSelect
              value={track.encoder}
              onValueChange={(v) => updateTrack(index, "encoder", v)}
              format={outputFormat}
            />
            <AudioChannelSelect
              value={track.channels}
              onValueChange={(v) => updateTrack(index, "channels", v)}
              options={getEncoderOptions(track.encoder).channels}
            />
            <AudioSampleRateSelect
              value={track.sampleRate}
              onValueChange={(v) => updateTrack(index, "sampleRate", v)}
              options={getEncoderOptions(track.encoder).sampleRates}
            />
            <AudioBitrateSelect
              value={track.bitrate}
              onValueChange={(v) => updateTrack(index, "bitrate", v)}
              options={getEncoderOptions(track.encoder).bitrates}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
