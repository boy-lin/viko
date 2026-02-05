import { useState, useMemo, startTransition } from "react";
import { Trash2, Settings, ShieldAlert, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { UploadPanel } from "../UploadPanel";
import { useConverterStore } from "@/stores/converterStore";
import { ConversionConfig, ConverterTask, FileType } from "@/types/converter";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { ConversionSettingsDialog } from "../SettingsDialog";
import { converterQueue } from "@/lib/bridge";
import { useTranslation } from "react-i18next";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { AUDIO_FORMATS } from "@/data/formats";

interface ConvertingTaskProps {
  convertTaskType: FileType;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
}

export default function ConvertingTask({
  convertTaskType,
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
      const extension = task.extension?.toLowerCase?.() || "";
      const displayFormat = task.displayFormat?.toLowerCase?.() || "";
      const displayResolution = task.displayResolution?.toLowerCase?.() || "";
      return (
        fileName.includes(search) ||
        extension.includes(search) ||
        displayFormat.includes(search) ||
        displayResolution.includes(search)
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
    await converterQueue.add([task]);
  };

  return (
    <>
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
            <UploadPanel supportedExtensions={AUDIO_FORMATS} />
          </div>
        ) : (
          filteredTasks.map((task) => {
            const outputFormat = (task.config as any)?.outputFormat || task.displayFormat || task.extension;
            const targetInfoParts = [
              outputFormat?.toUpperCase?.(),
              (task.config as any)?.video?.resolution,
            ].filter(Boolean);
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
                    {task.displayResolution && <span>{task.displayResolution}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {statusLabel(task)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-muted-foreground">{t("targetInfo")}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-foreground">
                    {targetInfoParts.length > 0 ? targetInfoParts.map((p, idx) => (
                      <span key={idx}>{p}</span>
                    )) : <span className="text-muted-foreground">-</span>}
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
