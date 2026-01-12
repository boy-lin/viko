import React, { useEffect, useRef } from "react";
import {
    FileVideo,
    FileAudio,
    Scissors,
    Crop,
    Settings,
    Type,
    AudioLines,
    Trash2,
    ExternalLink,
    Info,
    ChevronDown,
    Loader2,
    Play,
    Pause,
    RotateCcw
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConverterTask } from "@/types/converter";

import { useConverterStore } from "@/stores/converterStore";
import { ConversionSettingsDialog } from "./ConversionSettingsDialog";
import { FormatSelector } from "@/components/biz-form/FormatSelector";
import { isAudioFormat } from "@/data/formats";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Progress } from "@/components/ui/progress";

interface ConverterItemProps {
    task: ConverterTask;
}

export const ConverterItem: React.FC<ConverterItemProps> = ({ task }) => {
    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
    const { removeTask, updateTaskById, outputPath } = useConverterStore();
    const isVideo = task.streams.some(s => s.codec_type === "video");

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
        console.log("isAudioTarget", outputFormat);
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
                const args: any = {
                    input_path: task.path,
                    output_path: finalOutputPath,
                    format: outputFormat,
                    bitrate: task.config?.audioTracks?.[0]?.bitrate ? parseInt(task.config.audioTracks[0].bitrate) : 192,
                    use_hardware_acceleration: useHardwareAcceleration,
                    use_ultra_fast_speed: useUltraFastSpeed
                }
                const sampleRate = task.config?.audioTracks?.[0]?.sampleRate;
                if (sampleRate && sampleRate === 'original') {
                    args.sample_rate = 0
                } else {
                    args.sample_rate = parseInt(sampleRate || '0');
                }
                if (finalOutputPath) {
                    updateTaskById(task.id, { outputPath: finalOutputPath });
                }
                await invoke('convert_audio_file', {
                    args
                });

            } catch (error) {
                console.error("Failed to start audio conversion: " + JSON.stringify(error));
                updateTaskById(task.id, { status: 'error' });
            }
        } else {
            console.log("Video conversion not yet implemented");
        }
    };

    return (
        <>
            <div className="bg-secondary/20 border border-border rounded-xl p-4 flex gap-4 hover:border-purple-300 transition-colors group">
                {/* Thumbnail */}
                <div className="w-32 h-32 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center text-white">
                        {isVideo ? <FileVideo className="w-6 h-6" /> : <FileAudio className="w-6 h-6" />}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex justify-between py-1">
                    {/* Top Row: Title and Info */}
                    <div className="flex justify-between items-start w-full">
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-foreground mb-2">{task.title}</h3>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <span className="w-4 flex justify-center">○</span>
                                    {task.format}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-4 flex justify-center">🖼️</span>
                                    {task.displaySize}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-4 flex justify-center">📁</span>
                                    {task.displayResolution || "-"}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-4 flex justify-center">⏱️</span>
                                    {task.duration.toFixed(2)}s
                                </div>
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
                    <div className="flex items-center gap-4 mt-4">

                        {/* Divider */}
                        <div className="w-px h-8 bg-border"></div>

                        {/* Conversion Settings */}
                        <div className="flex flex-col items-center gap-3 flex-1">
                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground text-xs">📹</span>
                                    <span className="font-medium">{task.displayFormat}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground text-xs">screen</span>
                                    <span className="font-medium">{task.displayResolution || "Same as source"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground text-xs">weight</span>
                                    <span className="font-medium">Estimate...</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground text-xs">time</span>
                                    <span className="font-medium">{task.duration.toFixed(2)}s</span>
                                </div>
                            </div>

                            {/* Dropdowns */}
                            <div className="flex items-center gap-2">
                                {/* Dropdowns */}
                                <div className="flex items-center gap-2">
                                    <FormatSelector
                                        format={task.config?.outputFormat || ''}
                                        resolution={task.config?.video?.resolution}
                                        rate={task.config?.audioTracks?.[0]?.bitrate}
                                        encoder={task.config?.video?.encoder}
                                        onValueChange={(updates) => {
                                            const { updateTaskConfig } = useConverterStore.getState();
                                            // Update Config
                                            if (task.config) {
                                                const newConfig = { ...task.config };

                                                // Basic Format
                                                if (updates.outputFormat) {
                                                    newConfig.outputFormat = updates.outputFormat;
                                                }

                                                // Video Config Updates (create if missing)
                                                if (updates.resolution || updates.videoEncoder) {
                                                    newConfig.video = {
                                                        ...(newConfig.video || {
                                                            encoder: 'h264',
                                                            resolution: 'original',
                                                            frameRate: 'original',
                                                            bitrate: 'auto'
                                                        }),
                                                        ...(updates.resolution ? { resolution: updates.resolution } : {}),
                                                        ...(updates.videoEncoder ? { encoder: updates.videoEncoder } : {}),
                                                    };
                                                }

                                                // Update ALL Audio Tracks
                                                if (newConfig.audioTracks && newConfig.audioTracks.length > 0) {

                                                    newConfig.audioTracks = newConfig.audioTracks.map(track => ({
                                                        ...track,
                                                        ...(updates.audioBitrate ? { bitrate: updates.audioBitrate } : {}),
                                                        ...(updates.audioEncoder ? { encoder: updates.audioEncoder } : {}),
                                                    }));
                                                }
                                                console.log(`newConfig: ${JSON.stringify(newConfig.audioTracks)}`);

                                                updateTaskConfig(task.id, newConfig);
                                            }
                                        }}
                                    />
                                    {/* Settings btn */}
                                    <Button variant="outline" size="icon" className="h-8 w-8 bg-background" onClick={() => setIsSettingsOpen(true)}>
                                        <Settings className="w-4 h-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" className="h-8 w-12 bg-background flex justify-between px-2">
                                        <Type className="w-4 h-4" />
                                        <ChevronDown className="w-3 h-3 opacity-50" />
                                    </Button>
                                    <Button variant="outline" size="icon" className="h-8 w-12 bg-background flex justify-between px-2">
                                        <AudioLines className="w-4 h-4" />
                                        <ChevronDown className="w-3 h-3 opacity-50" />
                                    </Button>

                                </div>
                            </div>
                            <div className="flex items-center gap-2">

                                <Button
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
                                </Button>

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
