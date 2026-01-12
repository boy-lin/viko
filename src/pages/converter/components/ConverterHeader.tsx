import React from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConverterStore } from "@/stores/converterStore";
import { HighSpeedConversionBadge } from "./HighSpeedConversionBadge";

interface ConverterHeaderProps {
  activeTab: "converting" | "finished";
  onTabChange: (tab: "converting" | "finished") => void;
  convertingCount: number;
}

export const ConverterHeader: React.FC<ConverterHeaderProps> = ({
  activeTab,
  onTabChange,
  convertingCount,
}) => {
  const { addFiles, unreadFinishedCount, resetUnreadFinishedCount } =
    useConverterStore();

  const handleTabChange = (tab: "converting" | "finished") => {
    onTabChange(tab);
    if (tab === "finished") {
      resetUnreadFinishedCount();
    }
  };

  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex bg-transparent">
          {/* Tabs. In a real app we might use a Tabs component, but for this specific look a custom simple toggle is good or just buttons. */}
          <button
            onClick={() => handleTabChange("converting")}
            className={cn(
              "px-0 pr-4 py-2 font-semibold text-lg relative",
              activeTab === "converting"
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            Converting({convertingCount})
            {activeTab === "converting" && (
              <span className="absolute bottom-1 left-0 right-4 h-0.5 bg-purple-600 rounded-full" />
            )}
          </button>
          <button
            onClick={() => handleTabChange("finished")}
            className={cn(
              "px-4 py-2 font-semibold text-lg relative flex items-center gap-1",
              activeTab === "finished"
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            Finished
            {unreadFinishedCount > 0 && activeTab !== "finished" && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 h-4 rounded-full flex items-center justify-center">
                {unreadFinishedCount}
              </span>
            )}
            {activeTab === "finished" && (
              <span className="absolute bottom-1 left-4 right-0 h-0.5 bg-purple-600 rounded-full" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <HighSpeedConversionBadge />

          <Button
            variant="outline"
            size="icon"
            className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </Button>

          <div className="flex">
            <Button
              className="rounded-r-none bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => addFiles()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Files
            </Button>
            <Button className="rounded-l-none border-l border-purple-500 bg-purple-600 hover:bg-purple-700 text-white px-2">
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
