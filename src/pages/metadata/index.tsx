import { useMemo, useState, useCallback } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Save, Upload, AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { bridge } from "@/lib/bridge";
import { MediaDetails } from "@/types/tasks";
import { AUDIO_FORMATS, VIDEO_FORMATS } from "@/data/formats";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { useTranslation } from "react-i18next";
import { useMetadataStore, type Metadata } from "./store";
import { useSettingsStore } from "@/stores/settingsStore";
import { extractFilenameFromPath } from "@/lib/utils";
import { revealItemInDir } from "@/lib/revealItemInDir";
import { getFileType } from "@/lib/file";

type MediaType = "audio" | "video" | "other";

const COMMON_FIELDS_BY_TYPE: Record<MediaType, string[]> = {
    audio: ["title", "artist", "album", "album_artist", "genre", "track", "date", "comment", "copyright"],
    video: ["title", "artist", "album", "genre", "date", "comment", "encoder", "language"],
    other: ["title", "artist", "album", "comment", "date"],
};

function detectMediaType(details: MediaDetails | null): MediaType {
    if (!details) return "other";
    const hasVideo = details.streams?.some((s) => s.codec_type === "video");
    const hasAudio = details.streams?.some((s) => s.codec_type === "audio");
    if (hasVideo) return "video";
    if (hasAudio) return "audio";
    return "other";
}

type MetadataEditorProps = {
    mediaType: MediaType;
    metadata: Metadata;
    streamTags: Record<string, string>[];
    onChange: (key: string, value: string) => void;
};

const CommonFieldsForm = ({
    fields,
    metadata,
    onChange,
    t,
}: {
    fields: string[];
    metadata: Metadata;
    onChange: MetadataEditorProps["onChange"];
    t: ReturnType<typeof useTranslation>["t"];
}) => (
    <div className="space-y-4">
        {fields.map((field) => {
            const displayField = field.replace(/_/g, " ");
            return (
                <div key={field} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={field} className="text-right capitalize">
                        {t(`field.${field}`, displayField)}
                    </Label>
                    <Input
                        id={field}
                        value={metadata[field] || ""}
                        onChange={(e) => onChange(field, e.target.value)}
                        className="col-span-3"
                        placeholder={t("enterField", { field: displayField })}
                    />
                </div>
            );
        })}
    </div>
);

const AdvancedFieldsForm = ({
    metadata,
    onChange,
    t,
}: {
    metadata: Metadata;
    onChange: MetadataEditorProps["onChange"];
    t: ReturnType<typeof useTranslation>["t"];
}) => (
    <div className="grid gap-4">
        {Object.entries(metadata).map(([key, value]) => (
            <div key={key} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={`adv-${key}`} className="text-right font-mono text-xs truncate" title={key}>
                    {key}
                </Label>
                <Input
                    id={`adv-${key}`}
                    value={value}
                    onChange={(e) => onChange(key, e.target.value)}
                    className="col-span-3"
                />
            </div>
        ))}
        <div className="border-t pt-4 mt-4">
            <p className="text-sm text-muted-foreground text-center">
                {t("advancedHint")}
            </p>
        </div>
    </div>
);

const StreamTagsPanel = ({ streamTags, t }: { streamTags: Record<string, string>[]; t: ReturnType<typeof useTranslation>["t"]; }) => (
    <div className="space-y-4">
        {streamTags.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noStreamTags")}</p>
        )}
        {streamTags.map((tags, idx) => (
            <div key={`stream-${idx}`} className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium text-foreground">{t("streamLabel", { index: idx + 1 })}</div>
                {Object.keys(tags).length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("noTags")}</p>
                )}
                {Object.entries(tags).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground w-32 truncate" title={k}>{k}</span>
                        <span className="text-sm text-foreground break-all">{v}</span>
                    </div>
                ))}
            </div>
        ))}
    </div>
);

const AccordionSection = ({
    title,
    children,
    defaultOpen = false,
    expandLabel,
    collapseLabel,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    expandLabel: string;
    collapseLabel: string;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border rounded-lg overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/60 hover:bg-muted transition text-sm font-medium"
            >
                <span>{title}</span>
                <span className="text-xs text-muted-foreground">{open ? collapseLabel : expandLabel}</span>
            </button>
            {open && <div className="p-4 space-y-3 bg-background">{children}</div>}
        </div>
    );
};

const MetadataEditorBase = ({
    mediaType,
    metadata,
    streamTags,
    onChange,
    t,
}: MetadataEditorProps & { t: ReturnType<typeof useTranslation>["t"] }) => {
    const fields = COMMON_FIELDS_BY_TYPE[mediaType];
    const showStreams = mediaType === "audio" || mediaType === "video";
    const expandLabel = t("expand");
    const collapseLabel = t("collapse");
    return (
        <div className="space-y-4">
            <AccordionSection title={t("commonSection")} defaultOpen expandLabel={expandLabel} collapseLabel={collapseLabel}>
                <CommonFieldsForm fields={fields} metadata={metadata} onChange={onChange} t={t} />
            </AccordionSection>

            <AccordionSection title={t("allSection")} expandLabel={expandLabel} collapseLabel={collapseLabel}>
                <AdvancedFieldsForm metadata={metadata} onChange={onChange} t={t} />
            </AccordionSection>

            {showStreams && (
                <AccordionSection title={t("streamSection")} expandLabel={expandLabel} collapseLabel={collapseLabel}>
                    <StreamTagsPanel streamTags={streamTags} t={t} />
                </AccordionSection>
            )}
        </div>
    );
};

const AudioMetadataEditor = (props: Omit<MetadataEditorProps, "mediaType"> & { t: ReturnType<typeof useTranslation>["t"] }) => (
    <MetadataEditorBase {...props} mediaType="audio" />
);

const VideoMetadataEditor = (props: Omit<MetadataEditorProps, "mediaType"> & { t: ReturnType<typeof useTranslation>["t"] }) => (
    <MetadataEditorBase {...props} mediaType="video" />
);

const GenericMetadataEditor = ({ mediaType, ...rest }: MetadataEditorProps & { t: ReturnType<typeof useTranslation>["t"] }) => (
    <MetadataEditorBase {...rest} mediaType={mediaType} />
);

export default function MetadataEditorPage() {
    const {
        fileInfo,
        metadata,
        streamTags,
        loading,
        message,
        details,
        setFileInfo,
        setMetadata,
        setStreamTags,
        setDetails,
        setLoading,
        setMessage,
        setMetadataField,
        applyLoadedFile,
    } = useMetadataStore();
    const mediaType = useMemo(() => detectMediaType(details), [details]);
    const { t } = useTranslation("metadata");

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: "Media Files",
                    extensions: Array.from([...AUDIO_FORMATS, ...VIDEO_FORMATS].map(format => format.toLowerCase()))
                }],
            });

            if (selected && typeof selected === "string") {
                setLoading(true);
                setMessage(null);
                try {
                    // Get file info and initial metadata
                    const details = await bridge.getMediaDetails(selected);
                    applyLoadedFile(selected, details);
                } catch (e: any) {
                    setMessage({ type: "error", text: t("loadError", { error: String(e) }) });
                } finally {
                    setLoading(false);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    // 打开文件夹
    const handleOpenFolder = useCallback(async (outputPath?: string) => {
        if (!outputPath) return;
        try {
            await revealItemInDir(outputPath);
        } catch (e) {
            console.error("Failed to open folder:", e);
        }
    }, []);

    const handleMetadataChange = (key: string, value: string) => {
        setMetadataField(key, value);
    };

    const resetEditorState = useCallback(() => {
        setFileInfo(null);
        setMetadata({});
        setStreamTags([]);
        setDetails(null);
    }, [setDetails, setFileInfo, setMetadata, setStreamTags]);

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
                outputPath = saved
            } else {
                const outputDir = useSettingsStore.getState().getOutputDir(fileInfo.path);

                outputPath = `${outputDir}/${extractFilenameFromPath(fileInfo.path)}.${fileInfo.format}`
            }

            const args = {
                input_path: fileInfo.path,
                output_path: outputPath,
                metadata,
            };
            await invoke("write_media_metadata", { args });

            setMessage({
                type: "success",
                text: t("saveSuccess", { path: outputPath }),
                outputPath
            });
            resetEditorState();
        } catch (e: any) {
            console.error(e);
            setMessage({ type: "error", text: t("saveError", { error: String(e) }) });
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="container mx-auto p-6 max-w-5xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <FileText className="w-8 h-8 text-primary" />
                    {t("title")}
                </h1>
                <p className="text-muted-foreground mt-2">
                    {t("subtitle")}
                </p>
            </div>

            {!fileInfo ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{t("fileSource")}</CardTitle>
                        <CardDescription />
                    </CardHeader>
                    <CardContent>
                        <div className="text-center py-8 space-y-4">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                                <Upload className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground">{t("noFile")}</p>
                            <Button onClick={handleSelectFile}>{t("selectFile")}</Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Metadata Tags</CardTitle>
                            <CardDescription>{t("metadataDesc")}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 bg-muted rounded-lg">
                                <p className="font-medium text-sm text-foreground line-clamp-2 break-all">{fileInfo.path}</p>
                                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                    <span>{(fileInfo.size / 1024 / 1024).toFixed(2)} MB</span>
                                    <span className="uppercase">{fileInfo.format}</span>
                                </div>
                            </div>
                            {mediaType === "video" && fileInfo.path && (
                                <MediaThumbnail
                                    path={fileInfo.path}
                                    fileType={getFileType(fileInfo.format)}
                                    title={t("videoPreview")}
                                    className="w-full h-48"
                                />
                            )}
                            {mediaType === "audio" && (
                                <AudioMetadataEditor
                                    metadata={metadata}
                                    streamTags={streamTags}
                                    onChange={handleMetadataChange}
                                    t={t}
                                />
                            )}
                            {mediaType === "video" && (
                                <VideoMetadataEditor
                                    metadata={metadata}
                                    streamTags={streamTags}
                                    onChange={handleMetadataChange}
                                    t={t}
                                />
                            )}
                            {mediaType === "other" && (
                                <GenericMetadataEditor
                                    mediaType={mediaType}
                                    metadata={metadata}
                                    streamTags={streamTags}
                                    onChange={handleMetadataChange}
                                    t={t}
                                />
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t("actions")}</CardTitle>
                            <CardDescription />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button variant="outline" className="w-full" onClick={handleSelectFile} disabled={loading}>
                                {t("changeFile")}
                            </Button>
                            <Button className="w-full" onClick={() => handleSave(false)} disabled={loading}>
                                <Save className="w-4 h-4 mr-2" />
                                {t("saveAsCopy")}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {message && (
                <Alert
                    variant={message.type === "error" ? "destructive" : "default"}
                    className={`mt-6 ${message.type === "success" ? "border-green-500 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400" : ""}`}
                >
                    {message.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    <AlertTitle>{message.type === "error" ? t("error") : t("success")}</AlertTitle>
                    <AlertDescription>
                        {message.text}
                        {message.outputPath && (
                            <Button
                                variant="outline"
                                className="ml-2"
                                onClick={() => handleOpenFolder(message.outputPath)}
                            >
                                {t("openFolder")}
                            </Button>
                        )}
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
