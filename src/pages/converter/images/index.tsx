import { useState, useEffect } from "react";
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
import { IMAGE_FORMATS } from "@/data/formats";
import { bridge } from "@/lib/bridge";

import { ConverterFooter } from "./Footer";
import ConvertingTask from "./Task";

export default function ConvertionImagePage() {
  const { init: initSettings } = useSettingsStore();
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  return (
    <Card className="h-full w-full py-0 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="text-sm font-medium text-muted-foreground">待处理</div>
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
              onClick={() => bridge.addFilesOrFolders({
                name: "Images",
                multiple: true,
                extensions: IMAGE_FORMATS,
                folder: true,
              })}
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
