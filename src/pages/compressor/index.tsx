import { useState, useEffect, useCallback } from "react";
import { Search, UserPlus } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompressionFooter } from "./CompressionFooter";
import { useCompressorStore } from "@/stores/compressorStore";
import { useSettingsStore } from "@/stores/settingsStore";
import ConvertingTask from "./CompressionTask";
import FinishedTask from "./FinishedTask";

const TABS = [
  {
    label: "视频",
    value: "video",
  },
  {
    label: "音频",
    value: "audio",
  },
  {
    label: "图片",
    value: "image",
  },
  {
    label: "完成列表",
    value: "finished",
  },
];

export default function ConverterPage() {
  const { init, activeTab, setActiveTab, addFiles, unreadFinishedCount } =
    useCompressorStore();
  const { init: initSettings } = useSettingsStore();
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    init();
    initSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 当切换到已完成 tab 时，重置未读数
  // 使用 useCallback 避免每次渲染都创建新函数
  const handleTabChange = useCallback(
    (tab: "video" | "audio" | "image" | "finished") => {
      setActiveTab(tab);
    },
    [setActiveTab]
  );

  return (
    <Card className="h-full w-full py-0 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <Tabs
            value={activeTab}
            onValueChange={(v) => handleTabChange(v as any)}
            className="w-full md:w-max"
          >
            <TabsList>
              {TABS.map(({ label, value }) => (
                <TabsTrigger key={value} value={value} className="relative">
                  &nbsp;&nbsp;{label}&nbsp;&nbsp;
                  {value === "finished" &&
                    unreadFinishedCount > 0 &&
                    activeTab !== "finished" && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-semibold px-1.5 h-4 rounded-full flex items-center justify-center min-w-[16px]">
                        {unreadFinishedCount > 99 ? "99+" : unreadFinishedCount}
                      </span>
                    )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索文件名..."
              className="pl-9"
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
          <div>
            <Button
              className="flex items-center gap-3"
              size="sm"
              onClick={() => addFiles()}
            >
              <UserPlus className="h-4 w-4" /> 添加文件
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 flex flex-col flex-1 min-h-0">
        <div className="relative flex-1 overflow-auto">
          {activeTab === "finished" ? (
            <FinishedTask
              globalFilter={globalFilter}
              onGlobalFilterChange={setGlobalFilter}
            />
          ) : (
            <ConvertingTask
              key={activeTab}
              globalFilter={globalFilter}
              onGlobalFilterChange={setGlobalFilter}
              activeTab={activeTab}
            />
          )}
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-border px-4 py-4 [.border-t]:pt-4 flex-shrink-0">
        {activeTab !== "finished" ? (
          <CompressionFooter />
        ) : (
          <div className="text-sm text-muted-foreground">已完成任务列表</div>
        )}
      </CardFooter>
    </Card>
  );
}
