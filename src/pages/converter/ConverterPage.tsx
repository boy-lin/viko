import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { useSettingsStore } from "@/stores/settingsStore";
import ConverterFooter from "./Footer";
import ConverterHeader from "./Header";
import ConverterTaskList from "./TaskList";

export default function UnifiedConverterPage() {
  const { init: initSettings } = useSettingsStore();
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  return (
    <Card className="flex h-full w-full flex-col gap-0 border-none bg-transparent px-4 py-0 shadow-none">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <ConverterHeader
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
        />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0">
        <div className="relative flex-1 space-y-1 overflow-auto">
          <ConverterTaskList globalFilter={globalFilter} />
        </div>
      </CardContent>
      <CardFooter className="flex flex-shrink-0 items-center justify-between border-border px-4 py-4">
        <ConverterFooter />
      </CardFooter>
    </Card>
  );
}
