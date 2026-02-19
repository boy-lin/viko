import { useState, useMemo } from "react";
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
import { ArrowUpDown, Trash2, FolderOpen, Loader2 } from "lucide-react";
import { TaskHistoryItem } from "@/lib/bridge";
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
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { formatFileSize } from "@/lib/file";
import { formatDuration } from "@/lib/time";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

interface FinishedTaskProps {
  tasks: TaskHistoryItem[];
  loading?: boolean;
  isPending?: boolean;
  onRemove: (id: string) => void;
}

export default function FinishedTask({
  tasks,
  loading = false,
  isPending = false,
  onRemove,
}: FinishedTaskProps) {

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // 定义列
  const columns = useMemo<ColumnDef<TaskHistoryItem>[]>(
    () => [
      {
        accessorKey: "thumbnail",
        header: "预览/文件名",
        cell: ({ row }) => {
          const task = row.original;
          return (
            <div className="flex items-center gap-3">
              <MediaThumbnail
                fileType={task.media_type}
                path={task.output_path}
                title={task.title}
                className="shrink-0 w-10 h-10 rounded"
              />
              <div className="flex flex-col max-w-[200px]">
                <span
                  className="text-sm font-medium text-foreground truncate"
                  title={task.title}
                >
                  {task.title}
                </span>
                {task.output_path && (
                  <span
                    className="text-xs text-muted-foreground truncate"
                    title={task.output_path || ""}
                  >
                    输出: {task.output_path?.split(/[/\\]/).pop()}
                  </span>
                )}
              </div>
            </div>
          );
        },
        enableSorting: false,
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
            {formatDuration(Number(row.original.output_duration || 0))}
          </span>
        ),
      },
      {
        accessorKey: "quality",
        header: "格式/分辨率",
        cell: ({ row }) => {
          const task = row.original;
          let quality = "";
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(task.task_data || "{}");
            switch (task.media_type) {
              case "video":
                quality = args.resolution;
                break;
              case "audio":
                quality = args.bitrate ? args.bitrate + "kbps" : "";
                break;
              case "image":
                quality = args.quality;
                break;
              default:
                // Fallback or try to guess
                if (args.resolution) quality = args.resolution;
                else if (args.bitrate) quality = args.bitrate + "kbps";
                else if (args.quality) quality = args.quality;
            }
          } catch (e) {
            console.error("Failed to parse task data", e);
          }
          const format =
            typeof args.format === "string" && args.format
              ? args.format.toUpperCase()
              : (task.output_path?.split(".").pop() || "-").toUpperCase();
          return (
            <div className="flex flex-col">
              <span className="text-sm">{format}</span>
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
            const path = task.output_path;
            if (!path) return;
            try {
              await revealItemInDir(path);
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
                    onClick={() => onRemove(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>删除</p>
                </TooltipContent>
              </Tooltip>
            </div >
          );
        },
        enableSorting: false,
      },
    ],
    [onRemove]
  );

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
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
      <TableBody className={`${isPending ? "opacity-50" : ""}`}>
        {loading ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              <div className="flex justify-center items-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </TableCell>
          </TableRow>
        ) : table.getRowModel().rows?.length ? (
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
