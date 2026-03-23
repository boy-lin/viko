import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { WatermarkConfig } from "@/lib/mediaTaskEvent";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { IMAGE_SUPPORT_FORMATS, VIDEO_SUPPORT_FORMATS } from "@/data/formats";
import { toast } from "sonner";
import { useWatermarkStore } from "./store";
import { BottomToolbar } from "./BottomToolbar";
import { DEFAULT_WATERMARK_FONT_CSS_FAMILY, resolveDefaultWatermarkFontPath } from "./font";
import { PreviewPanel } from "./PreviewPanel";
import { positionMap } from "./types";
import { UploadPanel } from "./UploadPanel";
import { bridge } from "@/lib/bridge";
import { useTranslation } from "react-i18next";
import { MediaTaskType } from "@/types/tasks";
import { useSettingsStore } from "@/stores/settingsStore";
import { extractFilenameFromPath, getExtension } from "@/lib/utils";

export default function WatermarkPage() {
    const { t } = useTranslation("watermark");

    const [isCancelling, setIsCancelling] = useState(false);

    const config = useWatermarkStore((state) => state.config);
    const previewFrame = useWatermarkStore((state) => state.previewFrame);
    const isPreviewLoading = useWatermarkStore((state) => state.isPreviewLoading);
    const queueTasks = useWatermarkStore((state) => state.queueTasks);
    const clearTasks = useWatermarkStore((state) => state.clearTasks);
    const updateTaskById = useWatermarkStore((state) => state.updateTaskById);
    const updateConfig = useWatermarkStore((state) => state.updateConfig);
    const resetConfig = useWatermarkStore((state) => state.resetConfig);
    const setPreviewFrame = useWatermarkStore((state) => state.setPreviewFrame);
    const setPreviewLoading = useWatermarkStore((state) => state.setPreviewLoading);
    const runningTasks = useMemo(
        () => queueTasks.filter((task) => task.status === "processing"),
        [queueTasks]
    );
    const finishedTasks = useMemo(
        () => queueTasks.filter((task) => task.status === "finished"),
        [queueTasks]
    );
    const isRunning = runningTasks.length > 0;
    const progress = useMemo(() => {
        if (!queueTasks.length) return 0;
        const total = queueTasks.reduce((sum, task) => {
            if (task.status === "finished") return sum + 100;
            if (task.status === "processing") return sum + (task.progress || 0);
            return sum;
        }, 0);
        return total / queueTasks.length;
    }, [queueTasks]);
    const firstVideoPath = useMemo(
        () => queueTasks[0]?.args?.input_path as string | undefined,
        [queueTasks]
    );

    useEffect(() => {
        let active = true;
        void (async () => {
            if (config.fontPath) return;
            const fontPath = await resolveDefaultWatermarkFontPath();
            console.log("resolveDefaultWatermarkFontPath", fontPath);
            if (!active) return;
            updateConfig({
                fontFamily: DEFAULT_WATERMARK_FONT_CSS_FAMILY,
                fontPath: fontPath ?? "",
            });
        })();

        return () => {
            active = false;
        };
    }, [config.fontPath, updateConfig]);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const loadPreviewFrame = async () => {
            if (!firstVideoPath) {
                if (active) {
                    setPreviewFrame(null);
                    setPreviewLoading(false);
                }
                return;
            }
            try {
                if (active) {
                    setPreviewLoading(true);
                }
                const result = await bridge.generateMediaThumbnail(
                    firstVideoPath,
                    {
                        width: 1920
                    },
                    { signal: controller.signal }
                );
                if (active) {
                    if (result?.thumbnailPath) {
                        const resolvedWidth = result.sourceWidth ?? result.width;
                        const resolvedHeight = result.sourceHeight ?? result.height;
                        setPreviewFrame({
                            dataUrl: convertFileSrc(result.thumbnailPath),
                            width: resolvedWidth,
                            height: resolvedHeight,
                        });
                    } else if (result?.dataUrl) {
                        const resolvedWidth = result.sourceWidth ?? result.width;
                        const resolvedHeight = result.sourceHeight ?? result.height;
                        setPreviewFrame({
                            dataUrl: result.dataUrl,
                            width: resolvedWidth,
                            height: resolvedHeight,
                        });
                    } else {
                        setPreviewFrame(null);
                    }
                    setPreviewLoading(false);
                }
            } catch (error) {
                if (active) {
                    setPreviewFrame(null);
                    setPreviewLoading(false);
                }
                console.error("Failed to load watermark preview frame:", error);
            }
        };

        loadPreviewFrame();
        return () => {
            active = false;
            controller.abort();
        };
    }, [firstVideoPath, setPreviewFrame, setPreviewLoading]);

    const handleStartWork = async () => {
        if (isRunning) {
            return;
        }
        if (queueTasks.length === 0) {
            toast.error(t("messages.selectAtLeastOneVideo"));
            return;
        }

        const { x, y } = positionMap[config.position] || positionMap.c;

        // Construct Watermark Config
        const watermarkConfig: WatermarkConfig = {};
        const offsetX = config.offsetX;
        const offsetY = config.offsetY;

        if (config.type === "text") {
            if (!config.text) {
                toast.error(t("messages.enterWatermarkText"));
                return;
            }
            watermarkConfig.text = {
                content: config.text,
                font_path: config.fontPath || undefined,
                rotation: config.rotation,
                font_size: config.size,
                color: "#FFFFFF",
                opacity: config.opacity / 100,
                x,
                y,
                anchor: config.position as any,
                offset_x: offsetX,
                offset_y: offsetY,
                offset_unit: "px",
            };
        } else {
            if (!config.imagePath) {
                toast.error(t("messages.selectWatermarkImage"));
                return;
            }
            watermarkConfig.image = {
                path: config.imagePath,
                rotation: config.rotation,
                scale: config.size / 100,
                opacity: config.opacity / 100,
                x,
                y,
                anchor: config.position as any,
                offset_x: offsetX,
                offset_y: offsetY,
                offset_unit: "px",
                size_mode: "video_width_ratio",
                size_value: config.size / 100,
            };
        }

        const tasks = queueTasks.map((task) => {
            const outputDir = useSettingsStore.getState().getOutputDir(task.args.input_path);
            const title = extractFilenameFromPath(task.args.input_path);
            const format = getExtension(task.args.input_path) || "mp4";
            const outputPath = `${outputDir}/${title}_watermarked.${format}`;
            return {
                ...task,
                type: MediaTaskType.Watermark,
                args: {
                    ...task.args,
                    format,
                    output_path: outputPath,
                    watermark: watermarkConfig,
                } as typeof task.args
            }
        });

        try {
            tasks.forEach((task) => {
                useWatermarkStore.getState().updateTaskById(task.id, {
                    status: "processing",
                    progress: 0,
                    args: {
                        ...task.args,
                        output_path: task.args.output_path,
                        watermark: task.args.watermark,
                    },
                });
            });
            await getMediaTaskQueue().addTasks(tasks);
        } catch (e: any) {
            console.error(e);
            toast.error(t("messages.submitFailed", { message: e.message }));
        }
    };

    const handleCancelWork = async () => {
        if (!runningTasks.length) return;
        try {
            setIsCancelling(true);
            await Promise.allSettled(
                runningTasks.map((task) => getMediaTaskQueue().cancelTaskById(task.id))
            );
            runningTasks.forEach((task) => {
                updateTaskById(task.id, {
                    status: "idle",
                    progress: 0,
                    errorMessage: undefined,
                });
            });
        } catch (e: any) {
            console.error(e);
            toast.error(t("messages.cancelFailed", { message: e.message }));
        } finally {
            setIsCancelling(false);
        }
    };


    if (queueTasks.length === 0) {
        return (
            <div className="p-4 flex-1 rounded-xl overflow-hidden">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        {t("title")}
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        {t("subtitle")}
                    </p>
                </div>
                <UploadPanel
                    supportedExtensions={[...VIDEO_SUPPORT_FORMATS, ...IMAGE_SUPPORT_FORMATS].map((format) => format.toLowerCase())}
                />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Main Preview Area */}
            <div className="flex-1 flex min-w-0">
                <PreviewPanel
                    config={config}
                    frame={previewFrame}
                    loading={isPreviewLoading}
                    onOffsetChange={(offsetX, offsetY) =>
                        updateConfig({ offsetX, offsetY })
                    }
                />
            </div>

            <BottomToolbar
                selectedCount={queueTasks.length}
                processingCount={runningTasks.length}
                finishedCount={finishedTasks.length}
                onClear={() => {
                    clearTasks();
                    resetConfig();
                    setPreviewFrame(null);
                    setPreviewLoading(false);
                }}
                onExport={handleStartWork}
                onCancel={handleCancelWork}
                isRunning={isRunning}
                isCancelling={isCancelling}
                progress={progress}
                config={config}
                onConfigChange={updateConfig}
            />
        </div>
    );
}
