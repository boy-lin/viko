import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-transparent">
            {status}
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="bg-destructive/20 border-transparent">
            {status}
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="border-transparent">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="container mx-auto px-4 md:px-6 lg:px-8 py-12 md:py-16 lg:py-24">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transcode Tasks</h1>
          <p className="text-sm text-muted-foreground mt-2">
            View and manage your transcoding task history
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <Input
            placeholder="Search by input/output path or error..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setKeyword(searchInput);
                fetchTasks(1, searchInput);
              }
            }}
            className="max-w-sm"
          />
          <Button
            type="button"
            onClick={() => {
              setKeyword(searchInput);
              fetchTasks(1, searchInput);
            }}
            disabled={loading}
          >
            Search
          </Button>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
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

            <div className="border-t border-border pt-4">
              <div className="space-y-3 max-h-[600px] overflow-auto">
                {tasks.length === 0 && (
                  <div className="text-sm text-muted-foreground py-12 text-center">
                    {loading ? "Loading..." : "No tasks found."}
                  </div>
                )}

                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-col gap-2 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {task.inputPath}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-1">
                          Output: {task.outputPath}
                          {task.outputFormat ? `.${task.outputFormat}` : ""}
                        </div>
                      </div>
                      {getStatusBadge(task.status)}
                    </div>

                    {(task.resolution || task.bitrate || task.framerate) && (
                      <div className="text-xs text-muted-foreground flex gap-4 flex-wrap">
                        {task.resolution && <span>Res: {task.resolution}</span>}
                        {task.bitrate && <span>Bitrate: {task.bitrate}k</span>}
                        {task.framerate && <span>FPS: {task.framerate}</span>}
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
                    </div>

                    {task.errorMessage && (
                      <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2 mt-1">
                        <span className="font-medium">Error: </span>
                        {task.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}


