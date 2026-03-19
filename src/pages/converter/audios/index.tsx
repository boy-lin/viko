import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settingsStore";
import { AUDIO_SUPPORT_FORMATS } from "@/data/formats";

import { ConverterFooter } from "./Footer";
import ConvertingTask from "./Task";
import { useConverterStore } from "./store";
import { UploadButton } from "@/components/ui-biz/UploadButton";
import { useTranslation } from "react-i18next";

export default function ConvertionImagePage() {
  const { t } = useTranslation("common");
  const { init: initSettings } = useSettingsStore();
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  return (
    <Card className="h-full w-full py-0 px-4 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <CardDescription className="flex flex-col items-center gap-4 md:flex-row">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("search.placeholder")}
              className="pl-9"
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
          <div>
            <UploadButton
              name={t("file_picker.audio")}
              multiple={true}
              extensions={AUDIO_SUPPORT_FORMATS}
              onAddPaths={(paths) => useConverterStore.getState().addTasksByPaths(paths)}
            />
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 flex flex-col flex-1 min-h-0">
        <div className="relative flex-1 space-y-1 overflow-auto">
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
