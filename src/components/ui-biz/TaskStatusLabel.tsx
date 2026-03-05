import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FFmpegTask } from "@/types/tasks";

interface TaskStatusLabelProps {
  task: FFmpegTask;
}

export default function TaskStatusLabel({
  task,
}: TaskStatusLabelProps) {
  const { t } = useTranslation("task");
  const errorMessage = task.errorMessage;
  const map = {
    queued: { text: t("status.queued", "已入队"), color: "text-amber-600", badge: "bg-amber-100" },
    idle: { text: t("status.idle", "等待中"), color: "text-gray-600", badge: "bg-gray-100" },
    processing: { text: t("status.processing", "处理中"), color: "text-blue-600", badge: "bg-blue-100" },
    finished: { text: t("status.finished", "已完成"), color: "text-green-600", badge: "bg-green-100" },
    error: { text: t("status.error", "错误"), color: "text-red-600", badge: "bg-red-100" },
    cancelled: { text: t("status.cancelled", "已取消"), color: "text-gray-600", badge: "bg-gray-100" },
  } as const;
  const cfg = map[task.status] || map.idle;

  return (
    <div className={`inline-flex flex-col items-center px-2 py-1 rounded-lg text-xs font-medium ${cfg.badge} ${cfg.color}`}>
      <span>{cfg.text}</span>
      {task.status === "processing" && task.progress !== undefined && (
        <span>{task.progress.toFixed(0)}%</span>
      )}
      {task.status === "error" && errorMessage && (
        <Tooltip>
          <TooltipTrigger asChild>
            <ShieldAlert className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">{errorMessage}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

