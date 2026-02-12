import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FORMAT_DATA, FORMAT_CATEGORIES, FORMAT_GROUPS } from "@/data/formats";
import { FormatOption } from "@/types/options";
import {
  AudioSettingsSection,
} from "@/pages/converter/components/AudioSettingsSection";
import VideoSettingsSection from "@/pages/converter/components/VideoSettingsSection";
import { ActiveCategoryEnum } from "@/pages/converter/videos/store";
import { FileType } from "@/types/tasks";
import { ConvertAudioTaskArgs, ConvertImageTaskArgs, ConvertVideoTaskArgs } from "@/lib/bridge";

import CategoryItem from "./CategoryItem";
import { FormatSelectorContentProps } from "./types";
import { ImageSettingsSection } from "@/pages/converter/components/ImageSettingsSection";

export default function FormatSelectorContent({
  config,
  formatRecents,
  addToRecents,
  onValueChange,
  applyConfigToAllTasks,
  onClose,
}: FormatSelectorContentProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = React.useMemo(() => {
    if (searchQuery) {
      return FORMAT_DATA.filter(
        (item) =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.groupId?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (config.activeCategory === ActiveCategoryEnum.Recents) {
      return formatRecents
        .map((f) => FORMAT_DATA.find((item) => item.id === f.id))
        .filter(Boolean) as FormatOption[];
    }

    if (config.activeCategory) {
      return FORMAT_DATA.filter((item) => item.groupId === config.activeCategory);
    }

    return FORMAT_DATA.filter((item) => item.category === config.activeCategory);
  }, [searchQuery, config.activeCategory, formatRecents]);

  const activeCategory = useMemo(() => {
    const formatOption = FORMAT_GROUPS.find((item) => item.id === activeGroup);
    console.log('activeCategory', activeGroup, formatOption)
    return formatOption?.category;
  }, [activeGroup]);

  const formatGroups = React.useMemo(() => {
    if (config.activeCategory === ActiveCategoryEnum.Recents) {
      return FORMAT_GROUPS.filter((item) => formatRecents.some((f) => f.groupId === item.id));
    }
    const groups = FORMAT_GROUPS.filter(
      (item) => item.category === config.activeCategory
    );
    return groups;
  }, [config.activeCategory, filteredItems]);



  useEffect(() => {
    if (formatGroups.length > 0) {
      setActiveGroup((val) => {
        if (val && formatGroups.some((it) => it.id === val)) {
          return val;
        }
        return formatGroups[0].id;
      });
    }
  }, [formatGroups]);

  useEffect(() => {
    if (activeGroup) {
      const item = FORMAT_DATA.find((item) => item.groupId === activeGroup);
      if (item?.id) {
        applySelection(item, { close: false, addRecent: true });
      }
    }
  }, [activeGroup]);

  const applySelection = (
    formatOpt: FormatOption,
    options: { close?: boolean; addRecent?: boolean; resetSearch?: boolean } = {}
  ) => {
    const { close = true, addRecent = true, resetSearch = true } = options;
    if (addRecent) addToRecents(formatOpt);
    if (close) onClose();
    if (resetSearch) setSearchQuery("");

    if (!formatOpt.extension) return;

    const updates = {
      ...config,
      args: {
        ...config.args,
        format: formatOpt.extension,
      },
    };

    onValueChange(updates);
  };

  const renderCustomSettings = () => {
    if (activeCategory === FileType.Audio) {
      const audioArgs = config.args as ConvertAudioTaskArgs;

      return (
        <AudioSettingsSection
          audio_tracks={[
            {
              codec: audioArgs.audio_encoder,
            },
          ]}
          format={audioArgs.format}
          onAudioTracksChange={(tracks) => {
            const next = tracks[0];
            if (!next) return;
            onValueChange({
              ...config,
              args: {
                ...config.args,
                audio_encoder: next.codec,
              },
            });
          }}
          multiTrack={false}
        />
      );
    }

    if (activeCategory === FileType.Video) {
      const videoArgs = config.args as ConvertVideoTaskArgs;
      return (
        <VideoSettingsSection
          config={videoArgs}
          onChange={(next) => {
            onValueChange({
              ...config,
              args: {
                ...config.args,
                ...next,
              },
            });
          }}
        />
      );
    }

    if (activeCategory === FileType.Image) {
      const imageArgs = config.args as ConvertImageTaskArgs;
      return (
        <ImageSettingsSection
          format={imageArgs.format}
          image_encoder={imageArgs.image_encoder}
          resolution={imageArgs.resolution}
          onChange={(next) => {
            onValueChange({
              ...config,
              args: {
                ...config.args,
                ...next,
              },
            });
          }}
        />
      );
    }

    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
        not implemented
      </div>
    );
  };


  return (
    <div className="flex bg-popover h-[400px] overflow-hidden rounded-md border text-popover-foreground">
      <div className="w-[140px] border-r bg-muted/20 flex flex-col">
        <div className="p-2 border-b">
          <div className="flex items-center px-2 py-2 text-sm font-medium text-muted-foreground">
            <Search className="w-4 h-4 mr-2" />
            <input
              className="bg-transparent outline-none w-full placeholder:text-muted-foreground/70"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden py-2">
          <ScrollArea className="h-full ">
            <CategoryItem
              label="Recents"
              icon={Clock}
              active={
                config.activeCategory === ActiveCategoryEnum.Recents &&
                !searchQuery
              }
              onClick={() => {
                onValueChange({
                  ...config,
                  activeCategory: ActiveCategoryEnum.Recents,
                });
                setSearchQuery("");
                setActiveGroup(null);
              }}
            />

            <div className="my-2 h-px bg-border mx-2" />

            {FORMAT_CATEGORIES.map((cat) => (
              <CategoryItem
                key={cat.id}
                label={cat.label}
                icon={cat.icon}
                active={config.activeCategory === cat.id && !searchQuery}
                onClick={() => {
                  const nextCategory = cat.id as any;
                  onValueChange({ ...config, activeCategory: nextCategory });
                  setSearchQuery("");
                  setActiveGroup(null);
                }}
              />
            ))}
          </ScrollArea>
        </div>
      </div>

      <div className="w-[120px] border-r bg-muted/10 flex flex-col">
        <div className="flex-1 overflow-y-auto hide-scrollbar">
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
                    setActiveGroup(group.id);
                  }}
                  className={cn(
                    "cursor-pointer w-full flex items-center justify-between p-2 rounded-md text-left transition-colors",
                    activeGroup === group.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                >
                  <span className="text-sm font-medium">{group.label}</span>
                  {activeGroup === group.id && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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
            确定
          </Button>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => {
              onClose();
            }}
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}
