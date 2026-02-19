import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getMediaTaskQueue, WatermarkConfig } from "@/lib/bridge";
import { VIDEO_FORMATS } from "@/data/formats";
import { toast } from "sonner";
import { MediaTaskType } from "@/types/tasks";
import { useWatermarkStore } from "./store";
import { BottomToolbar } from "./BottomToolbar";
import { PreviewPanel } from "./PreviewPanel";
import { SettingsPanel } from "./SettingsPanel";
import { defaultWatermarkConfig, positionMap } from "./types";
import { UploadPanel } from "./UploadPanel";

export default function WatermarkPage() {
    const [config, setConfig] = useState(defaultWatermarkConfig);
    const [previewFrame, setPreviewFrame] = useState<{
        dataUrl: string;
        width: number;
        height: number;
    } | null>(null);

    const queueTasks = useWatermarkStore((state) => state.queueTasks);
    const clearTasks = useWatermarkStore((state) => state.clearTasks);
    const firstVideoPath = useMemo(
        () => queueTasks[0]?.args?.input_path as string | undefined,
        [queueTasks]
    );

    useEffect(() => {
        let active = true;
        const loadPreviewFrame = async () => {
            if (!firstVideoPath) {
                if (active) setPreviewFrame(null);
                return;
            }
            try {
                const result = await invoke<{ dataUrl: string; width: number; height: number } | null>(
                    "generate_media_thumbnail",
                    {
                        path: firstVideoPath,
                        options: null,
                    }
                );
                if (active) {
                    setPreviewFrame(result);
                }
            } catch (error) {
                if (active) {
                    setPreviewFrame(null);
                }
                console.error("Failed to load watermark preview frame:", error);
            }
        };

        loadPreviewFrame();
        return () => {
            active = false;
        };
    }, [firstVideoPath]);

    const handleExport = async () => {
        if (queueTasks.length === 0) {
            toast.error("Please select at least one video file.");
            return;
        }

        const { x, y } = positionMap[config.position] || positionMap.c;

        // Construct Watermark Config
        const watermarkConfig: WatermarkConfig = {};
        const offsetX = config.offsetX;
        const offsetY = config.offsetY;

        if (config.type === "text") {
            if (!config.text) {
                toast.error("Please enter watermark text.");
                return;
            }
            watermarkConfig.text = {
                content: config.text,
                font_path: "",
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
                toast.error("Please select a watermark image.");
                return;
            }
            watermarkConfig.image = {
                path: config.imagePath,
                scale: config.size / 100, // Reuse size slider as scale (e.g. 50 -> 0.5)
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
            const file = task.args.input_path;
            const outputPath = file.replace(/(\.[^/.]+)?$/, "_watermarked.mp4");
            return {
                kind: MediaTaskType.ConvertVideo,
                args: {
                    task_id: crypto.randomUUID(),
                    input_path: file,
                    output_path: outputPath,
                    watermark: watermarkConfig,
                }
            }
        });

        try {
            await getMediaTaskQueue().addConvertTasks(tasks);
            toast.success(`Submitted ${tasks.length} tasks!`);
            // Optional: navigate to tasks page
        } catch (e: any) {
            console.error(e);
            toast.error("Failed to submit tasks: " + e.message);
        }
    };


    if (queueTasks.length === 0) {
        return (
            <div className="flex-1 rounded-xl overflow-hidden">
                <UploadPanel supportedExtensions={VIDEO_FORMATS.map((format) => format.toLowerCase())} />
            </div>
        );
    }


    return (
        <div className="flex h-[calc(100vh-4rem)] bg-background">
            {/* Main Preview Area */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden relative">
                    <PreviewPanel
                        config={config}
                        frame={previewFrame}
                        onOffsetChange={(offsetX, offsetY) =>
                            setConfig((prev) => ({ ...prev, offsetX, offsetY }))
                        }
                    />
                </div>
                <BottomToolbar selectedCount={queueTasks.length} onClear={clearTasks} onExport={handleExport} />
            </div>
            <SettingsPanel
                config={config}
                onChange={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
            />
        </div>
    );
}
