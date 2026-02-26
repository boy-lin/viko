import { useEffect, useRef, useState } from "react";
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
import { ConvertAudioTaskArgs } from "@/lib/mediaTaskEvent";
import { formatToDefinition } from "@/data/capabilities";
import { FormatEnum } from "@/types/options";
import { ConverterTask, FileType, MediaDetails, MediaTaskType } from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";
import OutputTitleEditor from "@/components/biz-form/OutputTitleEditor";

import { useConverterStore } from "./store";

interface TaskItemProps {
    task: ConverterTask;
}

function buildDefaultArgs(mediaInfo: MediaDetails, task: ConverterTask) {
    let format = FormatEnum.MP3;
    if (mediaInfo.extension === format) {
        format = FormatEnum.WAV;
    }
    const containerDefinition = formatToDefinition.get(format);
    const outputTitle = mediaInfo.title;
    const outputArgs: ConvertAudioTaskArgs = {
        ...task.args,
        task_id: task.args.task_id || task.id,
        title: outputTitle,
        input_path: mediaInfo.path,
        format,
        audio_tracks: mediaInfo.streams.filter((stream) => stream.codec_type === "audio").map((stream) => {
            return {
                trackIndex: stream.index,
                codec: containerDefinition?.audio?.defaultEncoder
            }
        })
    };
    return {
        mediaDetails: mediaInfo,
        args: outputArgs,
        fileType: FileType.Audio,
        taskType: MediaTaskType.ConvertAudio,
        outputTitle,
    };
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
                const updates = buildDefaultArgs(mediaInfo, task);
                updateTaskById(task.id, updates);
                setLoadError(null);
            })
            .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                setLoadError(message || "获取媒体信息失败");
            })
            .finally(() => {
                setLoadingDetails(false);
            });
    }, [inputPath]);

    const handleConvertSingle = async () => {
        await useConverterStore.getState().pushTasksToQueue([task])
    };


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

    const taskArgs = task.args as ConvertAudioTaskArgs;
    const taskMediaDetails = task.mediaDetails;
    const firstStream = taskMediaDetails?.streams.find(
        (s) => s.codec_type === "audio"
    );
    const audioTrack = taskArgs.audio_tracks?.[0];

    const originalInfoParts = [
        taskMediaDetails?.extension,
        firstStream?.codec_name,
        firstStream?.bit_rate,
        firstStream?.sample_rate,
    ];

    const targetInfoParts = [
        taskArgs.format,
        audioTrack?.codec,
        audioTrack?.bitrate,
        audioTrack?.sample_rate,
    ];

    if (loadingDetails) {
        return <TaskLoadingCard />;
    }

    if (loadError) {
        return (
            <TaskLoadErrorCard
                loadError={loadError}
                onRemove={() => {
                    removeTask(task.id);
                }}
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
                    recentKey="converter-audios-task-item"
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
                            onClick={() => {
                                removeTask(task.id);
                            }}
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
                    disabled={loadingDetails || !!loadError}
                >
                    {t("actions.convertSingle")}
                </Button>
            </div>
        </div>
    );
}
