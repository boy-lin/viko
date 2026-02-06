import React, { useState, useEffect } from "react";
import {
  Check,
  ChevronsUpDown,
  Search,
  Clock,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMAT_DATA, FORMAT_CATEGORIES, FORMAT_GROUPS } from "@/data/formats";
import { FormatOption } from "@/types/options";
import { useConverterStore } from "@/stores/converterStore";
import { AUDIO_ENCODERS } from "@/data/encoders";
import { AudioSettingsSection } from "@/pages/converter/components/AudioSettingsSection";
import { VideoSettingsSection } from "@/pages/converter/components/VideoSettingsSection";
import { AudioTrackConfig, VideoTrackConfig } from "@/types/tasks";
import { VideoSimpleSettings } from "@/pages/converter/components/VideoSimpleSettings";
import { Link2 } from "lucide-react";

import { CONTAINER_DEFINITIONS, getAudioEncoderOptions } from "@/data/capabilities";
export interface FormatSelectorValue {
  group: string;
  outputFormat: string;
  // Video fields
  videoEncoder?: string;
  resolution?: string;
  // Audio fields
  audioEncoder?: string;
  audioBitrate?: string;
  audioSampleRate?: string;
  audioChannels?: string;
  // Image fields
  quality?: string;
}

// 联合类型
export interface FormatSelectorProps {
  onValueChange: (formatType: string, updates: FormatSelectorValue) => void;
  className?: string;
}

export const FormatSelector: React.FC<FormatSelectorProps> = (props) => {
  const { onValueChange, className } = props;
  const { globalConfig, formatRecents, addToRecents } = useConverterStore();

  const [open, setOpen] = useState(false);
  // 首次打开时，如果 recents 有值就打开 recents 分类
  const [activeCategory, setActiveCategory] = useState<string>(
    formatRecents.length > 0 ? "recents" : FORMAT_CATEGORIES[0]?.id
  );
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openAdvanced, setOpenAdvanced] = useState(false);

  // Find the selected format based on props
  const selectedFormat = React.useMemo(() => {
    // 1. Try to find precise match including resolution/rate/quality
    let match = FORMAT_DATA.find((f) => {
      if (f.extension !== globalConfig.outputFormat) return false;
      // Video: check resolution match
      if (
        f.videoResolution === globalConfig.video?.resolution
      ) {
        return true;
      }
      // Audio: check bitrate match (e.g. 320k)
      if (
        f.audioBitrate === globalConfig.audioTracks?.[0]?.bitrate
      ) {
        return true;
      }
      // Image: check quality or resolution match
      if (f.imageResolution === globalConfig.image?.resolution) {
        return true;
      }

      return false;
    });

    // 2. Fallback to just format extension
    if (!match) {
      match = FORMAT_DATA.find((f) => f.extension === globalConfig.outputFormat);
    }

    return match;
  }, [
    globalConfig.outputFormat,
    globalConfig.video?.resolution,
    globalConfig.audioTracks?.[0]?.bitrate,
    globalConfig.image?.resolution,
  ]);

  const formatCategory = { type: selectedFormat?.category || globalConfig.type };

  const filteredItems = React.useMemo(() => {
    // 1. Search Mode (Global Search)
    if (searchQuery) {
      return FORMAT_DATA.filter(
        (item) =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.groupId?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 2. Special Categories (Flat List - no groups)
    if (activeCategory === "recents") {
      return formatRecents
        .map((id) => FORMAT_DATA.find((f) => f.id === id))
        .filter(Boolean) as FormatOption[];
    }


    if (activeGroup) {
      return FORMAT_DATA.filter(
        (item) => item.groupId === activeGroup
      );
    }

    // If no group selected, show all items in the category
    return FORMAT_DATA.filter(
      (item) => item.category === activeCategory
    );
  }, [
    searchQuery,
    activeCategory,
    activeGroup,
    formatRecents,
  ]);

  // Derived Data
  const formatGroups = React.useMemo(() => {
    if (["recents"].includes(activeCategory)) {
      return FORMAT_GROUPS.filter(item => {
        return filteredItems.some(f => f.groupId === item.id);
      });
    }
    // Get all items in current category
    const groups = FORMAT_GROUPS.filter(
      (item) => item.category === activeCategory
    );
    return groups;
  }, [activeCategory, filteredItems]);

  useEffect(() => {
    const firstGroup = FORMAT_GROUPS.find((g) => g.category === activeCategory)
    if (firstGroup?.id) {
      setActiveGroup(firstGroup?.id);
    }
  }, [activeCategory]);

  useEffect(() => {
    if (activeGroup) {
      console.log("activeGroup", activeGroup);
      const item = FORMAT_DATA.find((item) => item.groupId === activeGroup)
      if (item?.id) {
        applySelection(item, { close: false, addRecent: true })
      }
    }
  }, [activeGroup]);

  const applySelection = (
    formatOpt: FormatOption,
    options: { close?: boolean; addRecent?: boolean; resetSearch?: boolean } = {}
  ) => {
    const { close = true, addRecent = true, resetSearch = true } = options;
    if (addRecent) addToRecents(formatOpt.id);
    if (close) setOpen(false);
    if (resetSearch) setSearchQuery("");

    if (!formatOpt.extension) return;

    const updates: FormatSelectorValue = {
      outputFormat: formatOpt.extension,
      group: formatOpt.groupId,
    };

    // 根据 formatType 设置对应的字段
    if (formatOpt.audioBitrate === "video") {
      const caps = CONTAINER_DEFINITIONS[formatOpt.groupId];
      updates.resolution = caps.video?.defaultResolution;
      updates.videoEncoder = caps.video?.defaultEncoder;
      updates.audioEncoder = caps.audio?.defaultEncoder;
    } else if (formatCategory?.type === "audio") {
      if (formatOpt.audioBitrate) {
        updates.audioBitrate = formatOpt.audioBitrate;
      } else {
        updates.audioBitrate = "auto";
      }

      const encoder = AUDIO_ENCODERS.find((encoder) =>
        encoder.formats?.includes(updates.outputFormat.toLowerCase())
      );
      console.log("encoder", encoder);

      if (encoder) {
        updates.audioEncoder = encoder.value;
        const options = getAudioEncoderOptions(encoder.value);
        if (options.sampleRates.length) {
          updates.audioSampleRate = options.sampleRates[0].value;
        }
        if (options.channels.length) {
          updates.audioChannels = options.channels[0].value;
        }
        if (options.bitrates.length) {
          updates.audioBitrate = options.bitrates[0].value;
        }
      }
    } else if (formatCategory?.type === "image") {
      // Image Quality
      if (formatOpt.imageResolution) {
        updates.quality = formatOpt.imageResolution;
      }
      // Image Resolution (如果有)
      if (formatOpt.imageResolution && formatOpt.imageResolution.includes("x")) {
        updates.resolution = formatOpt.imageResolution;
      }
    }

    onValueChange(formatCategory?.type, updates);
  };

  const renderAdvancedSettings = () => {
    if (formatCategory?.type === "audio") {
      const track: AudioTrackConfig = {
        trackIndex: 0,
        encoder: globalConfig.audioTracks?.[0]?.encoder || "auto",
        bitrate: globalConfig.audioTracks?.[0]?.bitrate || "auto",
        sampleRate: globalConfig.audioTracks?.[0]?.sampleRate || "auto",
        channels: globalConfig.audioTracks?.[0]?.channels || "auto",
      };
      return (
        <AudioSettingsSection
          audioTracks={[track]}
          outputFormat={globalConfig.outputFormat}
          onAudioTracksChange={(tracks) => {
            const next = tracks[0];
            if (!next) return;
            onValueChange("audio", {
              outputFormat: globalConfig.outputFormat,
              group: selectedFormat?.groupId || "",
              audioEncoder: next.encoder,
              audioBitrate: next.bitrate,
              audioSampleRate: next.sampleRate,
              audioChannels: next.channels,
            });
          }}
          multiTrack={false}
        />
      );
    }

    if (formatCategory?.type === "video") {
      const video: VideoTrackConfig = {
        encoder: globalConfig.video?.encoder || "auto",
        resolution: globalConfig.video?.resolution || "auto",
        frameRate: undefined,
        bitrate: undefined,
      };
      return (
        <VideoSettingsSection
          video={video}
          onVideoChange={(next) => {
            onValueChange("video", {
              outputFormat: globalConfig.outputFormat,
              group: selectedFormat?.groupId || "",
              videoEncoder: next.encoder,
              resolution: next.resolution,
            });
          }}
        />
      );
    }

    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
        高级配置占位，后续补充
      </div>
    );
  };

  const handleSelect = (format: FormatOption) => {
    applySelection(format);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[240px] justify-between", className)}
        >
          {selectedFormat ? (
            <span className="flex items-center gap-2 truncate">
              {/* Can add icon here based on category */}
              <span className="font-semibold">
                {selectedFormat.extension?.toUpperCase()}
              </span>
              <span className="text-muted-foreground text-xs">
                {selectedFormat.label}
              </span>
            </span>
          ) : (
            "Select format..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[680px] p-0" align="start">
        <div className="flex bg-popover h-[400px] overflow-hidden rounded-md border text-popover-foreground">
          {/* Left Column: Categories (Level 1) */}
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
              <ScrollArea className="h-full">
                {/* Special Categories */}
                <CategoryItem
                  id="recents"
                  label="Recents"
                  icon={Clock}
                  active={activeCategory === "recents" && !searchQuery}
                  onClick={() => {
                    setActiveCategory("recents");
                    setSearchQuery("");
                    setActiveGroup(null);
                  }}
                />

                <div className="my-2 h-px bg-border mx-2" />

                {/* Standard Categories */}
                {FORMAT_CATEGORIES.map((cat) => (
                  <CategoryItem
                    key={cat.id}
                    id={cat.id}
                    label={cat.label}
                    icon={cat.icon}
                    active={activeCategory === cat.id && !searchQuery}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setSearchQuery("");
                      setActiveGroup(null);
                    }}
                  />
                ))}
              </ScrollArea>
            </div>
          </div>

          {/* Middle Column: Groups (Level 2) - Only show for standard categories */}
          <div className="w-[120px] border-r bg-muted/10 flex flex-col">
            <div className="flex-1 overflow-hidden p-2">
              <ScrollArea className="h-full">
                {formatGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <p className="text-xs">No groups</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {formatGroups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => {
                          setActiveGroup(group.id);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between p-2 rounded-md text-left transition-colors",
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
              </ScrollArea>
            </div>
          </div>

          {/* Right Column: Options (Level 3) */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="p-3 border-b bg-muted/10 font-medium text-sm flex justify-between items-center h-[50px]">
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-full border border-border bg-background text-xs font-medium overflow-hidden">
                  <button
                    type="button"
                    className={cn(
                      "px-3 py-1 transition-colors",
                      !openAdvanced ? "bg-muted text-foreground" : "text-muted-foreground"
                    )}
                    onClick={() => setOpenAdvanced(false)}
                  >
                    简易设置
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "px-3 py-1 transition-colors",
                      openAdvanced ? "bg-muted text-foreground" : "text-muted-foreground"
                    )}
                    onClick={() => setOpenAdvanced(true)}
                  >
                    高级设置
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-2">
              {openAdvanced ? (
                <div className="h-full">
                  {renderAdvancedSettings()}
                </div>
              ) : formatCategory?.type === "video" ? (
                <VideoSimpleSettings
                  resolution={globalConfig.video?.resolution}
                  onResolutionChange={(value) => {
                    onValueChange("video", {
                      outputFormat: globalConfig.outputFormat,
                      group: selectedFormat?.groupId || "",
                      resolution: value,
                      videoEncoder: globalConfig.video?.encoder,
                    });
                  }}
                />
              ) : (
                <ScrollArea className="h-full">
                  {filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <p className="text-sm">No formats found.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1">
                      {filteredItems.map((item) => (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelect(item)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSelect(item);
                            }
                          }}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-md hover:bg-accent hover:text-accent-foreground text-left transition-colors group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            selectedFormat?.id === item.id && "bg-accent/50"
                          )}
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {item.label}
                            </span>
                            <div className="flex items-end gap-2 max-w-[300px] text-xs text-muted-foreground">
                              <span className=" whitespace-nowrap">
                                {item.extension?.toUpperCase()}
                              </span>
                              {item.description && (
                                <span
                                  className="truncate"
                                  title={item.description}
                                >
                                  ({item.description})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {selectedFormat?.id === item.id && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Helper component for category listing
const CategoryItem = ({ label, icon: Icon, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 text-muted-foreground rounded-r-full mr-2",
      active &&
      "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
    )}
  >
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </div>
    {active && <ChevronRight className="w-3 h-3" />}
  </button>
);
