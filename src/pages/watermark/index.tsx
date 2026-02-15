import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { open } from "@tauri-apps/plugin-dialog";
import { getMediaTaskQueue, WatermarkConfig } from "@/lib/bridge";
import { handleDirectoryToFiles } from "@/lib/file";
import { useDragDrop } from "@/lib/drag";
import { SupportedFormats } from "@/data/formats";
import { toast } from "sonner";
import {
    Type,
    Image as ImageIcon,
    Upload,
    Download,
    Settings2,
    LayoutTemplate,
    FileVideo,
    X
} from "lucide-react";
import { MediaTaskType } from "@/types/tasks";

export default function WatermarkPage() {
    const [config, setConfig] = useState({
        type: "text", // text | image
        text: "Watermark",
        opacity: 50,
        size: 24,
        rotation: 0,
        position: "c", // tl, tr, c, bl, br, etc.
        imagePath: "",
    });

    const [files, setFiles] = useState<string[]>([]);

    // Position mapping to x, y expressions (ffmpeg style)
    const positionMap: Record<string, { x: string; y: string }> = {
        tl: { x: "10", y: "10" },
        tm: { x: "(W-w)/2", y: "10" },
        tr: { x: "W-w-10", y: "10" },
        ml: { x: "10", y: "(H-h)/2" },
        c: { x: "(W-w)/2", y: "(H-h)/2" },
        mr: { x: "W-w-10", y: "(H-h)/2" },
        bl: { x: "10", y: "H-h-10" },
        bm: { x: "(W-w)/2", y: "H-h-10" },
        br: { x: "W-w-10", y: "H-h-10" },
    };

    const handleAddFiles = async () => {
        try {
            const selected = await open({
                multiple: true,
                filters: [{
                    name: "Video Files",
                    extensions: ["mp4", "mov", "avi", "mkv", "webm"]
                }]
            });
            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                setFiles(prev => [...new Set([...prev, ...paths])]);
            }
        } catch (err) {
            console.error("Failed to select files:", err);
        }
    };

    const handleSelectWatermarkImage = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: "Images",
                    extensions: ["png", "jpg", "jpeg", "webp"]
                }]
            });
            if (selected && typeof selected === "string") {
                setConfig(prev => ({ ...prev, imagePath: selected }));
            }
        } catch (err) {
            console.error("Failed to select image:", err);
        }
    };

    // Handle Drag & Drop
    const handlePaths = async (paths: string[]) => {
        const finalPaths = await handleDirectoryToFiles({
            paths,
            depth: 1,
            supportedExtensions: SupportedFormats
        });
        setFiles(prev => [...new Set([...prev, ...finalPaths])]);
    };

    useEffect(() => {
        const cleanup = useDragDrop("WatermarkPage", () => { }, handlePaths);
        return cleanup;
    }, []);

    const handleExport = async () => {
        if (files.length === 0) {
            toast.error("Please select at least one video file.");
            return;
        }

        const { x, y } = positionMap[config.position] || positionMap.c;

        // Construct Watermark Config
        const watermarkConfig: WatermarkConfig = {};

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
                y
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
                y
            };
        }

        const tasks = files.map(file => ({
            kind: MediaTaskType.ConvertVideo,
            args: {
                task_id: crypto.randomUUID(),
                input_path: file,
                output_path: file.replace(".mp4", "_watermarked.mp4"),

                watermark: watermarkConfig,
            }
        }));

        try {
            await getMediaTaskQueue().addConvertTasks(tasks);
            toast.success(`Submitted ${tasks.length} tasks!`);
            // Optional: navigate to tasks page
        } catch (e: any) {
            console.error(e);
            toast.error("Failed to submit tasks: " + e.message);
        }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-background">
            {/* Settings Side Panel */}
            <div className="w-80 border-r bg-card p-6 overflow-y-auto hidden md:block">
                <div className="flex items-center gap-2 mb-6">
                    <Settings2 className="w-5 h-5" />
                    <h2 className="font-semibold text-lg">Configuration</h2>
                </div>

                <Tabs value={config.type} className="w-full" onValueChange={(v) => setConfig({ ...config, type: v })}>
                    <TabsList className="w-full grid grid-cols-2 mb-6">
                        <TabsTrigger value="text" className="flex gap-2">
                            <Type className="w-4 h-4" /> Text
                        </TabsTrigger>
                        <TabsTrigger value="image" className="flex gap-2">
                            <ImageIcon className="w-4 h-4" /> Image
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="text" className="space-y-6">
                        <div className="space-y-2">
                            <Label>Content</Label>
                            <Input
                                value={config.text}
                                onChange={(e) => setConfig({ ...config, text: e.target.value })}
                                placeholder="Enter watermark text"
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between">
                                <Label>Font Size ({config.size}px)</Label>
                            </div>
                            <Slider
                                value={[config.size]}
                                min={10} max={200}
                                step={1}
                                onValueChange={(v) => setConfig({ ...config, size: v[0] })}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="image" className="space-y-6">
                        <div
                            onClick={handleSelectWatermarkImage}
                            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer relative overflow-hidden"
                        >
                            {config.imagePath ? (
                                <div className="relative z-10">
                                    <p className="text-xs truncate max-w-full px-2">{config.imagePath}</p>
                                    <Button variant="ghost" size="sm" className="mt-2 h-6">Change</Button>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">Click to upload image</p>
                                </>
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between">
                                <Label>Scale ({config.size}%)</Label>
                            </div>
                            <Slider
                                value={[config.size]}
                                min={10} max={200}
                                step={1}
                                onValueChange={(v) => setConfig({ ...config, size: v[0] })}
                            />
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="mt-8 space-y-6 border-t pt-6">
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label>Opacity ({config.opacity}%)</Label>
                        </div>
                        <Slider
                            value={[config.opacity]}
                            max={100}
                            step={1}
                            onValueChange={(v) => setConfig({ ...config, opacity: v[0] })}
                        />
                    </div>

                    {/* Rotation is visual only for now as backend support is pending */}
                    <div className="space-y-4 opacity-50 cursor-not-allowed" title="Not supported in backend yet">
                        <div className="flex justify-between">
                            <Label>Rotation ({config.rotation}°)</Label>
                        </div>
                        <Slider
                            disabled
                            value={[config.rotation]}
                            min={-180}
                            max={180}
                            step={5}
                            onValueChange={(v) => setConfig({ ...config, rotation: v[0] })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Position</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {["tl", "tm", "tr", "ml", "c", "mr", "bl", "bm", "br"].map(pos => (
                                <Button
                                    key={pos}
                                    variant={config.position === pos ? "default" : "outline"}
                                    size="sm"
                                    className="h-8"
                                    onClick={() => setConfig({ ...config, position: pos })}
                                >
                                    <LayoutTemplate className="w-3 h-3" />
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Preview Area */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 bg-muted/30 p-8 flex flex-col gap-4 overflow-hidden relative">
                    {/* File List / Drop Zone */}
                    {files.length === 0 ? (
                        <div
                            onClick={handleAddFiles}
                            className="flex-1 border-2 border-dashed border-muted-foreground/20 rounded-xl flex flex-col items-center justify-center bg-background/50 hover:bg-background/80 transition-colors cursor-pointer"
                        >
                            <FileVideo className="w-12 h-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-medium">Drag videos here or click to select</h3>
                            <p className="text-sm text-muted-foreground mt-2">Supports MP4, MOV, MKV, etc.</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-2 p-1">
                            {files.map((file, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-card rounded-lg border shadow-sm group">
                                    <FileVideo className="w-5 h-5 text-primary" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{file}</p>
                                    </div>
                                    <Button
                                        variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => setFiles(prev => prev.filter(f => f !== file))}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="outline" className="w-full mt-4" onClick={handleAddFiles}>
                                Add more files
                            </Button>
                        </div>
                    )}

                    {/* Live Preview (Placeholder Concept) */}
                    <div className="bg-card border rounded-lg p-4 shadow-sm h-64 flex flex-col items-center justify-center relative overflow-hidden">
                        <p className="text-xs text-muted-foreground absolute top-2 left-2">Preview (Mockup)</p>
                        <div className="relative shadow-lg max-w-full max-h-full">
                            <img
                                src={config.type === 'image' && config.imagePath
                                    ? "https://placehold.co/800x450/e2e8f0/64748b?text=Local+Image+Preview" // In real app, convert local path to asset protocol if enabled
                                    : "https://placehold.co/800x450/e2e8f0/64748b?text=Video+Preview"
                                }
                                alt="Preview"
                                className="rounded-md object-contain max-h-[12rem]"
                            />
                            {/* Watermark Overlay Simulation */}
                            <div
                                className="absolute pointer-events-none origin-center"
                                style={{
                                    top: config.position.includes('t') ? '10%' : config.position.includes('b') ? '90%' : '50%',
                                    left: config.position.includes('l') ? '10%' : config.position.includes('r') ? '90%' : '50%',
                                    transform: `translate(-50%, -50%) rotate(${config.rotation}deg)`,
                                    opacity: config.opacity / 100,
                                    fontSize: config.type === 'text' ? `${config.size}px` : undefined,
                                    width: config.type === 'image' ? `${config.size}px` : undefined, // Rudimentary scale sim
                                    height: config.type === 'image' ? `${config.size}px` : undefined,
                                    color: 'rgba(255,255,255,1)',
                                    fontWeight: 'bold',
                                    whiteSpace: 'nowrap',
                                    textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                                }}
                            >
                                {config.type === 'text' ? config.text : (
                                    <div className="bg-blue-500/50 rounded flex items-center justify-center text-[10px] text-white w-full h-full">IMG</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Toolbar */}
                <div className="h-16 border-t bg-card px-8 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        {files.length} file(s) selected
                    </div>
                    <div className="flex gap-4">
                        <Button variant="outline" onClick={() => setFiles([])} disabled={files.length === 0}>
                            Clear
                        </Button>
                        <Button className="gap-2" onClick={handleExport} disabled={files.length === 0}>
                            <Download className="w-4 h-4" /> Export
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
