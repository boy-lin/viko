import { useState, useEffect, startTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settingsStore";
import { VIDEO_FORMATS } from "@/data/formats";
import { bridge } from "@/lib/bridge";

import { useConverterStore } from "./store";
import { ConverterFooter } from "./Footer";
import ConvertingTask from "./Task";

export default function ConvertionVideoPage() {
  const { init: initSettings } = useSettingsStore();
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  console.log('ConvertionVideoPage')


  return (
    <Card className="h-full w-full py-0 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <div className="flex flex-col items-center gap-4 md:flex-row">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索文件名..."
              className="pl-9"
              value={globalFilter ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                startTransition(() => setGlobalFilter(value));
              }}
            />
          </div>
          <div>
            <Button
              className="flex items-center gap-3"
              size="sm"
              onClick={async () => {
                const paths = await bridge.addFilesOrFolders({
                  name: "Video",
                  multiple: true,
                  extensions: VIDEO_FORMATS,
                  folder: true,
                })
                useConverterStore.getState().addTasksByPaths(paths)
              }}
            >
              <UserPlus className="h-4 w-4" /> 添加文件
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 flex flex-col flex-1 min-h-0">
        <div className="relative flex-1 overflow-auto">
          <ConvertingTask
            globalFilter={globalFilter}
          />
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-border px-4 py-4 [.border-t]:pt-4 flex-shrink-0">
        <ConverterFooter />
      </CardFooter>
    </Card>
  );
}
