import React, { useState, useEffect, useMemo } from "react";
import {
  Check,
  ChevronsUpDown,
  Search,
  Clock,
  ChevronRight,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FORMAT_DATA, FORMAT_CATEGORIES, FORMAT_GROUPS } from "@/data/formats";
import { FormatOption } from "@/types/options";
import { AudioSettingsSection } from "@/pages/converter/components/AudioSettingsSection";
import { VideoSettingsSection } from "@/pages/converter/components/VideoSettingsSection";
import { VideoSimpleSettings } from "@/pages/converter/components/VideoSimpleSettings";
import { GlobalConverterConfig, ActiveCategoryEnum } from "@/pages/converter/videos/store";
import { FileType } from "@/types/tasks";
import { ConvertAudioTaskArgs, ConvertVideoTaskArgs } from "@/lib/bridge";
import { Tooltip, TooltipTrigger } from "@radix-ui/react-tooltip";
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
  config: GlobalConverterConfig;
  onValueChange?: (config: GlobalConverterConfig) => void;
  className?: string;
  formatRecents: FormatOption[];
  addToRecents: (format: FormatOption) => void;
  applyConfigToAllTasks: (config: GlobalConverterConfig) => void;
}

// 共享的内容组件 Props
interface FormatSelectorContentProps {
  config: GlobalConverterConfig;
  formatRecents: FormatOption[];
  addToRecents: (format: FormatOption) => void;
  onValueChange: (config: GlobalConverterConfig) => void;
  applyConfigToAllTasks: (config: GlobalConverterConfig) => void;
  onClose: () => void;
}

// 共享的内容组件
const FormatSelectorContent: React.FC<FormatSelectorContentProps> = ({
  config,
  formatRecents,
  addToRecents,
  onValueChange,
  applyConfigToAllTasks,
  onClose,
}) => {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const activeCategory = useMemo<string>(() => {
    if (config.activeCategory === ActiveCategoryEnum.Recents && formatRecents.length > 0) {
      return formatRecents[0].category
    }
    return config.activeCategory
  }, [config.activeCategory, formatRecents]);
  const [searchQuery, setSearchQuery] = useState("");
  const [openAdvanced, setOpenAdvanced] = useState(false);

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
    if (config.activeCategory === ActiveCategoryEnum.Recents) {
      return formatRecents
        .map((f) => FORMAT_DATA.find((item) => item.id === f.id))
        .filter(Boolean) as FormatOption[];
    }


    if (config.activeCategory) {
      return FORMAT_DATA.filter(
        (item) => item.groupId === config.activeCategory
      );
    }

    // If no group selected, show all items in the category
    return FORMAT_DATA.filter(
      (item) => item.category === config.activeCategory
    );
  }, [
    searchQuery,
    config.activeCategory,
    formatRecents,
  ]);

  // Derived Data
  const formatGroups = React.useMemo(() => {
    if (config.activeCategory === ActiveCategoryEnum.Recents) {
      return filteredItems.filter(item => {
        return item.category === config.activeCategory
      });
    }
    // Get all items in current category
    const groups = FORMAT_GROUPS.filter(
      (item) => item.category === config.activeCategory
    );
    return groups;
  }, [config.activeCategory, filteredItems]);

  useEffect(() => {
    if (formatGroups.length > 0) {
      setActiveGroup((val) => {
        if (val && formatGroups.some(it => it.id === val)) {
          return val
        }
        return formatGroups[0].id
      });
    }
  }, [formatGroups]);

  useEffect(() => {
    if (activeGroup) {
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
    if (addRecent) addToRecents(formatOpt);
    if (close) onClose();
    if (resetSearch) setSearchQuery("");

    if (!formatOpt.extension) return;

    const updates: GlobalConverterConfig = {
      ...config,
      args: {
        ...config.args,
        format: formatOpt.extension,
      },
      activeCategory: formatOpt.category as any,
    };

    // 根据 formatType 设置对应的字段
    if (activeCategory === FileType.Video) {
      updates.args = {
        ...updates.args,
      };
    } else if (activeCategory === FileType.Audio) {
      updates.args = {
        ...updates.args,
      };
    } else if (activeCategory === FileType.Image) {
      updates.args = {
        ...updates.args,
      };
    }
    console.log("updates", updates);
    onValueChange(updates);
  };

  const renderAdvancedSettings = () => {
    if (activeCategory === FileType.Audio) {
      const audioArgs = config.args as ConvertAudioTaskArgs;

      return (
        <AudioSettingsSection
          audio_tracks={[{
            codec: audioArgs.audio_encoder,
          }]}
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
      if (!openAdvanced) {
        return <VideoSimpleSettings
          resolution={videoArgs.resolution}
          video_bitrate={videoArgs.video_bitrate}
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
      }
      return (
        <VideoSettingsSection
          format={videoArgs.format}
          video_encoder={videoArgs.video_encoder}
          resolution={videoArgs.resolution}
          frame_rate={videoArgs.frame_rate}
          video_bitrate={videoArgs.video_bitrate}
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
        高级配置占位，后续补充
      </div>
    );
  };

  return (
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
          <ScrollArea className="h-full ">
            {/* Special Categories */}
            <CategoryItem
              id={ActiveCategoryEnum.Recents}
              label="Recents"
              icon={Clock}
              active={config.activeCategory === ActiveCategoryEnum.Recents && !searchQuery}
              onClick={() => {
                onValueChange({ ...config, activeCategory: ActiveCategoryEnum.Recents });
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
                active={config.activeCategory === cat.id && !searchQuery}
                onClick={() => {
                  const activeCategory = cat.id as any;
                  onValueChange({ ...config, activeCategory });
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
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
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
                  "cursor-pointer px-3 py-1 transition-colors",
                  !openAdvanced ? "bg-muted text-foreground" : "text-muted-foreground"
                )}
                onClick={() => setOpenAdvanced(false)}
              >
                简易设置
              </button>
              <button
                type="button"
                className={cn(
                  "cursor-pointer px-3 py-1 transition-colors",
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

          {renderAdvancedSettings()}

        </div>
        <div className="p-2 flex gap-2">
          <Button className="cursor-pointer" onClick={() => {
            applyConfigToAllTasks(config)
            onClose()
          }}>
            确定
          </Button>
          <Button variant="outline" className="cursor-pointer" onClick={() => {
            onClose()
          }}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
};

// Popover 版本的组件
export const FormatSelectorPopover: React.FC<FormatSelectorProps> = (props) => {
  const { config, formatRecents, addToRecents, onValueChange = () => { }, className, applyConfigToAllTasks } = props;
  const [open, setOpen] = useState(false);

  // Find the selected format based on props
  const selectedFormat = React.useMemo(() => {
    let label

    if (config.activeCategory === FileType.Video) {
      const args = config.args as ConvertVideoTaskArgs
      label = `${args?.resolution ? `(${args?.resolution})` : 'Auto'}`
    } else if (config.activeCategory === FileType.Audio) {
      const args = config.args as ConvertAudioTaskArgs
      label = ``
    }
    return {
      extension: config.args.format,
      label
    };
  }, [config.args, config.activeCategory]);

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
        <FormatSelectorContent
          config={config}
          formatRecents={formatRecents}
          addToRecents={addToRecents}
          onValueChange={onValueChange}
          applyConfigToAllTasks={applyConfigToAllTasks}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
};

// Dialog 版本的组件
export const FormatSelectorDialog: React.FC<FormatSelectorProps> = (props) => {
  const { config, formatRecents, addToRecents, onValueChange = () => { }, className, applyConfigToAllTasks } = props;
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-expanded={open}
          className={cn("cursor-pointer flex items-center justify-center", className)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 sm:max-w-[72vw]" showCloseButton={true}>
        <FormatSelectorContent
          config={config}
          formatRecents={formatRecents}
          addToRecents={addToRecents}
          onValueChange={onValueChange}
          applyConfigToAllTasks={applyConfigToAllTasks}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

// 向后兼容：保留原来的导出，默认使用 Popover
export const FormatSelector = FormatSelectorPopover;

// Helper component for category listing
const CategoryItem = ({ label, icon: Icon, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "cursor-pointer w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 text-muted-foreground rounded-r-lg mr-2",
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
