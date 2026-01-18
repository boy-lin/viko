import { useState, useMemo, useCallback, useEffect } from "react";
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
import { useCompressorStore } from "@/stores/compressorStore";
import { ConverterTask } from "@/types/converter";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { formatFileSize, getFormatByPath } from "@/lib/file";
import { isVideoFormat } from "@/data/formats";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

interface FinishedTaskProps {
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
}

export default function FinishedTask({
  globalFilter = "",
  onGlobalFilterChange,
}: FinishedTaskProps = {}) {
  const { finishedTasks, removeFinishedTask, resetUnreadFinishedCount } =
    useCompressorStore();
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
                path={task.path}
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
        cell: ({ row }) => {
          const task = row.original;
          const originalSize = task.size;
          return (
            <div className="flex flex-col">
              <span className="text-sm font-normal text-foreground">
                原文件: {formatFileSize(originalSize)}
              </span>
              {task.outputPath && (
                <span className="text-xs text-muted-foreground">
                  压缩后: 计算中...
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "compressionRatio",
        header: "压缩率",
        cell: ({ row }) => {
          const task = row.original;
          // 从 compressionConfig 获取压缩比例
          if (task.compressionConfig) {
            if (
              task.compressionConfig.type === "video" ||
              task.compressionConfig.type === "audio"
            ) {
              return (
                <span className="text-sm font-normal text-foreground">
                  {task.compressionConfig.compressionRatio}%
                </span>
              );
            } else if (task.compressionConfig.type === "image") {
              return (
                <span className="text-sm font-normal text-foreground">
                  质量: {task.compressionConfig.quality}%
                </span>
              );
            }
          }
          return (
            <span className="text-sm font-normal text-muted-foreground">-</span>
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

  // 使用 useCallback 稳定 onGlobalFilterChange 引用
  const stableOnGlobalFilterChange = useCallback(
    (value: string) => {
      onGlobalFilterChange?.(value);
    },
    [onGlobalFilterChange]
  );

  // 使用 useCallback 稳定 globalFilterFn
  const globalFilterFn = useCallback(
    (row: any, _: any, filterValue: string) => {
      if (!filterValue || filterValue.trim() === "") {
        return true;
      }
      const search = filterValue.toLowerCase().trim();
      const task = row.original;
      const fileName = task.title.toLowerCase();
      const format = task.format?.toLowerCase() || "";
      const displayFormat = task.displayFormat?.toLowerCase() || "";
      const displayResolution = task.displayResolution?.toLowerCase() || "";
      const outputPath = task.outputPath?.toLowerCase() || "";
      const outputFileName =
        outputPath.split(/[/\\]/).pop()?.toLowerCase() || "";

      return (
        fileName.includes(search) ||
        format.includes(search) ||
        displayFormat.includes(search) ||
        displayResolution.includes(search) ||
        outputPath.includes(search) ||
        outputFileName.includes(search)
      );
    },
    []
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
    onGlobalFilterChange: stableOnGlobalFilterChange,
    globalFilterFn,
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
