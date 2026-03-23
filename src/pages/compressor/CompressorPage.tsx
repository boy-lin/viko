import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { useSettingsStore } from "@/stores/settingsStore";

import CompressorFooter from "./Footer";
import CompressorHeader from "./Header";
import CompressorTaskList from "./Task";

export default function CompressorPage() {
  const { init: initSettings } = useSettingsStore();
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  return (
    <Card className="h-full w-full py-0 px-4 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <CompressorHeader
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
        />
      </CardHeader>
      <CardContent className="px-0 flex flex-col flex-1 min-h-0">
        <div className="relative flex-1 space-y-1 overflow-auto">
          <CompressorTaskList globalFilter={globalFilter} />
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between px-4 py-4 flex-shrink-0">
        <CompressorFooter />
      </CardFooter>
    </Card>
  );
}
