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
import { Search, UserPlus, ArrowUpDown, Trash2, Settings } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ConverterFooter } from "./ConverterFooter";
import { UploadPanel } from "./UploadPanel";
import { useConverterStore } from "@/stores/converterStore";
import { ConverterTask } from "@/types/converter";
import { MediaThumbnail } from "../components/MediaThumbnail";
import { formatFileSize, getFormatByPath } from "@/lib/file";
import { formatDuration } from "@/lib/time";
import { isVideoFormat } from "@/data/formats";
import { ConversionSettingsDialog } from "../components/ConversionSettingsDialog";

const TABS = [
  {
    label: "转换中",
    value: "converting",
  },
  {
    label: "已完成",
    value: "finished",
  },
];

export default function ConverterPage() {
  const { tasks, init, activeTab, setActiveTab, addFiles, removeTask } =
    useConverterStore();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<ConverterTask | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (activeTab === "converting") {
        return task.status !== "finished";
      } else {
        return task.status === "finished";
      }
    });
  }, [tasks, activeTab]);

  // 定义列
  const columns = useMemo<ColumnDef<ConverterTask>[]>(
    () => [
      {
        accessorKey: "thumbnail",
        header: "预览/文件名",
        cell: ({ row }) => {
          const task = row.original;
          const isVideo = isVideoFormat(getFormatByPath(task.path));
          return (
            <div className="flex items-center gap-3">
              <MediaThumbnail
                path={task.path}
                title={task.title}
                isVideo={isVideo}
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
              <span className="text-sm">{task.format.toUpperCase()}</span>
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
          return (
            <div className="flex flex-col gap-1 w-24">
              <Badge variant="outline" className={config.className}>
                {config.label}
              </Badge>
              {task.status === "converting" && task.progress !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {task.progress.toFixed(0)}%
                </span>
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
    [removeTask]
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
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _, filterValue) => {
      const search = filterValue.toLowerCase();
      const fileName = row.original.title.toLowerCase();
      return fileName.includes(search);
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
                <TabsTrigger key={value} value={value}>
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
          <div>
            <Button
              className="flex items-center gap-3"
              size="sm"
              onClick={() => addFiles()}
            >
              <UserPlus className="h-4 w-4" /> 添加文件
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 flex flex-col flex-1 min-h-0">
        <div className="relative flex-1 overflow-auto">
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
                      className="cursor-pointer border-y border-border bg-muted p-4 transition-colors hover:bg-muted"
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
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    <div className="mb-6">
                      <UploadPanel />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-border px-4 py-4 [.border-t]:pt-4 flex-shrink-0">
        <ConverterFooter />
      </CardFooter>
      {currentTask && (
        <ConversionSettingsDialog
          task={currentTask}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
    </Card>
  );
}
