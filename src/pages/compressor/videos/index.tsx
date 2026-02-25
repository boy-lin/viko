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
import { CompressionFooter } from "./Footer";
import { useCompressorStore } from "./store";
import { useSettingsStore } from "@/stores/settingsStore";
import ConvertingTask from "./Task";
import { VIDEO_FORMATS } from "@/data/formats";
import { UploadButton } from "@/components/ui-biz/UploadButton";
import { useTranslation } from "react-i18next";

export default function ConverterPage() {
  const { t } = useTranslation("compressor");
  const { init: initSettings } = useSettingsStore();
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    initSettings();
  }, []);

  return (
    <Card className="h-full w-full py-0 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <CardDescription>
        </CardDescription>
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
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
              name={t("file_picker.video")}
              multiple={true}
              extensions={VIDEO_FORMATS}
              onAddPaths={(paths) => useCompressorStore.getState().addTasksByPaths(paths)}
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
        <CompressionFooter />
      </CardFooter>
    </Card>
  );
}
