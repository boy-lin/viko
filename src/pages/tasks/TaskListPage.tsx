import { useState, useEffect, useTransition } from "react";
import { bridge } from "@/lib/bridge";
import { RefreshCw, Search } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConverterFinishedTask from "./ConversionTask";
import CompressorFinishedTask from "./CompressionTask";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app";

const TABS = [
  { label: "转码", value: "convert" },
  { label: "压缩", value: "compress" },
];

export default function TaskListPage() {
  const [activeTab, setActiveTab] = useState<"convert" | "compress">("convert");
  const [globalFilter, setGlobalFilter] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Assuming bridge.getTaskHistory takes limit, offset, and taskType
      const type = activeTab === "convert" ? "convert" : "compress";
      const keyword = globalFilter.trim();
      const history = await bridge.getTaskHistory(100, 0, type, keyword || undefined);
      startTransition(() => {
        setTasks(history);
      });
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  };

  const removeFinishedTask = async (id: string) => {
    // const task = tasks.find((item) => item.id === id);
    // try {
    //   if (task?.output_path) {
    //     await remove(task.output_path);
    //   }
    // } catch (error) {
    //   console.error("Failed to delete output file:", error);
    // }
    try {
      await bridge.deleteTaskHistory(id);
      setTasks((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Failed to delete task history:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    useAppStore.getState().resetUnreadFinishedCount();
  }, []);

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
                <TabsTrigger key={value} value={value} className="cursor-pointer   relative">
                  &nbsp;&nbsp;{label}&nbsp;&nbsp;
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索文件名..."
                className="pl-9"
                value={globalFilter ?? ""}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
            <Button className="cursor-pointer" variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              搜索
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 flex flex-col flex-1 min-h-0">
        <div className="relative flex-1 overflow-auto">
          {activeTab === "convert" ? (
            <ConverterFinishedTask
              tasks={tasks}
              loading={loading}
              isPending={isPending}
              onRemove={removeFinishedTask}
            />
          ) : (
            <CompressorFinishedTask
              tasks={tasks}
              loading={loading}
              isPending={isPending}
              onRemove={removeFinishedTask}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
