import { useState, useMemo, startTransition } from "react";
import { Trash2, Settings, ShieldAlert, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { UploadPanel } from "../UploadPanel";
import { useConverterStore } from "@/stores/converterStore";
import { ConversionConfig, ConverterTask, FileType } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { ConversionSettingsDialog } from "../SettingsDialog";
import { ConvertVideoTaskArgs, getMediaTaskQueue, MediaTaskType } from "@/lib/bridge";
import { useTranslation } from "react-i18next";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { VIDEO_FORMATS } from "@/data/formats";

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
  const { convertingTasks, removeTask, updateUnfinishedTaskConfig } =
    useConverterStore();
  const { t } = useTranslation("converter");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<ConverterTask | null>(null);

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

    await getMediaTaskQueue().addConvertVideoTasks([{
      kind: MediaTaskType.ConvertVideo,
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
            const targetInfoParts = [
              convertVideoTaskArgs.format?.toUpperCase?.(),
              convertVideoTaskArgs.resolution,
              convertVideoTaskArgs.video_encoder,
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
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{task.extension.toUpperCase()}</span>
                    <span>{convertVideoTaskArgs.resolution}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {statusLabel(task)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-muted-foreground">{t("targetInfo")}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-foreground">
                    {targetInfoParts.map((p, idx) => (
                      <span key={idx}>{p || "-"}</span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setCurrentTask(task);
                          startTransition(() => setSettingsOpen(true));
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("actions.settings")}</TooltipContent>
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
                    <TooltipContent>{t("actions.delete")}</TooltipContent>
                  </Tooltip>

                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white h-10 px-4"
                    onClick={() => handleConvertSingle(task)}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    {t("actions.convertSingle", "转换")}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {currentTask && (
        <ConversionSettingsDialog
          descriptionOverride={t("settings.singleDescription")}
          confirmLabel={t("settings.startSingle")}
          fileType={fileType}
          onTaskConfigChange={(config) => {
            updateUnfinishedTaskConfig(currentTask.id, config);
          }}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onConfirm={(config) => {
            setSettingsOpen(false);
          }}
        />
      )}
    </>
  );
}
