import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { downloadDir } from "@tauri-apps/api/path";
import { ConverterTask, MediaDetails, ConversionConfig } from "../types/converter";
import { converterDB } from "../db/converterDB";
import { extractFilenameFromPath } from "@/lib/utils";
import { SupportedFormats } from "@/data/formats";
import { FormatEnum } from "../types/options";

interface ConverterState {
    tasks: ConverterTask[];
    isLoading: boolean;
    outputPath: string;
    activeTab: 'converting' | 'finished';
    unreadFinishedCount: number;
    formatFavorites: string[];
    formatRecents: string[];
    useHardwareAcceleration: boolean;
    useUltraFastSpeed: boolean; // For "Ultra-fast Speed"
    globalConfig: ConversionConfig;
    setActiveTab: (tab: 'converting' | 'finished') => void;
    incrementUnreadFinishedCount: () => void;
    resetUnreadFinishedCount: () => void;
    toggleFavorite: (formatId: string) => void;
    toggleHardwareAcceleration: (enabled: boolean) => void;
    toggleUltraFastSpeed: (enabled: boolean) => void;
    addToRecents: (formatId: string) => void;
    init: () => Promise<void>;
    addFiles: () => Promise<void>;
    removeTask: (id: string) => void;
    updateTaskConfig: (id: string, config: Partial<ConversionConfig>) => void;
    updateTaskById: (id: string, updates: Partial<ConverterTask>) => void;
    setOutputPath: (path: string) => void;
    updateGlobalConfig: (config: Partial<ConversionConfig>) => void;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
    tasks: [],
    isLoading: true,
    outputPath: "",
    activeTab: 'converting',
    unreadFinishedCount: 0,
    formatFavorites: [],
    formatRecents: [],
    useHardwareAcceleration: false,
    useUltraFastSpeed: false,
    globalConfig: {
        outputFormat: FormatEnum.MP4,
        outputTitle: "",
        // Video Defaults
        video: {
            encoder: 'h264',
            resolution: '1920x1080',
            frameRate: '30',
            bitrate: '1000',
        },
        // Audio Defaults
        audioTracks: [],
        // Image Defaults
        image: {
            quality: '80',
        }
    },
    init: async () => {
        try {
            const tasks = await converterDB.getAllTasks();
            const favs = await converterDB.getSetting('format_favorites');
            const recents = await converterDB.getSetting('format_recents');
            const useHardwareAcceleration = await converterDB.getSetting('use_hardware_acceleration');
            const useUltraFastSpeed = await converterDB.getSetting('use_ultra_fast_speed');

            let outputPath = await converterDB.getSetting('outputPath');
            if (!outputPath) {
                outputPath = await downloadDir();
                // Optional: save default to DB immediately or wait for explicit change?
                // Let's save it so DB is consistent
                await converterDB.saveSetting('outputPath', outputPath);
            }

            set({
                tasks,
                isLoading: false,
                outputPath,
                formatFavorites: favs || [],
                formatRecents: recents || [],
                useHardwareAcceleration: !!useHardwareAcceleration,
                useUltraFastSpeed: !!useUltraFastSpeed,
            });
        } catch (error) {
            console.error("Failed to load tasks from DB:", error);
            set({ isLoading: false });
        }
    },
    addFiles: async () => {
        try {
            const selected = await open({
                multiple: true,
                filters: [{
                    name: 'Media Files',
                    extensions: SupportedFormats
                }]
            });

            if (!selected) return;

            const paths = Array.isArray(selected) ? selected : [selected];
            const newTasks: ConverterTask[] = [];

            for (const path of paths) {
                if (!path) continue;
                try {
                    const details = await invoke<MediaDetails>("get_detailed_media_info", { path });

                    // Logic to determine primary stream info for display
                    let displayResolution = "";
                    const vidStream = details.streams.find(s => s.codec_type === "video");
                    if (vidStream && vidStream.width && vidStream.height) {
                        displayResolution = `${vidStream.width}*${vidStream.height}`;
                    }

                    const fileSizeMB = details.size / (1024 * 1024);
                    const displaySize = fileSizeMB < 1 ? `${(details.size / 1024).toFixed(0)} KB` : `${fileSizeMB.toFixed(1)} MB`;
                    const displayFormat = details.format.toUpperCase();

                    newTasks.push({
                        ...details,
                        id: crypto.randomUUID(),
                        status: "idle",
                        progress: 0,
                        title: extractFilenameFromPath(path) || "Unknown",
                        displayFormat,
                        displayResolution,
                        displaySize,
                    });

                } catch (e) {
                    console.error(`Failed to get info for ${path}:`, e);
                }
            }

            if (newTasks.length > 0) {
                // Initialize default config for new tasks
                newTasks.forEach(task => {
                    let isVideo
                    let isAudio
                    let isImage
                    let outputFormat = FormatEnum.MP4

                    if (task.streams.some(s => s.codec_type === "video")) {
                        isVideo = true;
                        outputFormat = task.displayFormat === FormatEnum.MP4.toUpperCase() ? FormatEnum.MOV : FormatEnum.MP4;
                    } else if (task.streams.some(s => s.codec_type === "audio")) {
                        isAudio = true;
                        outputFormat = task.displayFormat === FormatEnum.MP3.toUpperCase() ? FormatEnum.AAC : FormatEnum.MP3;
                    } else if (task.streams.some(s => s.codec_type === "image")) {
                        isImage = true;
                        outputFormat = task.displayFormat === FormatEnum.PNG.toUpperCase() ? FormatEnum.JPG : FormatEnum.PNG;
                    }
                    task.config = {
                        outputFormat,
                        outputTitle: task.title,
                        video: {
                            encoder: 'h264',
                            resolution: 'original',
                            frameRate: 'original',
                            bitrate: 'auto'
                        },
                        audioTracks: task.streams
                            .filter(s => s.codec_type === 'audio')
                            .map((stream, index) => ({
                                trackIndex: stream.index,
                                encoder: stream.codec_name,
                                channels: 'original',
                                sampleRate: 'original',
                                bitrate: '128'
                            }))
                    };
                });

                await converterDB.addTasks(newTasks);
                set((state) => ({ tasks: [...state.tasks, ...newTasks] }));
            }

        } catch (err) {
            console.error("Error selecting files:", err);
        }
    },
    removeTask: async (id) => {
        try {
            await converterDB.removeTask(id);
            set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
        } catch (error) {
            console.error(`Failed to remove task ${id}:`, error);
        }
    },
    updateTaskConfig: async (id, config) => {
        const tasks = get().tasks;
        const task = tasks.find(t => t.id === id);
        if (task) {
            const taskConfig = task.config as ConversionConfig;
            const updatedTask = { ...task, config: { ...taskConfig, ...config } };
            await converterDB.addTask(updatedTask); // Update DB
            set({ tasks: tasks.map(t => t.id === id ? updatedTask : t) });
        }
    },
    updateTaskById: async (id, updates) => {
        try {
            const tasks = get().tasks;
            const task = tasks.find(t => t.id === id);
            if (task) {
                const updatedTask = { ...task, ...updates };
                await converterDB.addTask(updatedTask);
                set({ tasks: tasks.map(t => t.id === id ? updatedTask : t) });
            }
        } catch (error) {
            console.error(`Failed to update task ${id} with updates:`, updates, error);
        }
    },
    setOutputPath: async (path: string) => {
        try {
            await converterDB.saveSetting('outputPath', path);
            set({ outputPath: path });
        } catch (error) {
            console.error("Failed to save output path:", error);
        }
    },
    setActiveTab: (tab) => set({ activeTab: tab }),
    incrementUnreadFinishedCount: () => set((state) => ({ unreadFinishedCount: state.unreadFinishedCount + 1 })),
    resetUnreadFinishedCount: () => set({ unreadFinishedCount: 0 }),
    toggleFavorite: async (formatId) => {
        const { formatFavorites } = get();
        const newFavs = formatFavorites.includes(formatId)
            ? formatFavorites.filter(id => id !== formatId)
            : [...formatFavorites, formatId];

        set({ formatFavorites: newFavs });
        await converterDB.saveSetting('format_favorites', newFavs);
    },
    addToRecents: async (formatId) => {
        const { formatRecents } = get();
        // Keep only last 10, remove if exists to push to top
        const newRecents = [formatId, ...formatRecents.filter(id => id !== formatId)].slice(0, 10);

        set({ formatRecents: newRecents });
        await converterDB.saveSetting('format_recents', newRecents);
    },
    toggleHardwareAcceleration: async (enabled) => {
        set({ useHardwareAcceleration: enabled });
        await converterDB.saveSetting('use_hardware_acceleration', enabled);
    },
    toggleUltraFastSpeed: async (enabled) => {
        set({ useUltraFastSpeed: enabled });
        await converterDB.saveSetting('use_ultra_fast_speed', enabled);
    },
    updateGlobalConfig: async (config: Partial<ConversionConfig>) => {
        const { globalConfig } = get();
        set({ globalConfig: { ...globalConfig, ...config } });
        await converterDB.saveSetting('globalConfig', globalConfig);
    },

}));
