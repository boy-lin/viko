import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AudioTrackConfig, ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { RefreshCw } from "lucide-react";
import { AudioEncoderSelect } from "@/components/biz-form/AudioEncoderSelect";
import { AudioChannelSelect } from "@/components/biz-form/AudioChannelSelect";
import { AudioSampleRateSelect } from "@/components/biz-form/AudioSampleRateSelect";
import { AudioBitrateSelect } from "@/components/biz-form/AudioBitrateSelect";
import { AUDIO_CONTAINER_DEFINITIONS, AUDIO_ENCODER_DEFINITIONS } from "@/data/capabilities";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";

type AudioConversionConfig = Pick<ConvertVideoTaskArgs, "format" | "audio_tracks">


interface AudioSettingsSectionProps extends AudioConversionConfig {
  className?: string;
  onAudioTracksChange: (tracks: AudioTrackConfig[]) => void;
  // 是否为多轨道模式（video 类型）或单轨道模式（audio 类型）
  multiTrack?: boolean;
}

export const AudioSettingsSection: React.FC<AudioSettingsSectionProps> = ({
  format,
  audio_tracks = [],
  onAudioTracksChange,
  multiTrack = false,
  className,
}) => {
  const { t } = useTranslation("task");

  const updateTrack = (index: number, field: keyof AudioTrackConfig, value: string | number) => {
    const newTracks = [...audio_tracks];
    newTracks[index] = { ...newTracks[index], [field]: value };
    onAudioTracksChange(newTracks);
  };


  const onReset = () => {
    onAudioTracksChange([]);
  }
  if (audio_tracks.length === 0) {
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
        <p className="text-muted-foreground">
          {t('settings.audio.noAudioTrackAvailable')}
        </p>
      </div>
    );
  }

  const deencoderDef = React.useMemo(() => {
    if (!format) return undefined;
    return AUDIO_CONTAINER_DEFINITIONS[format as FormatEnum]
  }, [format]);

  // 单轨道模式（audio 类型）
  if (!multiTrack && audio_tracks.length > 0) {
    const track = audio_tracks[0];
    const encoderDefinition = AUDIO_ENCODER_DEFINITIONS[track.codec as AudioEncoderEnum]
    return (
      <div className={cn("", className)}>
        <div className=" p-2 grid grid-cols-2 gap-x-8 gap-y-4">
          <AudioEncoderSelect
            className="space-y-2"
            label={t("settings.audio.fields.encoder")}
            helpText={t("settings.audio.fields.encoderHelp")}
            allowedEncoders={deencoderDef?.allowedEncoders}
            value={track.codec}
            onValueChange={(v) => updateTrack(0, "codec", v)}
            placeholder={t("settings.audio.fields.encoderPlaceholder")}
          />
          <AudioChannelSelect
            className="space-y-2"
            label={t("settings.audio.fields.channel")}
            helpText={t("settings.audio.fields.channelHelp")}
            value={String(track.channels || "auto")}
            onValueChange={(v) => updateTrack(0, "channels", parseInt(v))}
            allowedChannels={encoderDefinition?.allowedChannels}
            placeholder={t("settings.audio.fields.channelPlaceholder")}
          />
          <AudioSampleRateSelect
            className="space-y-2"
            label={t("settings.audio.fields.sampleRate")}
            helpText={t("settings.audio.fields.sampleRateHelp")}
            value={String(track.sample_rate || "auto")}
            onValueChange={(v) => updateTrack(0, "sample_rate", parseInt(v))}
            maxSampleRate={encoderDefinition?.maxSampleRate}
            placeholder={t("settings.audio.fields.sampleRatePlaceholder")}
          />
          <AudioBitrateSelect
            className="space-y-2"
            label={t("settings.audio.fields.bitrate")}
            helpText={t("settings.audio.fields.bitrateHelp")}
            value={String(track.bitrate || "auto")}
            onValueChange={(v) => updateTrack(0, "bitrate", parseInt(v))}
            maxBitrate={encoderDefinition?.maxBitrate}
            placeholder={t("settings.audio.fields.bitratePlaceholder")}
          />
        </div>
      </div>
    );
  }

  // 多轨道模式（video 类型）
  return (
    <div className={cn("flex-1 p-2 space-y-6", className)}>
      {audio_tracks.map((track, index) => {
        const encoderDefinition = AUDIO_ENCODER_DEFINITIONS[track.codec as AudioEncoderEnum]
        return <div key={index} className="space-y-4">
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
              className="space-y-2"
              label={t("settings.audio.fields.encoder")}
              helpText={t("settings.audio.fields.encoderHelp")}
              allowedEncoders={deencoderDef?.allowedEncoders}
              value={track.codec}
              onValueChange={(v) => updateTrack(index, "codec", v)}
              placeholder={t("settings.audio.fields.encoderPlaceholder")}
            />
            <AudioChannelSelect
              className="space-y-2"
              label={t("settings.audio.fields.channel")}
              helpText={t("settings.audio.fields.channelHelp")}
              value={String(track.channels)}
              onValueChange={(v) => updateTrack(index, "channels", parseInt(v))}
              allowedChannels={encoderDefinition?.allowedChannels}
              placeholder={t("settings.audio.fields.channelPlaceholder")}
            />
            <AudioSampleRateSelect
              className="space-y-2"
              label={t("settings.audio.fields.sampleRate")}
              helpText={t("settings.audio.fields.sampleRateHelp")}
              value={String(track.sample_rate)}
              onValueChange={(v) => updateTrack(index, "sample_rate", parseInt(v))}
              maxSampleRate={encoderDefinition?.maxSampleRate}
              placeholder={t("settings.audio.fields.sampleRatePlaceholder")}
            />
            <AudioBitrateSelect
              className="space-y-2"
              label={t("settings.audio.fields.bitrate")}
              helpText={t("settings.audio.fields.bitrateHelp")}
              value={String(track.bitrate)}
              onValueChange={(v) => updateTrack(index, "bitrate", parseInt(v))}
              maxBitrate={encoderDefinition?.maxBitrate}
              placeholder={t("settings.audio.fields.bitratePlaceholder")}
            />
          </div>
        </div>
      })}
    </div>
  );
};
