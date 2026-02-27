import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, FolderOpen, RefreshCw, Search } from "lucide-react";
import { bridge, type TaskHistoryItem } from "@/lib/bridge";
import { useSession } from "@/lib/auth-client";
import {
  syncLocalTaskHistoryToRemote,
} from "@/services/task-history-api";
import { formatDuration, getDurationSecondsFromTimestamps, formatDateTime } from "@/lib/time";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { revealItemInDir } from "@/lib/revealItemInDir";
import { useAppStore } from "@/stores/app";
import { toast } from "sonner";
import { extractFilenameFromPath, getExtension } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const STATUS_CLASSNAME: Record<string, string> = {
  finished: "text-green-600",
  processing: "text-blue-600",
  error: "text-red-600",
  cancelled: "text-gray-500",
  idle: "text-gray-500",
};

const PAGE_SIZE = 10;

export default function TaskHistoryPage() {
  const { t } = useTranslation("tasks");
  const { data: session } = useSession();
  const [globalFilter, setGlobalFilter] = useState("");
  const [tasks, setTasks] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fetchData = async (targetPage: number = page) => {
    setLoading(true);
    try {
      const primarySort = sorting[0];
      const sortBy =
        primarySort?.id === "output_name" || primarySort?.id === "created_at"
          ? (primarySort.id as "output_name" | "created_at")
          : "created_at";
      const sortOrder: "asc" | "desc" = primarySort?.desc ? "desc" : "asc";
      const keyword = globalFilter.trim();
      try {
        await syncLocalTaskHistoryToRemote({
          userId: session?.user?.id || undefined,
        });
      } catch (error) {
        console.warn("Failed to sync local task history to remote:", error);
      }
      const history = await bridge.getTaskHistory(
        PAGE_SIZE + 1,
        targetPage * PAGE_SIZE,
        undefined,
        keyword || undefined,
        sortBy,
        sortOrder
      );
      startTransition(() => {
        setHasNextPage(history.length > PAGE_SIZE);
        setTasks(history.slice(0, PAGE_SIZE));
      });
    } catch (error) {
      console.error("Failed to fetch task history:", error);
      toast.error(t("errors.fetch_local"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(page);
  }, [page, session?.user?.id, sorting]);

  useEffect(() => {
    useAppStore.getState().resetUnreadFinishedCount();
  }, []);

  useEffect(() => {
    const hasRunning = tasks.some(
      (task) => task.status === "processing" || task.status === "idle"
    );
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tasks]);

  const handleSearch = () => {
    setPage(0);
    fetchData(0);
  };

  const handleRefresh = () => {
    fetchData(page);
  };

  // const handleDelete = async (id: string) => {
  //   try {
  //     if (session?.user) {
  //       await deleteRemoteTaskHistory(id);
  //     } else {
  //       await bridge.deleteTaskHistory(id);
  //     }
  //     setTasks((prev) => prev.filter((item) => item.id !== id));
  //   } catch (error) {
  //     console.error("Failed to delete task history:", error);
  //   }
  // };

  const handleOpenFolder = async (task: TaskHistoryItem) => {
    if (task.status !== "finished") {
      toast.error(t("errors.task_not_finished"));
      return;
    }
    const path = task.output_path;
    if (!path) {
      toast.error(t("errors.output_missing"));
      return;
    }
    try {
      console.log("Opening folder:", path);
      await revealItemInDir(path);
    } catch (error) {
      toast.error(t("errors.open_folder"));
      console.error("Failed to open folder:", error);
    }
  };

  const columns = useMemo<ColumnDef<TaskHistoryItem>[]>(
    () => [
      {
        id: "index",
        header: t("table.index"),
        cell: ({ row }) => page * PAGE_SIZE + row.index + 1,
        enableSorting: false,
      },
      {
        accessorKey: "output_name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent"
          >
            {t("table.output_name")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const fileName = extractFilenameFromPath(row.original.output_path);
          return <EllipsisName name={fileName} className="text-left block max-w-[360px]" />;
        },
        enableSorting: true,
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 hover:bg-transparent"
          >
            {t("table.started_at")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => formatDateTime(row.original.created_at),
      },
      {
        accessorKey: "task_type",
        header: t("table.task_type"),
        cell: ({ row }) => t(`task_type.${row.original.task_type}`, row.original.task_type),
      },
      {
        accessorKey: "status",
        header: t("table.status"),
        cell: ({ row }) => {
          const statusText = t(`status.${row.original.status}`, row.original.status);
          const statusClass = STATUS_CLASSNAME[row.original.status] || "text-muted-foreground";
          return <span className={statusClass}>{statusText}</span>;
        },
      },
      {
        accessorKey: "output_duration",
        header: t("table.duration"),
        cell: ({ row }) => {
          const isRunning =
            row.original.status === "processing" || row.original.status === "idle";
          const taskDuration = isRunning
            ? Math.max(0, Math.floor((now - row.original.created_at) / 1000))
            : getDurationSecondsFromTimestamps(
              row.original.created_at,
              row.original.finished_at
            );
          return formatDuration(taskDuration);
        },
      },
      {
        accessorKey: "file_format",
        header: t("table.format"),
        cell: ({ row }) => getExtension(row.original.output_path),
        enableSorting: false,
      },
      {
        id: "actions",
        header: t("table.actions"),
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
                  <p>{t("actions.open_folder")}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [page, now, t]
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <Card className="h-full w-full p-0 gap-0 bg-transparent border-none shadow-none flex flex-col">
      <CardHeader className="rounded-none px-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
          </CardDescription>
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("search.placeholder")}
                className="pl-9"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={handleSearch} disabled={loading}>{t("search.action")}</Button>

            <Button variant="outline" onClick={handleRefresh} disabled={loading || isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading || isPending ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative flex-1 min-h-0 overflow-auto">

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
          <TableBody className={loading || isPending ? "opacity-80 transition-opacity" : "transition-opacity"}>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {loading && table.getRowModel().rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8">
                    <div className="flex items-center justify-center w-full">
                      <div className="loader"></div>
                    </div>
                  </TableCell>
                </TableRow>
            )}
            {(loading || isPending) && table.getRowModel().rows.length > 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-2">
                  {t("refresh")}
                </TableCell>
              </TableRow>
            )}
            {!loading && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-end space-x-2 py-4 pr-2">
          <span className="text-sm text-muted-foreground mr-2">{t("page", { page: page + 1 })}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            disabled={page === 0 || loading}
          >
            {t("pagination.prev")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!hasNextPage || loading}
          >
            {t("pagination.next")}
          </Button>
        </div>
      </CardContent>
    </Card >
  );
}
