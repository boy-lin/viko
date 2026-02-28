import { startTransition, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import { CompressingTask, FileType } from "@/types/tasks";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { CompressVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { bridge } from "@/lib/bridge";
import { useTranslation } from "react-i18next";
import { CompressionSettingsDialog } from "./SettingsDialog";
import { useCompressorStore } from "./store";
import { formatToDefinition } from "@/data/capabilities";
import { MediaTaskType } from "@/types/tasks";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { formatFileSize } from "@/lib/file";
import { getVideoCompressionPresetByRatio } from "./compressionPreset";
import { extractFilenameFromPath } from "@/lib/utils";
import { toast } from "sonner";

interface TaskItemProps {
  task: CompressingTask;
}

const buildDefaultArgs = (task: CompressingTask, details: any): { args: CompressVideoTaskArgs; title: string } => {
  const title = details.title || extractFilenameFromPath(details.path);
  const taskId = task.id;
  const path = task.args.input_path;
  const format = (details.extension || task.args.format || "mp4").toLowerCase();
  const initialAudioTracks =
    details?.streams
      ?.filter((stream: any) => stream.codec_type === "audio")
      .map((stream: any) => ({
        source_stream_index: stream.index,
        channels: stream.channels,
        bit_depth: stream.bit_depth,
      })) || [];

  const outputArgs: CompressVideoTaskArgs = {
    ...(task.args as CompressVideoTaskArgs),
    ...getVideoCompressionPresetByRatio(task.args.ratio, format, initialAudioTracks).patch,
    task_id: taskId,
    format,
    input_path: path,
    ratio: task.args.ratio,
  };
  const containerDefinition = formatToDefinition.get(outputArgs.format);
  outputArgs.codec = outputArgs.codec || containerDefinition?.video?.allowedEncoders[0];
  outputArgs.audio_tracks =
    details?.streams
      ?.filter((stream: any) => stream.codec_type === "audio")
      .map((stream: any) => ({
        source_stream_index: stream.index,
        codec: containerDefinition?.audio?.allowedEncoders[0],
        bitrate: 128,
        sample_rate: 32000,
        channels: stream.channels,
        bit_depth: stream.bit_depth
      })) || [];
  return { args: outputArgs, title };
};

export default function TaskItem({ task }: TaskItemProps) {
  const { t } = useTranslation("converter");
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);
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
        const { args: outputArgs, title } = buildDefaultArgs(task, details);
        updateTaskById(task.id, {
          mediaDetails: details,
          args: outputArgs,
          fileType: FileType.Video,
          taskType: MediaTaskType.CompressVideo,
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
    console.log('compress_video mediaDetails', JSON.stringify(task.mediaDetails));
    try {
      await useCompressorStore.getState().pushTasksToQueue([task])
    } catch (e: any) {
      toast.error(e.message)
    }
  };

  if (loading) {
    return <TaskLoadingCard />;
  }

  const isQueuedOrProcessing = task.status === "queued" || task.status === "processing";

  const handleDeleteOrCancel = async () => {
    if (isQueuedOrProcessing) {
      await getMediaTaskQueue().cancelTaskById(task.id);
      startTransition(() => {
        updateTaskById(task.id, {
          status: "idle",
          progress: 0,
          errorMessage: undefined,
        });
      });
      return;
    }
    startTransition(() => {
      useCompressorStore.getState().removeTask(task.id);
    });
  };

  if (loadError) {
    return <TaskLoadErrorCard loadError={loadError} onRemove={handleDeleteOrCancel} />;
  }

  const taskArgs = task.args as CompressVideoTaskArgs;
  const firstVideoStream = task.mediaDetails?.streams.find((s) => s.codec_type === "video");
  const originalInfoParts = [
    task.mediaDetails?.extension?.toUpperCase?.(),
    firstVideoStream?.codec_name?.toUpperCase?.(),
    formatFileSize(task.mediaDetails?.size),
    firstVideoStream?.bit_rate,
  ];
  const targetInfoParts = [
    taskArgs.format?.toUpperCase?.(),
    taskArgs.codec?.toUpperCase?.(),
    '-',
    taskArgs.bitrate,
  ];

  const handleOutputTitleChange = (nextTitle: string) => {
    if (!task.mediaDetails?.path) {
      console.error('mediaDetails.path is undefined');
      return;
    }
    updateTaskById(task.id, {
      outputTitle: nextTitle,
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
        <div className="grid grid-cols-2 mt-2 text-sm text-muted-foreground">
          {originalInfoParts.map((p, idx) => (
            <span key={idx}>{p || "-"}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TaskStatusLabel task={task} />
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

        <CompressionSettingsDialog
          config={taskArgs}
          onConfigChange={async (config) => {
            startTransition(() => {
              updateTaskById(task.id, {
                args: {
                  ...taskArgs,
                  ...config,
                }
              });
            });
          }}
          onSave={(config) => {
            startTransition(() => {
              updateTaskById(task.id, {
                args: {
                  ...taskArgs,
                  ...config,
                }
              });
            });
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleDeleteOrCancel}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isQueuedOrProcessing ? t("actions.cancel", "取消") : t("actions.delete")}</TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          onClick={handleConvertSingle}
          disabled={isQueuedOrProcessing}
        >
          {t("actions.compressSingle", "压缩")}
        </Button>
      </div>
    </div>
  );
}
