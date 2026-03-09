import { useState, useEffect, startTransition, useMemo } from "react";
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
import { AUDIO_SUPPORT_FORMATS, VIDEO_SUPPORT_FORMATS } from "@/data/formats";
import { useTranslation } from "react-i18next";

import { DenoiseFooter } from "./Footer";
import DenoiseTaskList from "./Task";
import { UploadButton } from "@/components/ui-biz/UploadButton";
import { useDenoiseStore } from "./store";

const SUPPORTED_EXTENSIONS = Array.from(
  new Set([...AUDIO_SUPPORT_FORMATS, ...VIDEO_SUPPORT_FORMATS]),
);

export default function DenoisePage() {
  const { t } = useTranslation("common");
  const { init: initSettings } = useSettingsStore();
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  const pickerName = useMemo(
    () => `${t("file_picker.video")} / ${t("file_picker.audio")}`,
    [t],
  );

  return (
    <Card className="flex h-full w-full flex-col gap-0 border-none bg-transparent px-4 py-0 shadow-none">
      <CardHeader className="flex-shrink-0 rounded-none px-0">
        <CardDescription className="flex flex-col items-center gap-4 md:flex-row">
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
              name={pickerName}
              multiple={true}
              extensions={SUPPORTED_EXTENSIONS}
              onAddPaths={(paths) => useDenoiseStore.getState().addTasksByPaths(paths)}
            />
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0">
        <div className="relative flex-1 overflow-auto">
          <DenoiseTaskList globalFilter={globalFilter} />
        </div>
      </CardContent>
      <CardFooter className="flex-shrink-0 items-center justify-between border-t border-border px-4 py-4 [.border-t]:pt-4">
        <DenoiseFooter />
      </CardFooter>
    </Card>
  );
}

