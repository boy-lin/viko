import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  queryTranscodeTasks,
  TranscodeTaskRecord,
} from "@/lib/indexed";

interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
}

export default function TaskListPage() {
  const [tasks, setTasks] = useState<TranscodeTaskRecord[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchTasks = async (page = 1, kw = keyword) => {
    setLoading(true);
    try {
      const res = await queryTranscodeTasks({
        page,
        pageSize: pageInfo.pageSize,
        keyword: kw,
      });
      setTasks(res.items);
      setPageInfo({
        page: res.page,
        pageSize: res.pageSize,
        total: res.total,
      });
    } catch (e) {
      console.error("加载任务列表失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize));

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">Transcode Tasks</h1>

      <div className="flex gap-2 items-center">
        <Input
          placeholder="Search by input/output path or error..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-sm"
        />
        <Button
          type="button"
          onClick={() => {
            setKeyword(searchInput);
            fetchTasks(1, searchInput);
          }}
        >
          Search
        </Button>
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span>
            Total: {pageInfo.total} · Page {pageInfo.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageInfo.page <= 1 || loading}
              onClick={() => fetchTasks(pageInfo.page - 1)}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pageInfo.page >= totalPages || loading}
              onClick={() => fetchTasks(pageInfo.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="border-t border-border mt-2 pt-2 space-y-2 max-h-[480px] overflow-auto">
          {tasks.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {loading ? "Loading..." : "No tasks found."}
            </div>
          )}

          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col gap-1 border-b border-border last:border-b-0 pb-2 last:pb-0"
            >
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium truncate max-w-[60%]">
                  {task.inputPath}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    task.status === "success"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : task.status === "error"
                      ? "bg-red-500/10 text-red-500"
                      : "bg-blue-500/10 text-blue-500"
                  }`}
                >
                  {task.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                Output: {task.outputPath}
                {task.outputFormat ? `.${task.outputFormat}` : ""}
              </div>
              <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                {task.resolution && <span>Res: {task.resolution}</span>}
                {task.bitrate && <span>Bitrate: {task.bitrate}k</span>}
                {task.framerate && <span>FPS: {task.framerate}</span>}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Created: {new Date(task.createdAt).toLocaleString()}
              </div>
              {task.errorMessage && (
                <div className="text-[11px] text-red-500">
                  Error: {task.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}


