import { useState, useMemo, useCallback } from "react";
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
import { ArrowUpDown, Trash2, Settings, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { UploadPanel } from "./UploadPanel";
import { useCompressorStore } from "@/stores/compressorStore";
import { CompressionConfig, ConverterTask } from "@/types/converter";
import { MediaThumbnail } from "../../components/MediaThumbnail";
import { formatFileSize, getFormatByPath } from "@/lib/file";
import { isVideoFormat, isAudioFormat, isImageFormat } from "@/data/formats";
import { CompressionSettingsDialog } from "./CompressionSettingsDialog";

interface ConvertingTaskProps {
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  activeTab: "idle" | "finished";
}

export default function ConvertingTask({
  globalFilter = "",
  onGlobalFilterChange,
  activeTab,
}: ConvertingTaskProps) {
  const { compressingTasks, removeTask, updateUnfinishedTaskConfig } =
    useCompressorStore();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<ConverterTask | null>(null);

  // 根据 activeTab 过滤任务类型 - 使用 useMemo 优化性能
  const filteredTasks = useMemo(() => {
    return compressingTasks.filter((task) => {
      if (activeTab === "idle") {
        return task.status === "idle" || task.status === "converting";
      } else if (activeTab === "finished") {
        return task.status === "finished";
      }
      return true;
    });
  }, [compressingTasks, activeTab]);

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
        accessorKey: "codec",
        header: "编码格式",
        cell: ({ row }) => {
          const task = row.original;
          // 获取主要编码格式
          const videoStream = task.streams?.find(
            (s) => s.codec_type === "video"
          );
          const audioStream = task.streams?.find(
            (s) => s.codec_type === "audio"
          );
          const codec = videoStream?.codec_name || audioStream?.codec_name;
          return (
            <span className="text-sm font-normal text-foreground">
              {codec?.toUpperCase()}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "status",
        header: "状态/进度",
        cell: ({ row }) => {
          const task = row.original;
          const statusConfig = {
            idle: {
              label: "等待中",
              className: "border-gray-500 text-gray-700 bg-gray-50",
              variant: "outline",
            },
            converting: {
              label: "转换中",
              className: "border-blue-500 text-blue-700 bg-blue-50",
              variant: "outline",
            },
            finished: {
              label: "已完成",
              className: "border-green-500 text-green-700 bg-green-50",
              variant: "outline",
            },
            error: {
              label: "错误",
              className: "border-red-500 text-red-700 bg-red-50",
              variant: "outline",
            },
          };
          const config = statusConfig[task.status] || statusConfig.idle;
          const errorMessage =
            (task as any).errorMessage || (task as any).error;
          return (
            <div className="flex flex-col gap-1 w-24">
              <div className="flex items-center gap-1">
                <Badge variant="outline" className={config.className}>
                  {config.label}
                  {task.status === "converting" &&
                    task.progress !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {task.progress.toFixed(0)}%
                      </span>
                    )}
                  {task.status === "error" && errorMessage && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <ShieldAlert className="h-4 w-4 text-red-600" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">{errorMessage}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </Badge>
              </div>
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
          return (
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCurrentTask(task);
                      setSettingsOpen(true);
                    }}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>设置</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => removeTask(task.id)}
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
    [removeTask, setCurrentTask, setSettingsOpen]
  );

  // 使用 useCallback 稳定 onGlobalFilterChange 引用
  const stableOnGlobalFilterChange = useCallback(
    (value: string) => {
      onGlobalFilterChange?.(value);
    },
    [onGlobalFilterChange]
  );

  // 使用 useMemo 稳定 globalFilterFn
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

      return (
        fileName.includes(search) ||
        format.includes(search) ||
        displayFormat.includes(search) ||
        displayResolution.includes(search)
      );
    },
    []
  );

  const table = useReactTable({
    data: filteredTasks,
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
    <>
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
          {table.getRowModel().rows?.length
            ? table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="border-b border-border h-auto"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="p-2">
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
            : null}
          {
            <TableRow
              style={{
                display: table.getRowModel().rows?.length
                  ? "none"
                  : "table-row",
              }}
            >
              <TableCell colSpan={columns.length} className="h-24 text-center">
                <div className="mb-6">
                  <UploadPanel />
                </div>
              </TableCell>
            </TableRow>
          }
        </TableBody>
      </Table>
      {currentTask && (
        <CompressionSettingsDialog
          taskConfig={currentTask.compressionConfig}
          onTaskConfigChange={(config) => {
            updateUnfinishedTaskConfig(currentTask.id, config);
          }}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
    </>
  );
}
