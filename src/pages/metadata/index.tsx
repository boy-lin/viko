import React, { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Save, Upload, AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Metadata {
    [key: string]: string;
}

interface FileInfo {
    path: string;
    format: string;
    size: number;
}

export default function MetadataEditorPage() {
    const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
    const [metadata, setMetadata] = useState<Metadata>({});
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: "Media Files", extensions: ["mp4", "mkv", "mp3", "m4a", "mov", "avi", "flv"] }],
            });

            if (selected && typeof selected === "string") {
                setLoading(true);
                setMessage(null);
                try {
                    // Get file info and initial metadata
                    const details: any = await invoke("get_detailed_media_info", { path: selected });
                    setFileInfo({
                        path: selected,
                        format: details.format?.format_name || "unknown",
                        size: details.format?.size ? parseInt(details.format.size) : 0,
                    });

                    // Extract existing tags
                    const tags = details.format?.tags || {};
                    setMetadata(tags);
                } catch (e: any) {
                    setMessage({ type: "error", text: `Failed to load file info: ${e}` });
                } finally {
                    setLoading(false);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleMetadataChange = (key: string, value: string) => {
        setMetadata((prev) => ({ ...prev, [key]: value }));
    };

    const handleSave = async (overwrite: boolean) => {
        if (!fileInfo) return;

        try {
            setLoading(true);
            setMessage(null);

            let outputPath = fileInfo.path;

            if (!overwrite) {
                const saved = await save({
                    defaultPath: fileInfo.path,
                    filters: [{ name: "Media File", extensions: [fileInfo.format] }],
                });
                if (!saved) {
                    setLoading(false);
                    return;
                }
                outputPath = saved;
            }

            await invoke("write_media_metadata", {
                inputPath: fileInfo.path,
                outputPath: outputPath,
                metadata: metadata,
            });

            setMessage({ type: "success", text: `Metadata saved to ${outputPath}` });
        } catch (e: any) {
            setMessage({ type: "error", text: `Failed to save metadata: ${e}` });
        } finally {
            setLoading(false);
        }
    };

    const commonFields = ["title", "artist", "album", "comment", "date", "copyright"];

    return (
        <div className="container mx-auto p-6 max-w-5xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <FileText className="w-8 h-8 text-primary" />
                    Metadata Editor
                </h1>
                <p className="text-muted-foreground mt-2">
                    View and edit metadata tags for your audio and video files without re-encoding.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: File Info & Actions */}
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>File Source</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {fileInfo ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-muted rounded-lg break-all">
                                        <p className="font-medium text-sm text-foreground">{fileInfo.path}</p>
                                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                            <span>{(fileInfo.size / 1024 / 1024).toFixed(2)} MB</span>
                                            <span className="uppercase">{fileInfo.format}</span>
                                        </div>
                                    </div>
                                    <Button variant="outline" className="w-full" onClick={handleSelectFile}>
                                        Change File
                                    </Button>
                                </div>
                            ) : (
                                <div className="text-center py-8 space-y-4">
                                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                                        <Upload className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">No file selected</p>
                                    <Button onClick={handleSelectFile}>Select Media File</Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {fileInfo && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button
                                    className="w-full"
                                    onClick={() => handleSave(false)}
                                    disabled={loading}
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    Save As Copy
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="w-full"
                                    onClick={() => handleSave(true)}
                                    disabled={loading}
                                >
                                    Overwrite Original
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {message && (
                        <Alert variant={message.type === "error" ? "destructive" : "default"} className={message.type === "success" ? "border-green-500 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400" : ""}>
                            {message.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                            <AlertTitle>{message.type === "error" ? "Error" : "Success"}</AlertTitle>
                            <AlertDescription>{message.text}</AlertDescription>
                        </Alert>
                    )}
                </div>

                {/* Right Column: Metadata Form */}
                <div className="lg:col-span-2">
                    {fileInfo ? (
                        <Card className="h-full">
                            <CardHeader>
                                <CardTitle>Metadata Tags</CardTitle>
                                <CardDescription>Edit standard tags. Leaving a field empty may remove the tag.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="common">
                                    <TabsList className="mb-4">
                                        <TabsTrigger value="common">Common</TabsTrigger>
                                        <TabsTrigger value="advanced">All Tags</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="common" className="space-y-4">
                                        {commonFields.map((field) => (
                                            <div key={field} className="grid grid-cols-4 items-center gap-4">
                                                <Label htmlFor={field} className="text-right capitalize">
                                                    {field}
                                                </Label>
                                                <Input
                                                    id={field}
                                                    value={metadata[field] || ""}
                                                    onChange={(e) => handleMetadataChange(field, e.target.value)}
                                                    className="col-span-3"
                                                    placeholder={`Enter ${field}...`}
                                                />
                                            </div>
                                        ))}
                                    </TabsContent>

                                    <TabsContent value="advanced" className="space-y-4">
                                        <div className="grid gap-4">
                                            {Object.entries(metadata).map(([key, value]) => (
                                                <div key={key} className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor={`adv-${key}`} className="text-right font-mono text-xs truncate" title={key}>
                                                        {key}
                                                    </Label>
                                                    <Input
                                                        id={`adv-${key}`}
                                                        value={value}
                                                        onChange={(e) => handleMetadataChange(key, e.target.value)}
                                                        className="col-span-3"
                                                    />
                                                </div>
                                            ))}
                                            <div className="border-t pt-4 mt-4">
                                                <p className="text-sm text-muted-foreground text-center">
                                                    Add new custom tags by typing keys in "Common" tab or backend will need dynamic key support (current UI simplified).
                                                </p>
                                            </div>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="h-full flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50 p-12">
                            <div className="text-center text-muted-foreground">
                                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <h3 className="text-lg font-medium">No File Selected</h3>
                                <p>Select a file to begin editing metadata.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
