import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { FormatSelectorDialog } from "@/components/biz-form/FormatSelector";

import { bridge, ConvertVideoTaskArgs, getMediaTaskQueue } from "@/lib/bridge";
import { formatToDefinition } from "@/data/capabilities";
import { FormatEnum } from "@/types/options";
import { ConverterTask, FileType, MediaDetails, MediaTaskType } from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";

import { useConverterStore } from "./store";

interface TaskItemProps {
    task: ConverterTask;
}

function buildTaskDefaultsFromMedia(mediaInfo: MediaDetails, task: ConverterTask) {
    const outputDir = useSettingsStore.getState().getOutputDir(mediaInfo.path);
    let format = FormatEnum.PNG;
    if (mediaInfo.extension === FormatEnum.PNG) {
        format = FormatEnum.PNG;
    } else {
        format = FormatEnum.JPG;
    }
    const containerDefinition = formatToDefinition.get(format);
    const outputArgs: any = {
        ...task.args,
        task_id: task.args.task_id || task.id,
        title: mediaInfo.title,
        input_path: mediaInfo.path,
        output_path: `${outputDir}/${mediaInfo.title}.${format}`,
        format,
        image_encoder: containerDefinition?.image?.defaultEncoder,
    };

    return {
        mediaDetails: mediaInfo,
        args: outputArgs,
        fileType: FileType.Image,
        taskType: MediaTaskType.ConvertImage,
    };
}

export default function TaskItem({ task }: TaskItemProps) {
    const { t } = useTranslation("converter");
    const globalConfig = useConverterStore((state) => state.globalConfig);
    const { removeTask, updateTaskById } = useConverterStore();
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
    }, [inputPath, task.id, task.mediaDetails, updateTaskById]);

    const statusLabel = useMemo(() => {
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
    }, [task, t]);

    const handleConvertSingle = async () => {
        await getMediaTaskQueue().addConvertTasks([
            {
                kind: task.taskType,
                args: task.args,
            },
        ]);
    };

    const convertVideoTaskArgs = task.args as ConvertVideoTaskArgs;
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
        convertVideoTaskArgs.format?.toUpperCase?.(),
        convertVideoTaskArgs.video_encoder?.toUpperCase?.(),
        convertVideoTaskArgs.resolution,
        convertVideoTaskArgs.frame_rate,
    ];

    return (
        <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-border shadow-sm">
            <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                {loadingDetails ? (
                    <div className="w-full h-full bg-gray-100 animate-pulse" />
                ) : (
                    <MediaThumbnail
                        path={task.mediaDetails?.path}
                        title={task.mediaDetails?.title}
                        fileType={task.fileType}
                        className="w-full h-full"
                    />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                    {loadingDetails ? (
                        <div className="h-5 w-48 rounded bg-gray-100 animate-pulse" />
                    ) : (
                        <EllipsisName
                            name={task.mediaDetails?.title}
                            className="text-base font-semibold text-foreground"
                        />
                    )}
                </div>
                <div className="grid grid-cols-2 mt-2 text-sm text-muted-foreground">
                    {loadingDetails
                        ? [0, 1, 2, 3].map((idx) => (
                            <div key={idx} className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                        ))
                        : originalInfoParts.map((p, idx) => <span key={idx}>{p || "-"}</span>)}
                </div>
                {loadError && (
                    <div className="mt-2 text-xs text-red-600 flex items-center gap-2">
                        <ShieldAlert className="h-3 w-3" />
                        <span>{loadError}</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">{statusLabel}</div>

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
                    onClick={handleConvertSingle}
                    disabled={loadingDetails || !!loadError}
                >
                    {t("actions.convertSingle", "杞崲")}
                </Button>
            </div>
        </div>
    );
}
