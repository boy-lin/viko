import { useState, useMemo, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { ArrowUpDown, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConverterStore } from "@/stores/converterStore";
import { ConverterTask } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { formatFileSize } from "@/lib/file";
import { formatDuration } from "@/lib/time";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

interface FinishedTaskProps {
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
}

export default function FinishedTask({
  globalFilter = "",
  onGlobalFilterChange,
}: FinishedTaskProps = {}) {
  const { finishedTasks, removeFinishedTask } = useConverterStore();
  const resetUnreadFinishedCount = useConverterStore(
    (store) => store.resetUnreadFinishedCount
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  useEffect(() => {
    resetUnreadFinishedCount();
  }, []);

  // 定义列
  const columns = useMemo<ColumnDef<ConverterTask>[]>(
    () => [
      {
        accessorKey: "thumbnail",
        header: "预览/文件名",
        cell: ({ row }) => {
          const task = row.original;
          return (
            <div className="flex items-center gap-3">
              <MediaThumbnail
                path={task.outputPath || ""}
                title={task.title}
                fileType={task.fileType}
                className="shrink-0 w-10 h-10 rounded"
              />
              <div className="flex flex-col max-w-[200px]">
                <span
                  className="text-sm font-medium text-foreground truncate"
                  title={task.title}
                >
                  {task.title}
                </span>
                {task.outputPath && (
                  <span
                    className="text-xs text-muted-foreground truncate"
                    title={task.outputPath}
                  >
                    输出: {task.outputPath.split(/[/\\]/).pop()}
                  </span>
                )}
              </div>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "size",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="h-auto p-0 hover:bg-transparent"
            >
              文件大小
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => (
          <span className="text-sm font-normal text-foreground">
            {formatFileSize(row.getValue("size"))}
          </span>
        ),
      },
      {
        accessorKey: "duration",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="h-auto p-0 hover:bg-transparent"
            >
              时长
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => (
          <span className="text-sm font-normal text-foreground">
            {formatDuration(row.getValue("duration"))}
          </span>
        ),
      },
      {
        accessorKey: "quality",
        header: "格式/分辨率",
        cell: ({ row }) => {
          const task = row.original;
          const format = task.config?.outputFormat;
          if (!format) return null;
          let quality = null;
          switch (task.config?.type) {
            case "video":
              quality = task.config?.video?.resolution;
              break;
            case "audio":
              quality = task.config?.audioTracks?.[0]?.bitrate + "kbps";
              break;
            case "image":
              quality = task.config?.image?.quality;
              break;
          }
          return (
            <div className="flex flex-col">
              <span className="text-sm">{format.toUpperCase()}</span>
              {quality && (
                <span className="text-xs text-muted-foreground">{quality}</span>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => {
          const task = row.original;
          const handleOpenFolder = async () => {
            if (!task.outputPath) return;
            try {
              await revealItemInDir(task.outputPath);
            } catch (e) {
              console.error("Failed to open folder:", e);
            }
          };

          return (
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleOpenFolder}
                    disabled={!task.outputPath}
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
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => removeFinishedTask(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>删除</p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [removeFinishedTask]
  );

  const table = useReactTable({
    data: finishedTasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: onGlobalFilterChange || (() => { }),
    globalFilterFn: (row, _, filterValue) => {
      if (!filterValue || filterValue.trim() === "") {
        return true;
      }
      const search = filterValue.toLowerCase().trim();
      const task = row.original;
      const fileName = task.title.toLowerCase();
      const extension = task.extension?.toLowerCase() || "";
      const displayFormat = task.displayFormat?.toLowerCase() || "";
      const displayResolution = task.displayResolution?.toLowerCase() || "";
      const outputPath = task.outputPath?.toLowerCase() || "";
      const outputFileName =
        outputPath.split(/[/\\]/).pop()?.toLowerCase() || "";

      return (
        fileName.includes(search) ||
        extension.includes(search) ||
        displayFormat.includes(search) ||
        displayResolution.includes(search) ||
        outputPath.includes(search) ||
        outputFileName.includes(search)
      );
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <Table
      wrapperClassName="h-full"
      className="w-full relative min-w-max table-auto text-left"
    >
      <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="hover:bg-transparent">
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className="cursor-pointer border-y border-border bg-muted p-2 transition-colors hover:bg-muted"
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
              className="border-b border-border h-auto"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="p-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              <div className="text-sm text-muted-foreground">
                暂无已完成的任务
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
