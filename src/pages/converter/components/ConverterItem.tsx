import React, { useEffect, useRef } from "react";
import {
    FileVideo,
    Settings,
    Trash2,
    Info,
    Loader2,
    RotateCcw
} from "lucide-react";
import { formatDuration } from "@/lib/time";
import { formatFileSize, getFormatByPath } from "@/lib/file";
import { Button } from "@/components/ui/button";
import { ConverterTask } from "@/types/converter";

import { useConverterStore } from "@/stores/converterStore";
import { ConversionSettingsDialog } from "./ConversionSettingsDialog";
import { MediaThumbnail } from "./MediaThumbnail";
import { FormatSelector } from "@/components/biz-form/FormatSelector";
import type { FormatSelectorValue } from "@/components/biz-form/FormatSelector";
import { isAudioFormat, isVideoFormat } from "@/data/formats";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Progress } from "@/components/ui/progress";

interface ConverterItemProps {
    task: ConverterTask;
}

export const ConverterItem: React.FC<ConverterItemProps> = ({ task }) => {
    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
    const { removeTask, updateTaskById, outputPath } = useConverterStore();

    const isVideo = isVideoFormat(task.config?.outputFormat)

    const unlistenProgressRef = useRef<(() => void) | null>(null);
    const unlistenCompleteRef = useRef<(() => void) | null>(null);
    const unlistenErrorRef = useRef<(() => void) | null>(null);

    // Clean up listeners on unmount
    useEffect(() => {
        return () => {
            if (unlistenProgressRef.current) unlistenProgressRef.current();
            if (unlistenCompleteRef.current) unlistenCompleteRef.current();
            if (unlistenErrorRef.current) unlistenErrorRef.current();
        };
    }, []);

    const handleStart = async () => {
        const outputFormat = task.config?.outputFormat;
        const isAudioTarget = isAudioFormat(outputFormat)
        if (isAudioTarget) {
            try {
                updateTaskById(task.id, { status: 'converting', progress: 0 });

                // Setup listeners
                unlistenProgressRef.current = await listen<string>('audio-conversion-progress', (event) => {
                    // Parse "XX.X%"
                    const progress = parseFloat(event.payload.replace('%', ''));
                    if (!isNaN(progress)) {
                        updateTaskById(task.id, { progress });
                    }
                });

                unlistenCompleteRef.current = await listen<string>('audio-conversion-complete', (event) => {
                    console.log("Audio conversion complete:", event);
                    updateTaskById(task.id, {
                        status: 'finished',
                        progress: 100,
                        outputPath: event.payload
                    });

                    // Logic for auto-navigation or badge
                    const { tasks, setActiveTab, incrementUnreadFinishedCount } = useConverterStore.getState();
                    const convertingTasks = tasks.filter(t => t.id !== task.id && t.status === 'converting');

                    if (convertingTasks.length === 0) {
                        setActiveTab('finished');
                    } else {
                        incrementUnreadFinishedCount();
                    }

                    // Cleanup listeners
                    if (unlistenProgressRef.current) unlistenProgressRef.current();
                    if (unlistenCompleteRef.current) unlistenCompleteRef.current();
                    if (unlistenErrorRef.current) unlistenErrorRef.current();
                });

                unlistenErrorRef.current = await listen<string>('audio-conversion-error', (event) => {
                    updateTaskById(task.id, { status: 'error' });
                    console.error("Audio conversion failed:", event.payload);
                    // Cleanup listeners
                    if (unlistenProgressRef.current) unlistenProgressRef.current();
                    if (unlistenCompleteRef.current) unlistenCompleteRef.current();
                    if (unlistenErrorRef.current) unlistenErrorRef.current();
                });
                let finalOutputPath: string | null = null;

                if (outputPath) {
                    const separator = outputPath.includes('\\') ? '\\' : '/';
                    const stem = task.config?.outputTitle;
                    finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
                }
                const { useHardwareAcceleration, useUltraFastSpeed } = useConverterStore.getState();
                const audioTrack = task.config?.audioTracks?.[0];
                const args: any = {
                    input_path: task.path,
                    output_path: finalOutputPath,
                    format: outputFormat,
                    bitrate: audioTrack?.bitrate ? parseInt(audioTrack.bitrate) : 192,
                    use_hardware_acceleration: useHardwareAcceleration,
                    use_ultra_fast_speed: useUltraFastSpeed,
                    audio_encoder: audioTrack?.encoder
                }
                const sampleRate = audioTrack?.sampleRate;
                if (sampleRate && sampleRate === 'original') {
                    args.sample_rate = 0
                } else {
                    args.sample_rate = parseInt(sampleRate || '0');
                }
                if (finalOutputPath) {
                    updateTaskById(task.id, { outputPath: finalOutputPath });
                }
                console.log("Invoking convert_audio_file with args:", args);
                await invoke('convert_audio_file', {
                    args
                });

            } catch (error) {
                console.error("Failed to start audio conversion: " + JSON.stringify(error));
                updateTaskById(task.id, { status: 'error' });
            }
        } else {
            console.log("Starting video conversion...");
            try {
                updateTaskById(task.id, { status: 'converting', progress: 0 });
                unlistenProgressRef.current = await listen<number>(
                    'video-conversion-progress', (event) => {
                        // event.payload is number 0-100
                        const progress = event.payload;
                        if (typeof progress === 'number' && !isNaN(progress)) {
                            updateTaskById(task.id, { progress });
                        }
                    });

                unlistenCompleteRef.current = await listen<string>(
                    'audio-conversion-complete', (event) => {
                        if (event.payload.includes(task.config?.outputTitle || '')) {
                            console.log("Video conversion complete:", event);
                            updateTaskById(task.id, {
                                status: 'finished',
                                progress: 100,
                                outputPath: event.payload
                            });

                            // Determine navigation logic
                            const { tasks, incrementUnreadFinishedCount, setActiveTab } = useConverterStore.getState();
                            const convertingTasks = tasks.filter(t => t.id !== task.id && t.status === 'converting');

                            if (convertingTasks.length === 0) {
                                setActiveTab('finished');
                            } else {
                                incrementUnreadFinishedCount();
                            }

                            // Cleanup
                            if (unlistenProgressRef.current) unlistenProgressRef.current();
                            if (unlistenCompleteRef.current) unlistenCompleteRef.current();
                            if (unlistenErrorRef.current) unlistenErrorRef.current();
                        }
                    });

                unlistenErrorRef.current = await listen<string>('audio-conversion-error', (event) => {
                    updateTaskById(task.id, { status: 'error' });
                    console.error("Video conversion failed:", event.payload);
                    // Cleanup
                    if (unlistenProgressRef.current) unlistenProgressRef.current();
                    if (unlistenCompleteRef.current) unlistenCompleteRef.current();
                    if (unlistenErrorRef.current) unlistenErrorRef.current();
                });

                let finalOutputPath: string | null = null;
                if (outputPath) {
                    const separator = outputPath.includes('\\') ? '\\' : '/';
                    const stem = task.config?.outputTitle;
                    finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
                }

                const { useHardwareAcceleration, useUltraFastSpeed } = useConverterStore.getState();

                // Construct VideoConversionArgs
                const args: any = {
                    input_path: task.path,
                    output_path: finalOutputPath,
                    format: outputFormat,
                    video_encoder: task.config?.video?.encoder || 'h264',
                    resolution: task.config?.video?.resolution,
                    // Parse bitrate if manual, else undefined/null for auto
                    // task.config.video.bitrate is string like "2000k" or "auto"
                    video_bitrate: task.config?.video?.bitrate && task.config.video.bitrate !== 'auto'
                        ? parseInt(task.config.video.bitrate.replace('k', ''))
                        : null,
                    frame_rate: task.config?.video?.frameRate,
                    use_hardware_acceleration: useHardwareAcceleration,
                    use_ultra_fast_speed: useUltraFastSpeed,
                    // Audio settings for video
                    audio_encoder: task.config?.audioTracks?.[0]?.encoder
                };

                if (finalOutputPath) {
                    updateTaskById(task.id, { outputPath: finalOutputPath });
                }

                console.log("Invoking convert_video_file with args:", args);
                await invoke('convert_video_file', { args });

            } catch (error) {
                console.error("Failed to start video conversion: " + JSON.stringify(error));
                updateTaskById(task.id, { status: 'error' });
            }
        }
    };

    const originalInfo = [
        {
            label: 'Format',
            value: task.format.toUpperCase()
        },
        isVideo ? {
            label: 'Resolution',
            icon: "•",
            value: task.displayResolution.toUpperCase()
        } : {
            label: 'Sample Rate',
            icon: "•",
            value: task.streams?.[0]?.bit_rate + 'bps'
        },
        {
            label: 'Size',
            icon: "•",
            value: formatFileSize(task.size)
        },
        {
            label: 'Duration',
            icon: "•",
            value: formatDuration(task.duration)
        }
    ]

    const outputInfo = [
        {
            label: 'Format',
            value: task.config?.outputFormat
        },
        isVideo ? {
            label: 'Resolution',
            icon: <FileVideo className="w-4 h-4" />,
            value: task.config?.video?.resolution
        } : {
            label: 'Sample Rate',
            icon: <FileVideo className="w-4 h-4" />,
            value: task.config?.audioTracks?.[0]?.bitrate + 'kbps'
        },
        {
            label: 'Size',
            icon: <FileVideo className="w-4 h-4" />,
            value: formatFileSize(task.size)
        },
        {
            label: 'Duration',
            icon: <FileVideo className="w-4 h-4" />,
            value: formatDuration(task.duration)
        }
    ]

    const handleFormatChange = (updates: FormatSelectorValue) => {
        const { updateTaskConfig } = useConverterStore.getState();
        // Update Config
        if (task.config) {
            const newConfig = { ...task.config };

            // Basic Format
            if (updates.outputFormat) {
                newConfig.outputFormat = updates.outputFormat;
            }

            // Video Config Updates (create if missing)
            if (updates.resolution) {
                newConfig.video!.resolution = updates.resolution
            }
            if (updates.videoEncoder) {
                newConfig.video!.encoder = updates.videoEncoder
            }
            // Update ALL Audio Tracks
            if (newConfig.audioTracks && newConfig.audioTracks.length > 0) {

                newConfig.audioTracks.forEach(track => {
                    if (updates.audioBitrate) {
                        track.bitrate = updates.audioBitrate;
                    }
                    if (updates.audioEncoder) {
                        track.encoder = updates.audioEncoder;
                    }
                });
            }
            updateTaskConfig(task.id, newConfig);
        }
    }

    return (
        <>
            <div className="bg-secondary/20 border border-border rounded-xl p-4 flex gap-4 hover:border-purple-300 transition-colors group">
                {/* Thumbnail */}
                <MediaThumbnail
                    path={task.path}
                    title={task.title}
                    isVideo={isVideo}
                />

                {/* Content */}
                <div className="flex-1 flex justify-between py-1">
                    {/* Top Row: Title and Info */}
                    <div className="flex justify-between items-start w-full">
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-foreground mb-2 truncate">{task.title}</h3>
                            <div className="flex text-sm text-muted-foreground gap-1">
                                {
                                    originalInfo.map((info, index) => (
                                        <div className="flex items-center gap-1" key={index}>
                                            {info.icon || ""}
                                            <span>{info.value}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        {/* Status / Progress Display */}
                        {task.status === 'converting' && (
                            <div className="flex items-center gap-4 min-w-[200px]">
                                <Progress value={task.progress} className="h-2 w-32" />
                                <span className="text-sm font-mono">{task.progress.toFixed(1)}%</span>
                            </div>
                        )}
                        {task.status === 'finished' && (
                            <div className="text-green-500 font-medium flex items-center gap-1">
                                <Info className="w-4 h-4" /> Completed
                            </div>
                        )}
                        {task.status === 'error' && (
                            <div className="text-red-500 font-medium">Error</div>
                        )}
                    </div>

                    {/* Bottom Row: Actions and Settings with Divider */}
                    <div className="flex items-center gap-4">

                        {/* Divider */}
                        <div className="w-px h-8 bg-border"></div>
                        {/* Conversion Settings */}
                        <div className="flex flex-col items-center gap-3 flex-1">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm flex-1">{
                                outputInfo.map((info, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <span className="text-muted-foreground text-xs">{info.label}</span>
                                        <span className="font-medium">{info.value}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2">
                                    <FormatSelector
                                        format={task.config?.outputFormat || ''}
                                        resolution={task.config?.video?.resolution}
                                        audioBitrate={task.config?.audioTracks?.[0]?.bitrate}
                                        encoder={task.config?.video?.encoder}
                                        onValueChange={handleFormatChange}
                                    />
                                    <Button variant="outline" size="icon" className="h-8 w-8 bg-background" onClick={() => setIsSettingsOpen(true)}>
                                        <Settings className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">

                            {/* <Button
                                variant={task.status === 'converting' ? "secondary" : "default"}
                                onClick={handleStart}
                                disabled={task.status === 'converting'}
                            >
                                {task.status === 'converting' ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Converting
                                    </>
                                ) : task.status === 'finished' ? (
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                ) : (
                                    "Start"
                                )}
                                {task.status === 'finished' && "Retry"}
                            </Button> */}

                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => removeTask(task.id)}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <ConversionSettingsDialog
                    task={task}
                    open={isSettingsOpen}
                    onOpenChange={setIsSettingsOpen}
                />
            </div>
        </>
    );
};
