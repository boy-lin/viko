import React, { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Search, Star, Clock, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FORMAT_DATA, FORMAT_CATEGORIES } from "@/data/formats";
import { EncoderEnum, FormatOption } from "@/types/options";
import { useConverterStore } from "@/stores/converterStore";

interface FormatSelectorProps {
  format: string;
  encoder?: string;
  resolution?: string;
  rate?: string;
  onValueChange: (updates: {
    outputFormat: string;
    videoEncoder?: string;
    resolution?: string;
    audioBitrate?: string;
    audioEncoder?: string;
  }) => void;
  className?: string;
}

export const FormatSelector: React.FC<FormatSelectorProps> = ({
  format,
  encoder,
  resolution,
  rate, // bitrate or sample rate context
  onValueChange,
  className,
}) => {
  /* State for 3-Level Navigation */
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("favorites");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { formatFavorites, formatRecents, addToRecents, toggleFavorite } = useConverterStore();

  // Find the selected format based on props
  const selectedFormat = React.useMemo(() => {
    // 1. Try to find precise match including resolution/rate
    let match = FORMAT_DATA.find(f => {
      if (f.extension !== format) return false;

      // If resolution provided, check quality match
      if (resolution && f.quality === resolution) return true;

      // If rate provided (e.g. 320k), check quality match
      if (rate && f.quality === `${rate}k`) return true;

      return false;
    });

    // 2. Fallback to just format extension
    if (!match) {
      match = FORMAT_DATA.find(f => f.extension === format);
    }

    return match;
  }, [format, resolution, rate]);

  const value = selectedFormat?.id || "";

  // Reset group when category changes
  useEffect(() => {
    setActiveGroup(null);
  }, [activeCategory]);

  // Derived Data
  const formatGroups = React.useMemo(() => {
    if (["favorites", "recents"].includes(activeCategory)) return [];

    // Get all items in current category
    const categoryItems = FORMAT_DATA.filter(item => item.category === activeCategory);

    // Extract unique groups
    const groups = Array.from(new Set(categoryItems.map(item => item.group))).filter(Boolean);
    return groups;
  }, [activeCategory]);

  const filteredItems = React.useMemo(() => {
    // 1. Search Mode (Global Search)
    if (searchQuery) {
      return FORMAT_DATA.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.group?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // 2. Special Categories (Flat List)
    if (activeCategory === "favorites") {
      return FORMAT_DATA.filter(item => formatFavorites.includes(item.id));
    }
    if (activeCategory === "recents") {
      return formatRecents.map(id => FORMAT_DATA.find(f => f.id === id)).filter(Boolean) as FormatOption[];
    }

    // 3. Category Mode
    // If a group is selected, show items in that group
    if (activeGroup) {
      return FORMAT_DATA.filter(item =>
        item.category === activeCategory && item.group === activeGroup
      );
    }

    // If no group selected (and not special category), we might not show items directly
    // unless we want to show "All" or similar. But the UI will switch to Group View.
    return [];
  }, [searchQuery, activeCategory, activeGroup, formatFavorites, formatRecents]);

  const handleSelect = (formatId: string) => {
    // onValueChange(formatId);
    addToRecents(formatId);
    setOpen(false);
    setSearchQuery("");

    // Calculate updates
    const preset = FORMAT_DATA.find(f => f.id === formatId);
    if (!preset) return;

    const updates: any = {
      outputFormat: preset.extension || 'mp4',
    };

    // Video Resolution
    if (preset.category.includes('video') && preset.quality && preset.quality !== 'original') {
      updates.resolution = preset.quality;
    }

    // Audio Specifics
    if (preset.category === 'audio') {
      // Bitrate (e.g., 320k)
      const bitrateMatch = preset.quality?.match(/(\d+)k/);
      if (bitrateMatch) {
        updates.audioBitrate = bitrateMatch[1];
      }

      // Encoder inference
      if (preset.extension === 'm4r') {
        updates.audioEncoder = EncoderEnum.AAC;
        // standard ringtone bitrate
        if (!updates.audioBitrate) updates.audioBitrate = '256';
      } else if (preset.group === 'MP3') {
        updates.audioEncoder = EncoderEnum.MP3;
      } else if (preset.tags?.includes('aac')) {
        updates.audioEncoder = EncoderEnum.AAC;
      }
    }

    onValueChange(updates);
  };

  const currentCategoryLabel = React.useMemo(() => {
    if (activeCategory === 'favorites') return "Favorites";
    if (activeCategory === 'recents') return "Recently Used";
    return FORMAT_CATEGORIES.find(c => c.id === activeCategory)?.label;
  }, [activeCategory]);

  const showGroupsView = !searchQuery && !activeGroup && !["favorites", "recents"].includes(activeCategory);

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
              <span className="font-semibold">{selectedFormat.label.split("-")[0]}</span>
              <span className="text-muted-foreground text-xs">{selectedFormat.quality}</span>
            </span>
          ) : (
            "Select format..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[600px] p-0" align="start">
        <div className="flex bg-popover h-[350px] overflow-hidden rounded-md border text-popover-foreground">

          {/* Left Sidebar: Categories (Level 1) */}
          <div className="w-[180px] border-r bg-muted/20 flex flex-col">
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
                  id="favorites"
                  label="Favorites"
                  icon={Star}
                  active={activeCategory === 'favorites' && !searchQuery}
                  onClick={() => { setActiveCategory('favorites'); setSearchQuery(''); }}
                />
                <CategoryItem
                  id="recents"
                  label="Recents"
                  icon={Clock}
                  active={activeCategory === 'recents' && !searchQuery}
                  onClick={() => { setActiveCategory('recents'); setSearchQuery(''); }}
                />

                <div className="my-2 h-px bg-border mx-2" />

                {/* Standard Categories */}
                {FORMAT_CATEGORIES.map(cat => (
                  <CategoryItem
                    key={cat.id}
                    id={cat.id}
                    label={cat.label}
                    icon={cat.icon}
                    active={activeCategory === cat.id && !searchQuery}
                    onClick={() => { setActiveCategory(cat.id); setSearchQuery(''); }}
                  />
                ))}
              </ScrollArea>
            </div>
          </div>

          {/* Right Side: Groups (Level 2) or Options (Level 3) */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="p-3 border-b bg-muted/10 font-medium text-sm flex justify-between items-center h-[50px]">
              {searchQuery ? (
                <span>Search Results</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className={cn(activeGroup ? "text-muted-foreground cursor-pointer hover:underline" : "")}
                    onClick={() => activeGroup && setActiveGroup(null)}>
                    {currentCategoryLabel}
                  </span>
                  {activeGroup && (
                    <>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      <span>{activeGroup}</span>
                    </>
                  )}
                </div>
              )}
              <span className="text-xs text-muted-foreground">
                {showGroupsView ? `${formatGroups.length} groups` : `${filteredItems.length} options`}
              </span>
            </div>

            <div className="flex-1 overflow-hidden p-2">
              <ScrollArea className="h-full">

                {/* View 1: Groups List (Level 2) */}
                {showGroupsView && (
                  <div className="grid grid-cols-2 gap-2 p-1">
                    {formatGroups.map(group => (
                      <button
                        key={group}
                        onClick={() => setActiveGroup(group)}
                        className="flex items-center justify-between p-3 rounded-md border bg-card hover:bg-accent hover:text-accent-foreground transition-all text-left"
                      >
                        <span className="font-medium text-sm">{group}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                      </button>
                    ))}
                  </div>
                )}

                {/* View 2: Options List (Level 3 or Flat List) */}
                {!showGroupsView && (
                  <>
                    {filteredItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <p className="text-sm">No formats found.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-1">
                        {filteredItems.map(item => (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelect(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSelect(item.id);
                              }
                            }}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-md hover:bg-accent hover:text-accent-foreground text-left transition-colors group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              value === item.id && "bg-accent/50"
                            )}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{item.label}</span>
                              <div className="flex items-end gap-2 max-w-[300px] text-xs text-muted-foreground">
                                <span className=" whitespace-nowrap">{item.quality} • {item.extension?.toUpperCase()}</span>
                                {item.description && (
                                  <span className="truncate" title={item.description}>
                                    ({item.description})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-6 w-6", formatFavorites.includes(item.id) ? "text-yellow-400 opacity-100" : "text-muted-foreground")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(item.id);
                                }}
                              >
                                <Star className={cn("w-3 h-3", formatFavorites.includes(item.id) && "fill-current")} />
                              </Button>
                              {value === item.id && <Check className="w-4 h-4 text-primary" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Helper component for category listing
const CategoryItem = ({ id, label, icon: Icon, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 text-muted-foreground rounded-r-full mr-2",
      active && "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
    )}
  >
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </div>
    {active && <ChevronRight className="w-3 h-3" />}
  </button>
);
