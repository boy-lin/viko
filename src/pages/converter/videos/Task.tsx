import { useMemo } from "react";
import { Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConverterTask, FileType } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { ConvertVideoTaskArgs, getMediaTaskQueue } from "@/lib/bridge";
import { useTranslation } from "react-i18next";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { FormatSelectorDialog } from "@/components/biz-form/FormatSelector";
import { VIDEO_FORMATS } from "@/data/formats";
import { MediaTaskType } from "@/types/tasks";

import { UploadPanel } from "./UploadPanel";
import { useConverterStore } from "./store";

interface ConvertingTaskProps {
  fileType: FileType;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
}

export default function ConvertingTask({
  fileType,
  globalFilter = "",
  onGlobalFilterChange,
}: ConvertingTaskProps) {
  const { convertingTasks, removeTask } = useConverterStore();
  const { t } = useTranslation("converter");

  const globalConfig = useConverterStore((state) => state.globalConfig);

  const filteredTasks = useMemo(() => {
    const search = globalFilter?.trim().toLowerCase() || "";
    if (!search) return convertingTasks;
    return convertingTasks.filter((task) => {
      const fileName = task.title?.toLowerCase?.() || "";
      return (
        fileName.includes(search)
      );
    });
  }, [convertingTasks, globalFilter]);
  console.log("filteredTasks", filteredTasks);
  const statusLabel = (task: ConverterTask) => {
    const errorMessage = (task as any).errorMessage || (task as any).error;
    const map = {
      idle: { text: t("status.idle", "等待中"), color: "text-gray-600", badge: "bg-gray-100" },
      converting: { text: t("status.converting", "转换中"), color: "text-blue-600", badge: "bg-blue-100" },
      finished: { text: t("status.finished", "已完成"), color: "text-green-600", badge: "bg-green-100" },
      error: { text: t("status.error", "错误"), color: "text-red-600", badge: "bg-red-100" },
    } as const;
    const cfg = map[task.status] || map.idle;
    return (
      <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${cfg.badge} ${cfg.color}`}>
        <span>{cfg.text}</span>
        {task.status === "converting" && task.progress !== undefined && (
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
  };

  const handleConvertSingle = async (task: ConverterTask) => {
    await getMediaTaskQueue().addConvertTasks([{
      kind: task.taskType,
      args: task.args
    }]);
  };

  return (
    <>
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
            <UploadPanel
              mediaType={MediaTaskType.ConvertVideo}
              supportedExtensions={VIDEO_FORMATS}
            />
          </div>
        ) : (
          filteredTasks.map((task) => {
            const convertVideoTaskArgs = task.args as ConvertVideoTaskArgs;
            const firstVideoStream = task.streams.find((s) => s.codec_type === "video");
            const originalInfoParts = [
              task.extension.toUpperCase(),
              firstVideoStream?.codec_name?.toUpperCase?.(),
              firstVideoStream?.width + "x" + firstVideoStream?.height,
              firstVideoStream?.frame_rate,
            ]
            const targetInfoParts = [
              convertVideoTaskArgs.format?.toUpperCase?.(),
              convertVideoTaskArgs.video_encoder?.toUpperCase?.(),
              convertVideoTaskArgs.resolution,
              convertVideoTaskArgs.frame_rate,
            ]
            return (
              <div
                key={task.id}
                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-border shadow-sm"
              >
                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <MediaThumbnail
                    path={task.path}
                    title={task.title}
                    fileType={task.fileType}
                    className="w-full h-full"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <EllipsisName name={task.title} className="text-base font-semibold text-foreground" />
                  </div>
                  <div className="grid grid-cols-2 mt-2 text-sm text-muted-foreground">
                    {
                      originalInfoParts.map((p, idx) => (
                        <span key={idx}>{p || "-"}</span>
                      ))
                    }
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {statusLabel(task)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-foreground">{t("targetInfo")}</div>
                  <div className="grid grid-cols-2 mt-1 text-sm text-muted-foreground">
                    {targetInfoParts.map((p, idx) => (
                      <span key={idx}>{p || "auto"}</span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <FormatSelectorDialog
                    config={globalConfig}
                    formatRecents={[]}
                    addToRecents={() => { }}
                    applyConfigToAllTasks={() => { }}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => removeTask(task.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("actions.delete")}</TooltipContent>
                  </Tooltip>

                  <Button
                    variant="outline"
                    className="cursor-pointer px-4"
                    onClick={() => handleConvertSingle(task)}
                  >
                    {t("actions.convertSingle", "转换")}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
