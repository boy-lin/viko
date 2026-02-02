import { useState, useMemo, startTransition } from "react";
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
import { useConverterStore } from "@/stores/converterStore";
import { ConversionConfig, ConverterTask } from "@/types/converter";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { formatFileSize } from "@/lib/file";
import { formatDuration } from "@/lib/time";
import { ConversionSettingsDialog } from "./SettingsDialog";
import { converterQueue } from "@/lib/bridge";
import { useTranslation } from "react-i18next";

interface ConvertingTaskProps {
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
}

export default function ConvertingTask({
  globalFilter = "",
  onGlobalFilterChange,
}: ConvertingTaskProps = {}) {
  const { convertingTasks, removeTask, updateUnfinishedTaskConfig } =
    useConverterStore();
  const { t } = useTranslation("converter");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<ConverterTask | null>(null);

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
          return (
            <div className="flex flex-col">
              <span className="text-sm">{task.extension.toUpperCase()}</span>
              {task.displayResolution && (
                <span className="text-xs text-muted-foreground">
                  {task.displayResolution}
                </span>
              )}
            </div>
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
                      startTransition(() => {
                        setSettingsOpen(true);
                      });
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
    [removeTask]
  );

  const table = useReactTable({
    data: convertingTasks,
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

      return (
        fileName.includes(search) ||
        extension.includes(search) ||
        displayFormat.includes(search) ||
        displayResolution.includes(search)
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
        <ConversionSettingsDialog
          taskConfig={currentTask.config as ConversionConfig}
          onTaskConfigChange={(config) => {
            updateUnfinishedTaskConfig(currentTask.id, config);
          }}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          descriptionOverride={t("settings.singleDescription")}
          confirmLabel={t("settings.startSingle")}
          onConfirm={async (config) => {
            await updateUnfinishedTaskConfig(currentTask.id, config);
            await converterQueue.add([currentTask]);
            setSettingsOpen(false);
          }}
        />
      )}
    </>
  );
}
