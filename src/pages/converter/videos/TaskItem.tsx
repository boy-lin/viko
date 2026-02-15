import { useEffect, useState } from "react";
import { Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConverterTask, FileType } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { ConvertVideoTaskArgs, bridge, getMediaTaskQueue } from "@/lib/bridge";
import { useTranslation } from "react-i18next";
import { FormatSelectorDialog } from "@/components/biz-form/FormatSelector";
import { useConverterStore } from "./store";
import { FormatEnum } from "@/types/options";
import { formatToDefinition } from "@/data/capabilities";
import { MediaTaskType } from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";

interface TaskItemProps {
  task: ConverterTask;
}

const buildDefaultArgs = (taskId: string, path: string, mediaTitle: string, mediaDetails: any) => {
  const outputDir = useSettingsStore.getState().getOutputDir(path);
  let format = FormatEnum.MP4;
  if (mediaDetails.extension === format) {
    format = FormatEnum.MOV
  }

  const outputArgs: any = {
    task_id: taskId,
    title: mediaTitle,
    format: format,
    input_path: path,
    output_path: ""
  };
  outputArgs.output_path = `${outputDir}/${mediaTitle}.${outputArgs.format}`;
  const containerDefinition = formatToDefinition.get(outputArgs.format);
  outputArgs.video_encoder = containerDefinition?.video?.defaultEncoder;
  outputArgs.audio_tracks =
    mediaDetails?.streams
      ?.filter((stream: any) => stream.codec_type === "audio")
      .map((stream: any) => ({
        trackIndex: stream.index,
        encoder: containerDefinition?.audio?.defaultEncoder,
      })) || [];

  return outputArgs;
};

export default function TaskItem({ task }: TaskItemProps) {
  const { t } = useTranslation("converter");
  const updateTaskById = useConverterStore((state) => state.updateTaskById);
  const formatRecents = useConverterStore((state) => state.formatRecents);
  const addToRecents = useConverterStore((state) => state.addToRecents);
  const [loading, setLoading] = useState(!task.mediaDetails);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadDetails = async () => {
      if (task.mediaDetails || !task.args?.input_path) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const details = await bridge.getMediaDetails(task.args.input_path);
        if (!active) return;
        const title = details.title || details.path.split(/[/\\]/).pop() || "Unknown";
        const outputArgs = buildDefaultArgs(task.id, details.path, title, details);
        updateTaskById(task.id, {
          mediaDetails: details,
          args: outputArgs,
          fileType: FileType.Video,
          taskType: MediaTaskType.ConvertVideo,
          outputTitle: title,
        });
      } catch (error: any) {
        if (!active) return;
        setLoadError(error?.message || "Failed to load media details");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadDetails();
    return () => {
      active = false;
    };
  }, [task.args?.input_path]);

  const statusLabel = () => {
    const errorMessage = (task as any).errorMessage || (task as any).error;
    const map = {
      idle: { text: t("status.idle", "等待中"), color: "text-gray-600", badge: "bg-gray-100" },
      processing: { text: t("status.processing", "转换中"), color: "text-blue-600", badge: "bg-blue-100" },
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
  };

  const handleConvertSingle = async () => {
    await getMediaTaskQueue().addConvertTasks([
      {
        kind: task.taskType,
        args: task.args,
      },
    ]);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-border shadow-sm animate-pulse">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-3 bg-muted rounded" />
            <div className="h-3 bg-muted rounded" />
          </div>
        </div>
        <div className="w-24 h-6 bg-muted rounded-full" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-3 bg-muted rounded" />
            <div className="h-3 bg-muted rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 bg-muted rounded" />
          <div className="h-9 w-9 bg-muted rounded" />
          <div className="h-9 w-20 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const removeTask = async () => {
    await getMediaTaskQueue().cancelTaskById(task.id);
    useConverterStore.getState().removeTask(task.id);
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-red-200 shadow-sm">
        <div className="w-20 h-20 rounded-lg bg-red-50 flex items-center justify-center text-red-500 flex-shrink-0">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-red-600">加载失败</div>
          <div className="text-sm text-muted-foreground mt-1 truncate">
            {loadError}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={removeTask}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("actions.delete")}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  const convertVideoTaskArgs = task.args as ConvertVideoTaskArgs;
  const firstVideoStream = task.mediaDetails?.streams.find((s) => s.codec_type === "video");
  const originalInfoParts = [
    task.mediaDetails?.extension?.toUpperCase?.(),
    firstVideoStream?.codec_name?.toUpperCase?.(),
    firstVideoStream?.width + "x" + firstVideoStream?.height,
    firstVideoStream?.frame_rate,
  ];
  const targetInfoParts = [
    convertVideoTaskArgs.format?.toUpperCase?.(),
    convertVideoTaskArgs.video_encoder?.toUpperCase?.(),
    convertVideoTaskArgs.resolution,
    convertVideoTaskArgs.frame_rate,
  ];

  const handleOutputTitleChange = (nextTitle: string) => {
    if (!task.mediaDetails?.path) {
      console.error('mediaDetails.path is undefined');
      return;
    }
    const outputDir = useSettingsStore.getState().getOutputDir(task.mediaDetails?.path);
    const output_path = `${outputDir}/${nextTitle}.${task.args.format}`
    updateTaskById(task.id, {
      outputTitle: nextTitle,
      args: {
        ...task.args,
        output_path,
      },
    });
  };

  console.log('task', task);

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-border shadow-sm">
      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
        <MediaThumbnail
          path={task.mediaDetails?.path}
          title={task.mediaDetails?.title}
          fileType={task.fileType}
          className="w-full h-full"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <EllipsisName name={task.mediaDetails?.title} className="text-base font-semibold text-foreground" />
        </div>
        <div className="grid grid-cols-2 mt-2 text-sm text-muted-foreground">
          {originalInfoParts.map((p, idx) => (
            <span key={idx}>{p || "-"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {statusLabel()}
      </div>

      <div className="flex-1 min-w-0">
        <OutputTitleEditor
          value={task.outputTitle}
          onChange={handleOutputTitleChange}
        />
        <div className="grid grid-cols-2 mt-1 text-sm text-muted-foreground">
          {targetInfoParts.map((p, idx) => (
            <span key={idx}>{p || "auto"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <FormatSelectorDialog
          config={{
            args: task.args,
            taskType: task.taskType,
            activeCategory: FileType.Video,
          }}
          formatRecents={formatRecents}
          addToRecents={addToRecents}
          onValueChange={(config) => {
            updateTaskById(task.id, {
              taskType: config.taskType,
              args: config.args,
            });
          }}
          applyConfigToAllTasks={(config) => {
            updateTaskById(task.id, {
              taskType: config.taskType,
              args: config.args,
            });
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={removeTask}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("actions.delete")}</TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          onClick={handleConvertSingle}
        >
          {t("actions.convertSingle", "转换")}
        </Button>
      </div>
    </div>
  );
}
