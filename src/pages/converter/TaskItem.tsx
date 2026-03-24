import { useMemo } from "react";
import { ArrowBigRight, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FormatSelectorDialog } from "@/components/biz-form/FormatSelector";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import MediaOriginalInfoGrid from "@/components/ui-biz/MediaOriginalInfoGrid";
import MediaTargetInfoGrid from "@/components/ui-biz/MediaTargetInfoGrid";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";

import { ConverterTask, ConverterTaskArgs, useConverterStore } from "./store";
import { buildTaskDefaultsFromDetails } from "./taskDefaults";

interface ConverterTaskItemProps {
  task: ConverterTask;
  metaStatus?: "idle" | "loading" | "error";
  metaError?: string;
  onRetryMeta?: () => void;
}

export default function ConverterTaskItem({
  task,
  metaStatus,
  metaError,
  onRetryMeta,
}: ConverterTaskItemProps) {
  const { t } = useTranslation("task");
  const updateTaskById = useConverterStore((state) => state.updateTaskById);

  const currentMetaStatus = metaStatus ?? (task.mediaDetails ? "idle" : "loading");
  const loading =
    currentMetaStatus === "loading" ||
    (!task.mediaDetails && currentMetaStatus !== "error");
  const isQueuedOrProcessing =
    task.status === "queued" || task.status === "processing";
  const outputTitleValue = useMemo(
    () => task.outputTitle ?? task.mediaDetails?.title ?? "",
    [task.outputTitle, task.mediaDetails?.title],
  );

  const handleDeleteOrCancel = async () => {
    if (isQueuedOrProcessing) {
      await getMediaTaskQueue().cancelTaskById(task.id);
      updateTaskById(task.id, {
        status: "idle",
        progress: 0,
        errorMessage: undefined,
      });
      return;
    }
    useConverterStore.getState().removeTask(task.id);
  };

  if (loading) {
    return <TaskLoadingCard />;
  }

  if (currentMetaStatus === "error") {
    return (
      <TaskLoadErrorCard
        loadError={metaError || "Failed to load media details"}
        onRemove={() => {
          void handleDeleteOrCancel();
        }}
        onRetry={onRetryMeta}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-1">
      <div className="h-22 aspect-square flex-shrink-0 overflow-hidden rounded-lg">
        <MediaThumbnail
          path={task.mediaDetails?.path}
          thumbnailPath={task.thumbnailPath}
          title={task.mediaDetails?.title}
          className="h-full w-full"
        />
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-3">
          <EllipsisName
            name={task.mediaDetails?.title}
            className="text-base font-semibold text-foreground/80"
          />
        </div>
        <MediaOriginalInfoGrid mediaDetails={task.mediaDetails} />
      </div>

      <div className="flex items-center">
        <ArrowBigRight className="h-4 w-4" />
      </div>

      <div className="relative min-w-[300px] basis-1/5 flex-1 rounded-lg bg-card p-2 shadow-sm">
        <OutputTitleEditor
          value={outputTitleValue}
          onChange={(nextTitle) => {
            updateTaskById(task.id, {
              outputTitle: nextTitle,
            });
          }}
        />
        <MediaTargetInfoGrid args={task.args as ConverterTaskArgs} />
        <div className="absolute right-1 top-1 flex flex-col items-center gap-1">
          <FormatSelectorDialog
            config={{
              args: task.args,
              taskType: task.taskType,
              activeCategory: task.activeCategory,
            }}
            recentKey="converter-task-item"
            onValueChange={(config) => {
              let args = {}
              if (task.activeCategory !== config.activeCategory) {
                if (task.mediaDetails) {
                  args = buildTaskDefaultsFromDetails({
                    ...task,
                    activeCategory: config.activeCategory,
                  }, task.mediaDetails).args || {}
                }
              }
              updateTaskById(task.id, {
                activeCategory: config.activeCategory || task.activeCategory,
                taskType: config.taskType || task.taskType,
                args: {
                  ...args,
                  ...config.args
                },
              });
            }}
          />
          <TaskStatusLabel task={task} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => {
                void handleDeleteOrCancel();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isQueuedOrProcessing ? t("actions.cancel") : t("actions.delete")}
          </TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="cursor-pointer px-4"
          disabled={loading || isQueuedOrProcessing}
          onClick={() => {
            void useConverterStore.getState().pushTasksToQueue([task]);
          }}
        >
          {t("actions.convertSingle")}
        </Button>
      </div>
    </div>
  );
}
