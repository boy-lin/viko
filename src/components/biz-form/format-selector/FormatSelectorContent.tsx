import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FORMAT_CATEGORIES, FORMAT_OPTIONS } from "@/data/formats";
import {
  AudioSettingsSection,
} from "@/components/biz-form/AudioSettingsSection";
import VideoSettingsSection from "@/components/biz-form/VideoSettingsSection";
import { ActiveCategoryEnum } from "@/pages/converter/videos/store";
import { FileType, MediaTaskType } from "@/types/tasks";
import { ImageSettingsSection } from "@/components/biz-form/ImageSettingsSection";
import { GifSettingsSection } from "@/components/biz-form/GifSettingsSection";
import { FormatGroup, FormatEnum } from "@/types/options";
import ScrollHint, { ScrollHintIndicator } from "@/components/ui-lab/scroll-hint";
import { AUDIO_CONTAINER_DEFINITIONS, IMAGE_CONTAINER_DEFINITIONS, IMAGE_ENCODER_DEFINITIONS, VIDEO_CONTAINER_DEFINITIONS } from "@/data/capabilities";
import { useTranslation } from "react-i18next";
import { AudioTrackConfig, ConvertAudioTaskArgs, ConvertImageTaskArgs, ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";

import CategoryItem from "./CategoryItem";
import { FormatSelectorContentProps } from "./types";

export default function FormatSelectorContent({
  config,
  formatRecents,
  addToRecents,
  onValueChange,
  onClose,
  applyConfigToAllTasks,
  btnLabelKey
}: FormatSelectorContentProps) {
  const [activeGroup, setActiveGroup] = useState<FormatGroup | undefined>();
  const [searchQuery, setSearchQuery] = useState("");

  const activeCategory = useMemo(() => {
    let category = config.activeCategory
    if (category === ActiveCategoryEnum.Recents && formatRecents && formatRecents[0]) {
      category = formatRecents[0].category
    }
    return FORMAT_CATEGORIES.find((item) => item.id === category);
  }, [config.activeCategory, formatRecents]);

  const formatGroups = React.useMemo(() => {
    if (config.activeCategory === ActiveCategoryEnum.Recents) {
      return FORMAT_OPTIONS.filter((item) => formatRecents.some((f) => f.category === item.category));
    }
    const groups = FORMAT_OPTIONS.filter(
      (item) => item.category === config.activeCategory
    );
    return groups;
  }, [config.activeCategory]);


  useEffect(() => {
    if (formatGroups.length === 0) {
      setActiveGroup(undefined);
      return;
    }

    setActiveGroup((prev) => {
      if (prev && formatGroups.some((group) => group.id === prev.id)) {
        return prev;
      }
      const targetId = config?.args?.format || formatGroups[0].id;
      return formatGroups.find((group) => group.id === targetId) || formatGroups[0];
    });
  }, [formatGroups, config?.args?.format]);

  useEffect(() => {
    const item = FORMAT_OPTIONS.find((it) => it.id === activeGroup?.id);
    if (!item) return;
    applySelection(item, {
      close: false,
      addRecent: true,
      resetSearch: false,
    });

  }, [activeGroup])


  const buildAudioArgs = (format: string) => {
    const definition = AUDIO_CONTAINER_DEFINITIONS[format as FormatEnum];
    const audioCodec = definition?.allowedEncoders[0];
    const audioTracks = ((config.args?.audio_tracks as AudioTrackConfig[] | undefined) ?? []).map((track) => ({
      ...track,
      codec: audioCodec,
    }));

    return {
      format,
      audio_tracks: audioTracks,
    };
  };

  const buildVideoArgs = (format: string) => {
    const definition = VIDEO_CONTAINER_DEFINITIONS[format as FormatEnum];
    const videoEncoder = definition?.video?.allowedEncoders[0];
    const audioCodec = definition?.audio?.allowedEncoders[0];
    const audioTracks = ((config.args?.audio_tracks as AudioTrackConfig[] | undefined) ?? []).map((track) => ({
      ...track,
      codec: audioCodec,
    }));

    return {
      format,
      video_encoder: videoEncoder,
      audio_tracks: audioTracks,
    };
  };

  const buildImageArgs = (format: string) => {
    const currentArgs = config.args as ConvertImageTaskArgs;
    const definition = IMAGE_CONTAINER_DEFINITIONS[format as FormatEnum];
    const imageEncoder = definition?.allowedEncoders[0];
    const encoderDefinition = imageEncoder ? IMAGE_ENCODER_DEFINITIONS[imageEncoder] : undefined;
    const width = typeof currentArgs.width === "number"
      ? (encoderDefinition?.maxWidth ? Math.min(currentArgs.width, encoderDefinition.maxWidth) : currentArgs.width)
      : undefined;
    const height = typeof currentArgs.height === "number"
      ? (encoderDefinition?.maxHeight ? Math.min(currentArgs.height, encoderDefinition.maxHeight) : currentArgs.height)
      : undefined;

    return {
      format,
      image_encoder: imageEncoder,
      width,
      height
    };
  };

  const applySelection = (
    formatOpt: FormatGroup,
    options: { close?: boolean; addRecent?: boolean; resetSearch?: boolean } = {}
  ) => {
    const { close = true, addRecent = true, resetSearch = true } = options;
    if (addRecent) addToRecents(formatOpt);
    if (close) onClose();
    if (resetSearch) setSearchQuery("");

    if (!formatOpt.id) return;
    const targetAnimatedImage = formatOpt.id === FormatEnum.GIF;

    const updates = {
      ...config,
      args: {
        ...config.args,
        format: formatOpt.id,
      },
    };

    if (formatOpt.category === FileType.Audio) {
      updates.taskType = MediaTaskType.ConvertToAudio;
      updates.args = buildAudioArgs(formatOpt.id);
    } else if (formatOpt.category === FileType.Video) {
      updates.taskType = MediaTaskType.ConvertToVideo;
      updates.args = buildVideoArgs(formatOpt.id);
    } else if (formatOpt.category === FileType.Image) {
      if (targetAnimatedImage) {
        updates.taskType = MediaTaskType.ConvertToAnimatedImage;
        updates.args = buildImageArgs(formatOpt.id);
      } else {
        updates.taskType = MediaTaskType.ConvertToImage;
        updates.args = buildImageArgs(formatOpt.id);
      }
    }

    onValueChange(updates);
  };

  const handleGroupSelect = (group: FormatGroup) => {
    setActiveGroup(group);
  };

  const renderCustomSettings = () => {
    if (activeCategory?.id === FileType.Audio) {
      const audioArgs = config.args as ConvertAudioTaskArgs;

      return (
        <AudioSettingsSection
          audio_tracks={audioArgs.audio_tracks}
          format={audioArgs.format}
          onAudioTracksChange={(tracks) => {
            const next = tracks[0];
            if (!next) return;
            onValueChange({
              args: {
                audio_tracks: tracks
              },
            });
          }}
          multiTrack={false}
        />
      );
    }

    if (activeCategory?.id === FileType.Video) {
      const videoArgs = config.args as ConvertVideoTaskArgs;
      return (
        <VideoSettingsSection
          format={videoArgs.format}
          video_encoder={videoArgs.video_encoder}
          rc_mode={videoArgs.rc_mode}
          crf={videoArgs.crf}
          video_bitrate={videoArgs.video_bitrate}
          min_bitrate={videoArgs.min_bitrate}
          max_bitrate={videoArgs.max_bitrate}
          resolution={videoArgs.resolution}
          frame_rate={videoArgs.frame_rate}
          color_space={videoArgs.color_space}
          color_range={videoArgs.color_range}
          onChange={(args) => {
            onValueChange({ args });
          }}
        />
      );
    }

    if (activeCategory?.id === FileType.Image) {
      const gifArgs = config.args as ConvertImageTaskArgs;
      if (gifArgs.format === FormatEnum.GIF) {
        return (
          <GifSettingsSection
            format={gifArgs.format}
            width={gifArgs.width}
            height={gifArgs.height}
            frame_rate={gifArgs.frame_rate}
            quality={gifArgs.quality}
            preserve_transparency={gifArgs.preserve_transparency}
            color_mode={gifArgs.color_mode}
            dpi={gifArgs.dpi}
            loop_count={gifArgs.loop_count}
            frame_delay={gifArgs.frame_delay}
            colors={gifArgs.colors}
            preserve_extensions={gifArgs.preserve_extensions}
            sharpen={gifArgs.sharpen}
            denoise={gifArgs.denoise}
            onChange={(args) => onValueChange({ args })}
          />
        );
      }
      const imageArgs = config.args as ConvertImageTaskArgs;
      return (
        <ImageSettingsSection
          format={imageArgs.format}
          image_encoder={imageArgs.image_encoder}
          width={imageArgs.width}
          height={imageArgs.height}
          onChange={(args) => onValueChange({ args })}
        />
      );
    }

    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
        not implemented
      </div>
    );
  };

  const { t } = useTranslation("common");

  return (
    <div className="flex bg-popover h-[400px] overflow-hidden rounded-md border text-popover-foreground">
      <div className="w-[140px] border-r bg-muted/20 flex flex-col">
        {/* <div className="p-2 border-b">
          <div className="flex items-center px-2 py-2 text-sm font-medium text-muted-foreground">
            <Search className="w-4 h-4 mr-2" />
            <input
              className="bg-transparent outline-none w-full placeholder:text-muted-foreground/70"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div> */}

        <div className="flex-1 space-y-1 pt-13">
          <CategoryItem
            className=""
            label={t("common.recents")}
            icon={Clock}
            active={
              config.activeCategory === ActiveCategoryEnum.Recents &&
              !searchQuery
            }
            onClick={() => {
              onValueChange({
                activeCategory: ActiveCategoryEnum.Recents,
              });
              setSearchQuery("");
            }}
          />
          {FORMAT_CATEGORIES.map((cat) => (
            <CategoryItem
              key={cat.id}
              label={cat.label}
              icon={cat.icon}
              active={config.activeCategory === cat.id && !searchQuery}
              onClick={() => {
                const nextCategory = cat.id as any;
                onValueChange({ activeCategory: nextCategory });
                setSearchQuery("");
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="px-2 py-1 border-b">
          <div className="py-1.5">
            {activeCategory?.label}-{activeGroup?.label}
          </div>
        </div>
        <div className="flex-1 flex min-h-0">
          {/* format groups */}
          <div className="w-[120px] border-r bg-muted/10 relative">
            <ScrollHint>
              {({ ref, showHint }) => (
                <>
                  <div
                    ref={ref}
                    className="overflow-y-auto hide-scrollbar h-full"
                  >
                    {formatGroups.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <p className="text-xs">No groups</p>
                      </div>
                    ) : (
                      <div className="space-y-1 p-2">
                        {formatGroups.map((group) => (
                          <button
                            key={group.id}
                            onClick={() => {
                              handleGroupSelect(group);
                            }}
                            className={cn(
                              "cursor-pointer w-full flex items-center justify-between p-2 rounded-md text-left transition-colors",
                              activeGroup?.id === group.id
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-accent/50"
                            )}
                          >
                            <span className="text-sm font-medium">{group.label}</span>
                            {activeGroup?.id === group.id && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {showHint && <ScrollHintIndicator />}
                </>
              )}
            </ScrollHint>
          </div>
          {/* format options */}
          <div className="flex-1 flex flex-col">
            {renderCustomSettings()}
            <div className="p-2 flex gap-2">
              <Button
                className="cursor-pointer"
                onClick={() => {
                  applyConfigToAllTasks(config);
                  onClose();
                }}
              >
                {t(btnLabelKey || "common.confirm")}
              </Button>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => {
                  onClose();
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
