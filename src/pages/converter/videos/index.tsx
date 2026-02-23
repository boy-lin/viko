import { useState, useEffect, startTransition } from "react";
import { Search } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settingsStore";
import { VIDEO_FORMATS } from "@/data/formats";
import { useTranslation } from "react-i18next";

import { ConverterFooter } from "./Footer";
import ConvertingTask from "./Task";
import { UploadButton } from "@/components/ui-biz/UploadButton";
import { useConverterStore } from "./store";

export default function ConvertionVideoPage() {
  const { t } = useTranslation("converter");
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
              placeholder={t("search.placeholder")}
              className="pl-9"
              value={globalFilter ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                startTransition(() => setGlobalFilter(value));
              }}
            />
          </div>
          <div>
            <UploadButton
              name={t("file_picker.video")}
              multiple={true}
              extensions={VIDEO_FORMATS}
              onAddPaths={(paths) => useConverterStore.getState().addTasksByPaths(paths)}
            />
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
