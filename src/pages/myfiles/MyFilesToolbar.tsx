import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FileType } from "@/types/tasks";
import type { TabItem } from "./types";

type SortBy = "date" | "name";
type SortOrder = "asc" | "desc";

type MyFilesToolbarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortByChange: (value: SortBy) => void;
  onToggleSortOrder: () => void;
  activeTab?: FileType;
  onTabChange: (value?: FileType) => void;
  tabs: TabItem[];
};

export function MyFilesToolbar({
  searchQuery,
  onSearchChange,
  sortBy,
  sortOrder,
  onSortByChange,
  onToggleSortOrder,
  activeTab,
  onTabChange,
  tabs,
}: MyFilesToolbarProps) {
  const { t } = useTranslation("myfiles");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* 搜索框 */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search.placeholder")}
            className="pl-9"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* 排序选择 */}
        <div className="flex items-center gap-2">
          <Select
            value={sortBy}
            onValueChange={(value) => onSortByChange(value as SortBy)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t("sort.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">{t("sort.date")}</SelectItem>
              <SelectItem value="name">{t("sort.name")}</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSortOrder}
            title={sortOrder === "asc" ? t("sort.asc") : t("sort.desc")}
          >
            {sortOrder === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 导航标签 */}
      <div className="flex items-center justify-between gap-4">
        <Tabs
          value={activeTab ?? "all"}
          onValueChange={(value) =>
            onTabChange(value === "all" ? undefined : (value as FileType))
          }
        >
          <TabsList className="bg-transparent p-0 h-auto border-b border-transparent">
            {tabs.map((tab) => {
              const isActive =
                tab.value === "all"
                  ? activeTab === undefined
                  : activeTab === tab.value;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    "px-4 py-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent",
                    isActive ? "border-primary" : "cursor-pointer"
                  )}
                >
                  {t(tab.labelKey)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
