import { startTransition, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import TaskStatusLabel from "@/components/ui-biz/TaskStatusLabel";
import TaskLoadingCard from "@/components/ui-biz/TaskLoadingCard";
import TaskLoadErrorCard from "@/components/ui-biz/TaskLoadErrorCard";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { FormatSelectorDialog } from "@/components/biz-form/FormatSelector";

import { bridge } from "@/lib/bridge";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { ConvertImageTaskArgs } from "@/lib/mediaTaskEvent"
import { IMAGE_CONTAINER_DEFINITIONS } from "@/data/capabilities";
import { FormatEnum } from "@/types/options";
import { FileType, MediaDetails, MediaTaskType } from "@/types/tasks";

import { ConverterTask, useConverterStore } from "./store";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";

interface TaskItemProps {
    task: ConverterTask;
}

function buildTaskDefaultsFromMedia(mediaInfo: MediaDetails, task: ConverterTask) {
    let format = FormatEnum.PNG;
    if (mediaInfo.extension === FormatEnum.PNG) {
        format = FormatEnum.PNG;
    } else {
        format = FormatEnum.JPG;
    }
    const containerDefinition = IMAGE_CONTAINER_DEFINITIONS[format as FormatEnum];
    const outputArgs: ConvertImageTaskArgs = {
        ...task.args,
        task_id: task.args.task_id || task.id,
        input_path: mediaInfo.path,
        format,
        image_encoder: containerDefinition?.allowedEncoders[0],
    };

    return {
        mediaDetails: mediaInfo,
        args: outputArgs,
        fileType: FileType.Image,
        taskType: MediaTaskType.ConvertImage,
        outputTitle: mediaInfo.title,
    } as ConverterTask;
}

export default function TaskItem({ task }: TaskItemProps) {
    const { t } = useTranslation("converter");
    const removeTask = useConverterStore((state) => state.removeTask);
    const updateTaskById = useConverterStore((state) => state.updateTaskById);
    const [loadingDetails, setLoadingDetails] = useState(!task.mediaDetails);
    const [loadError, setLoadError] = useState<string | null>(null);
    const loadingStarted = useRef(false);
    const inputPath = task.args.input_path;

    useEffect(() => {
        if (task.mediaDetails || loadingStarted.current) return;

        if (!inputPath) {
            setLoadError("缺少文件路径");
            setLoadingDetails(false);
            return;
        }

        loadingStarted.current = true;
        setLoadingDetails(true);

        bridge
            .getMediaDetails(inputPath)
            .then((mediaInfo) => {
                const updates = buildTaskDefaultsFromMedia(mediaInfo, task);
                startTransition(() => {
                    updateTaskById(task.id, updates);
                });
                setLoadError(null);
            })
            .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                setLoadError(message || "获取媒体信息失败");
            })
            .finally(() => {
                setLoadingDetails(false);
            });
    }, [inputPath, task.id, task.mediaDetails, updateTaskById]);

    const handleConvertSingle = async () => {
        await useConverterStore.getState().pushTasksToQueue([task])
    };

    const isQueuedOrProcessing = task.status === "queued" || task.status === "processing";

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
        removeTask(task.id);
    };

    const handleOutputTitleChange = (nextTitle: string) => {
        updateTaskById(task.id, {
            outputTitle: nextTitle,
        });
    };

    const ConvertImageTaskArgs = task.args as ConvertImageTaskArgs;
    const taskMediaDetails = task.mediaDetails;
    const firstVideoStream = taskMediaDetails?.streams.find(
        (s) => s.codec_type === "video"
    );

    const originalInfoParts = [
        taskMediaDetails?.extension?.toUpperCase?.(),
        firstVideoStream?.codec_name?.toUpperCase?.(),
        firstVideoStream?.width ? `${firstVideoStream.width}x${firstVideoStream.height}` : undefined,
        firstVideoStream?.frame_rate,
    ];

    const targetInfoParts = [
        ConvertImageTaskArgs.format?.toUpperCase?.(),
        ConvertImageTaskArgs.image_encoder?.toUpperCase?.(),
        ConvertImageTaskArgs.width ? `${ConvertImageTaskArgs.width}x${ConvertImageTaskArgs.height}` : undefined,
        ConvertImageTaskArgs.quality,
    ];

    if (loadingDetails) {
        return <TaskLoadingCard />;
    }

    if (loadError) {
        return (
            <TaskLoadErrorCard
                loadError={loadError}
                onRemove={handleDeleteOrCancel}
            />
        );
    }

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
                    <EllipsisName
                        name={task.mediaDetails?.title}
                        className="text-base font-semibold text-foreground"
                    />
                </div>
                <div className="grid grid-cols-2 mt-2 text-sm text-muted-foreground">
                    {originalInfoParts.map((p, idx) => <span key={idx}>{p || "-"}</span>)}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <TaskStatusLabel task={task} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-foreground">
                    <OutputTitleEditor
                        value={task.outputTitle}
                        onChange={handleOutputTitleChange}
                    />
                </div>
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
                        activeCategory: task.activeCategory,
                    }}
                    recentKey="converter-images-task-item"
                    onValueChange={(config) => {
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
                            onClick={() => {
                                void handleDeleteOrCancel();
                            }}
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
                    disabled={loadingDetails || !!loadError || isQueuedOrProcessing}
                >
                    {t("actions.convertSingle")}
                </Button>
            </div>
        </div>
    );
}
