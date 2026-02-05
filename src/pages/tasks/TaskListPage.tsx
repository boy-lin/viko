import { useState } from "react";
import { Search } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConverterFinishedTask from "@/pages/converter/finishedTask";
import CompressorFinishedTask from "@/pages/compressor/FinishedTask";

const TABS = [
  { label: "转码", value: "convert" },
  { label: "压缩", value: "compress" },
];

export default function TaskListPage() {
  const [activeTab, setActiveTab] = useState<"convert" | "compress">("convert");
  const [globalFilter, setGlobalFilter] = useState("");

  return (
    <Card className="h-full w-full py-0 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="w-full md:w-max"
          >
            <TabsList>
              {TABS.map(({ label, value }) => (
                <TabsTrigger key={value} value={value} className="relative">
                  &nbsp;&nbsp;{label}&nbsp;&nbsp;
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
        </div>
      </CardHeader>
      <CardContent className="px-0 flex flex-col flex-1 min-h-0">
        <div className="relative flex-1 overflow-auto">
          {activeTab === "convert" ? (
            <ConverterFinishedTask
              globalFilter={globalFilter}
              onGlobalFilterChange={setGlobalFilter}
            />
          ) : (
            <CompressorFinishedTask
              globalFilter={globalFilter}
              onGlobalFilterChange={setGlobalFilter}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
