import { startTransition, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
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
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import MediaOriginalInfoGrid from "@/components/ui-biz/MediaOriginalInfoGrid";
import MediaTargetInfoGrid from "@/components/ui-biz/MediaTargetInfoGrid";

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
  };
  const containerDefinition = formatToDefinition.get(outputArgs.format);
  outputArgs.video_encoder = containerDefinition?.video?.defaultEncoder;
  outputArgs.audio_tracks =
    mediaDetails?.streams
      ?.filter((stream: any) => stream.codec_type === "audio")
      .map((stream: any) => ({
        trackIndex: stream.index,
        codec: containerDefinition?.audio?.defaultEncoder,
      })) || [];

  return outputArgs;
};

export default function TaskItem({ task }: TaskItemProps) {
  const { t } = useTranslation("converter");
  const updateTaskById = useConverterStore((state) => state.updateTaskById);
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

  const handleConvertSingle = async () => {
    const outputDir = useSettingsStore.getState().getOutputDir(task.args.input_path);
    console.log('outputDir', outputDir, task.taskType)
    await getMediaTaskQueue().addConvertTasks([
      {
        kind: task.taskType,
        args: {
          ...task.args,
          output_path: `${outputDir}/${task.args.title}.${task.args.format}`
        },
      },
    ]);
  };

  if (loading) {
    return <TaskLoadingCard />;
  }

  const removeTask = async () => {
    await getMediaTaskQueue().cancelTaskById(task.id);
    useConverterStore.getState().removeTask(task.id);
  };

  if (loadError) {
    return <TaskLoadErrorCard loadError={loadError} onRemove={removeTask} />;
  }

  const convertVideoTaskArgs = task.args as ConvertVideoTaskArgs;

  const handleOutputTitleChange = (nextTitle: string) => {
    if (!task.mediaDetails?.path) {
      console.error('mediaDetails.path is undefined');
      return;
    }
    const outputDir = useSettingsStore.getState().getOutputDir(task.mediaDetails?.path);
    const output_path = `${outputDir}/${nextTitle}.${task.args.format}`
    startTransition(() => {
      updateTaskById(task.id, {
        outputTitle: nextTitle,
        args: {
          ...task.args,
          output_path,
        },
      });
    });
  };

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
        <MediaOriginalInfoGrid mediaDetails={task.mediaDetails} />
      </div>

      <div className="flex items-center gap-2">
        <TaskStatusLabel task={task} />
      </div>

      <div className="flex-1 min-w-0">
        <OutputTitleEditor
          value={task.outputTitle}
          onChange={handleOutputTitleChange}
        />
        <MediaTargetInfoGrid args={convertVideoTaskArgs} />
      </div>

      <div className="flex items-center gap-2">
        <FormatSelectorDialog
          config={{
            args: task.args,
            taskType: task.taskType,
            activeCategory: task.activeCategory,
          }}
          recentKey="converter-videos-task-item"
          onValueChange={(config) => {
            updateTaskById(task.id, {
              activeCategory: config.activeCategory,
              taskType: config.taskType,
              args: config.args,
            });
          }}
          applyConfigToAllTasks={(config) => {
            updateTaskById(task.id, {
              activeCategory: config.activeCategory,
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
