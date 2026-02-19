import { useEffect, useMemo, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, FolderOpen, RefreshCw, Search, Trash2 } from "lucide-react";
import { bridge, type TaskHistoryItem } from "@/lib/bridge";
import { useSession } from "@/lib/auth-client";
import {
  deleteRemoteTaskHistory,
  getRemoteTaskHistory,
  syncLocalTaskHistoryToRemote,
} from "@/services/task-history-api";
import { formatDuration } from "@/lib/time";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useAppStore } from "@/stores/app";
import { toast } from "sonner";

const TASK_TYPE_LABEL: Record<string, string> = {
  convert: "转码",
  compress: "压缩",
};

const STATUS_LABEL: Record<string, string> = {
  finished: "已完成",
  processing: "处理中",
  error: "失败",
  cancelled: "已取消",
  idle: "等待中",
};

const STATUS_CLASSNAME: Record<string, string> = {
  finished: "text-green-600",
  processing: "text-blue-600",
  error: "text-red-600",
  cancelled: "text-gray-500",
  idle: "text-gray-500",
};

const PAGE_SIZE = 20;

const getFileName = (item: TaskHistoryItem) => {
  const fullPath = item.output_path || item.input_path || "";
  const name = fullPath.split(/[/\\]/).pop();
  return name || item.title || "-";
};

const getFileFormat = (item: TaskHistoryItem) => {
  const fullPath = item.output_path || item.input_path || "";
  const ext = fullPath.split(".").pop();
  return ext ? ext.toUpperCase() : "-";
};

export default function TaskHistoryPage() {
  const { data: session } = useSession();
  const [globalFilter, setGlobalFilter] = useState("");
  const [tasks, setTasks] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  const fetchData = async (targetPage: number = page) => {
    setLoading(true);
    try {
      const keyword = globalFilter.trim();
      if (session?.user) {
        await syncLocalTaskHistoryToRemote();
        const remote = await getRemoteTaskHistory({
          page: targetPage + 1,
          limit: PAGE_SIZE,
          keyword: keyword || undefined,
        });
        setHasNextPage(Boolean(remote.hasMore));
        setTasks(remote.list || []);
      } else {
        const history = await bridge.getTaskHistory(
          PAGE_SIZE + 1,
          targetPage * PAGE_SIZE,
          undefined,
          keyword || undefined
        );
        setHasNextPage(history.length > PAGE_SIZE);
        setTasks(history.slice(0, PAGE_SIZE));
      }
    } catch (error) {
      console.error("Failed to fetch task history:", error);
      toast.error("获取云端任务历史失败");
      try {
        const keyword = globalFilter.trim();
        const history = await bridge.getTaskHistory(
          PAGE_SIZE + 1,
          targetPage * PAGE_SIZE,
          undefined,
          keyword || undefined
        );
        setHasNextPage(history.length > PAGE_SIZE);
        setTasks(history.slice(0, PAGE_SIZE));
      } catch (localError) {
        console.error("Failed to fetch local task history fallback:", localError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(page);
  }, [page, session?.user?.id]);

  useEffect(() => {
    useAppStore.getState().resetUnreadFinishedCount();
  }, []);

  const handleSearch = () => {
    setPage(0);
    fetchData(0);
  };

  const handleRefresh = () => {
    fetchData(page);
  };

  const handleDelete = async (id: string) => {
    try {
      if (session?.user) {
        await deleteRemoteTaskHistory(id);
      } else {
        await bridge.deleteTaskHistory(id);
      }
      setTasks((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Failed to delete task history:", error);
    }
  };

  const handleOpenFolder = async (task: TaskHistoryItem) => {
    const path = task.output_path;
    if (!path) {
      toast.error("输出路径不存在");
      return;
    }
    try {
      await revealItemInDir(path);
    } catch (error) {
      console.error("Failed to open folder:", error);
    }
  };

  const columns = useMemo<ColumnDef<TaskHistoryItem>[]>(
    () => [
      {
        accessorKey: "output_name",
        header: "输出文件名",
        cell: ({ row }) => {
          const fileName = getFileName(row.original);
          return <EllipsisName name={fileName} className="text-left block max-w-[360px]" />;
        },
        enableSorting: false,
      },
      {
        accessorKey: "task_type",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 hover:bg-transparent"
            >
              任务类型
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => TASK_TYPE_LABEL[row.original.task_type] || row.original.task_type,
      },
      {
        accessorKey: "status",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 hover:bg-transparent"
            >
              任务状态
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const statusText = STATUS_LABEL[row.original.status] || row.original.status;
          const statusClass = STATUS_CLASSNAME[row.original.status] || "text-muted-foreground";
          return <span className={statusClass}>{statusText}</span>;
        },
      },
      {
        accessorKey: "output_duration",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 hover:bg-transparent"
            >
              任务用时
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const taskDuration = Number(row.original.output_duration || 0);
          return formatDuration(taskDuration);
        },
      },
      {
        accessorKey: "file_format",
        header: "文件格式",
        cell: ({ row }) => getFileFormat(row.original),
        enableSorting: false,
      },
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => {
          const task = row.original;
          return (
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer"
                    onClick={() => handleOpenFolder(task)}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>打开文件目录</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>删除记录</p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    []
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Card className="h-full w-full py-0 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-0 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>任务记录</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索文件名..."
                className="pl-9"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button variant="outline" onClick={handleSearch} disabled={loading}>搜索</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative px-0 flex-1 min-h-0 overflow-auto">

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {
              loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8">
                    <div className="flex items-center justify-center w-full">
                      <div className="loader"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            }
            {!loading && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  暂无任务记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-end space-x-2 py-4 pr-2">
          <span className="text-sm text-muted-foreground mr-2">第 {page + 1} 页</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            disabled={page === 0 || loading}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!hasNextPage || loading}
          >
            下一页
          </Button>
        </div>
      </CardContent>
    </Card >
  );
}
