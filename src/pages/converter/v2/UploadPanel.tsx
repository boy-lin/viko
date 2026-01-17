import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import clsx from "clsx";
import {
  UploadCloud,
  FolderOpen,
  FileAudio,
  FileImage,
  FileVideo,
  CircleCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useConverterStore } from "@/stores/converterStore";
import {
  SupportedFormats,
  isAudioFormat,
  isImageFormat,
  isVideoFormat,
} from "@/data/formats";
import { formatFileSize } from "@/lib/file";

type UploadStatus = "queued" | "processing" | "done" | "error";
type UploadKind = "audio" | "video" | "image" | "file";

type UploadItem = {
  id: string;
  name: string;
  path?: string;
  size?: number;
  status: UploadStatus;
  progress: number;
  error?: string;
  kind: UploadKind;
};

const getFileKind = (extension?: string): UploadKind => {
  if (!extension) return "file";
  if (isAudioFormat(extension)) return "audio";
  if (isVideoFormat(extension)) return "video";
  if (isImageFormat(extension)) return "image";
  return "file";
};

const getKindIcon = (kind: UploadKind) => {
  switch (kind) {
    case "audio":
      return FileAudio;
    case "video":
      return FileVideo;
    case "image":
      return FileImage;
    default:
      return UploadCloud;
  }
};

export function UploadPanel() {
  const { addFilesFromPaths, tasks } = useConverterStore();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const progressTimers = useRef<Map<string, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const supportedExtensions = useMemo(
    () => new Set(SupportedFormats.map((ext) => ext.toLowerCase())),
    []
  );
  const acceptAttr = useMemo(
    () => SupportedFormats.map((ext) => `.${ext}`).join(","),
    []
  );
  const supportedHint = useMemo(() => {
    const preview = SupportedFormats.slice(0, 10).map((ext) =>
      ext.toUpperCase()
    );
    return `${preview.join(" / ")} 等`;
  }, []);
  const existingPaths = useMemo(
    () => new Set(tasks.map((task) => task.path)),
    [tasks]
  );

  useEffect(() => {
    return () => {
      progressTimers.current.forEach((timer) => window.clearInterval(timer));
      progressTimers.current.clear();
    };
  }, []);

  const updateUpload = useCallback(
    (id: string, updates: Partial<UploadItem>) => {
      setUploads((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
    },
    []
  );

  const startProgress = useCallback((id: string) => {
    if (progressTimers.current.has(id)) return;
    const timer = window.setInterval(() => {
      setUploads((prev) =>
        prev.map((item) => {
          if (item.id !== id || item.status !== "processing") return item;
          const next = Math.min(item.progress + 6, 92);
          return { ...item, progress: next };
        })
      );
    }, 300);
    progressTimers.current.set(id, timer);
  }, []);

  const stopProgress = useCallback((id: string) => {
    const timer = progressTimers.current.get(id);
    if (timer) {
      window.clearInterval(timer);
      progressTimers.current.delete(id);
    }
  }, []);

  const processUploads = useCallback(
    async (items: UploadItem[]) => {
      const pathToId = new Map<string, string>();
      const paths: string[] = [];

      items.forEach((item) => {
        if (!item.path) return;
        pathToId.set(item.path, item.id);
        paths.push(item.path);
        updateUpload(item.id, { status: "processing", progress: 8 });
        startProgress(item.id);
      });

      if (!paths.length) return;

      try {
        await addFilesFromPaths(paths, (path, status, message) => {
          const id = pathToId.get(path);
          if (!id) return;
          stopProgress(id);
          updateUpload(id, {
            status: status === "success" ? "done" : "error",
            progress: 100,
            error: status === "error" ? message || "解析失败" : undefined,
          });
        });
      } catch (error: any) {
        paths.forEach((path) => {
          const id = pathToId.get(path);
          if (!id) return;
          stopProgress(id);
          updateUpload(id, {
            status: "error",
            progress: 100,
            error: error?.message || "上传失败",
          });
        });
      }
    },
    [addFilesFromPaths, startProgress, stopProgress, updateUpload]
  );

  // 处理文件路径（来自 Tauri 后端事件）
  const handlePaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      const nextItems: UploadItem[] = [];

      paths.forEach((path) => {
        const extension = path.split(".").pop()?.toLowerCase();
        const name = path.split(/[/\\]/).pop() || path;
        const kind = getFileKind(extension);

        if (!extension || !supportedExtensions.has(extension)) {
          nextItems.push({
            id: crypto.randomUUID(),
            name,
            path,
            status: "error",
            progress: 100,
            error: "不支持的文件格式",
            kind,
          });
          return;
        }

        if (existingPaths.has(path)) {
          nextItems.push({
            id: crypto.randomUUID(),
            name,
            path,
            status: "error",
            progress: 100,
            error: "文件已存在任务列表",
            kind,
          });
          return;
        }

        nextItems.push({
          id: crypto.randomUUID(),
          name,
          path,
          status: "queued",
          progress: 0,
          kind,
        });
      });

      if (!nextItems.length) return;
      setUploads((prev) => [...nextItems, ...prev]);
      await processUploads(
        nextItems.filter((item) => item.status === "queued")
      );
    },
    [existingPaths, processUploads, supportedExtensions]
  );

  // 监听 Tauri 文件拖拽事件（使用窗口 API）
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        // 使用 Tauri 窗口的文件拖拽事件监听
        // @ts-expect-error - onFileDropEvent 可能在类型定义中不存在，但运行时可用
        unlisten = await appWindow.onFileDropEvent((event) => {
          const { type, paths } = event.payload;
          if (type === "hover") {
            setIsDragging(true);
          } else if (type === "drop") {
            setIsDragging(false);
            if (paths && paths.length > 0) {
              handlePaths(paths);
            }
          } else if (type === "cancel") {
            setIsDragging(false);
          }
        });
      } catch (error) {
        console.warn("Failed to setup Tauri file drop listeners:", error);
      }
    };

    setupListeners();

    return () => {
      unlisten?.();
    };
  }, [handlePaths]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const nextItems: UploadItem[] = [];

      files.forEach((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        // 在 Tauri 环境中，File 对象可能有 path 属性
        // 或者可以通过其他方式获取路径
        const path =
          (file as File & { path?: string }).path ||
          (file as any).webkitRelativePath?.startsWith("/")
            ? (file as any).webkitRelativePath
            : undefined;
        const kind = getFileKind(extension);
        const displayName = file.webkitRelativePath || file.name;

        if (!extension || !supportedExtensions.has(extension)) {
          nextItems.push({
            id: crypto.randomUUID(),
            name: displayName,
            size: file.size,
            status: "error",
            progress: 100,
            error: "不支持的文件格式",
            kind,
          });
          return;
        }

        // 在 Tauri 中，如果没有 path，尝试从文件名推断
        // 或者提示用户使用文件选择对话框
        if (!path) {
          // 尝试从 File 对象获取路径（Tauri 可能提供）
          const tauriPath =
            (file as any).path || (file as any).webkitRelativePath;

          if (!tauriPath) {
            nextItems.push({
              id: crypto.randomUUID(),
              name: displayName,
              size: file.size,
              status: "error",
              progress: 100,
              error: "无法读取本地路径，请使用文件选择按钮",
              kind,
            });
            return;
          }
        }

        const finalPath =
          path || (file as any).path || (file as any).webkitRelativePath;

        if (existingPaths.has(finalPath)) {
          nextItems.push({
            id: crypto.randomUUID(),
            name: displayName,
            path: finalPath,
            size: file.size,
            status: "error",
            progress: 100,
            error: "文件已存在任务列表",
            kind,
          });
          return;
        }

        nextItems.push({
          id: crypto.randomUUID(),
          name: displayName,
          path: finalPath,
          size: file.size,
          status: "queued",
          progress: 0,
          kind,
        });
      });

      if (!nextItems.length) return;
      setUploads((prev) => [...nextItems, ...prev]);
      await processUploads(
        nextItems.filter((item) => item.status === "queued")
      );
    },
    [existingPaths, processUploads, supportedExtensions]
  );

  const handleSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      await handleFiles(files);
    },
    [handleFiles]
  );

  const overallProgress =
    uploads.length > 0
      ? Math.round(
          uploads.reduce((sum, item) => sum + item.progress, 0) / uploads.length
        )
      : 0;

  return (
    <Card className="border-border bg-gradient-to-br from-muted/60 via-background to-muted/40 p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="w-full md:w-auto"
          >
            选择文件
          </Button>
          <Button
            variant="outline"
            onClick={() => folderInputRef.current?.click()}
            className="w-full md:w-auto"
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            选择文件夹
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            multiple
            className="hidden"
            onChange={handleSelect}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleSelect}
            // @ts-expect-error - non-standard directory attribute for Chromium
            webkitdirectory="true"
          />
        </div>
      </div>

      <div
        className={clsx(
          "mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all",
          isDragging
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/30 bg-background/60"
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UploadCloud className="h-7 w-7" />
        </div>
        <div className="text-base font-medium">拖拽文件或文件夹到此处</div>
        <div className="text-xs text-muted-foreground">
          支持 {supportedHint}
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">上传进度</span>
              <span className="font-medium">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="mt-2 h-2" />
          </div>

          <div className="space-y-3">
            {uploads.map((item) => {
              const Icon = getKindIcon(item.kind);
              const statusLabel =
                item.status === "done"
                  ? "完成"
                  : item.status === "error"
                  ? "失败"
                  : item.status === "processing"
                  ? "解析中"
                  : "等待中";
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-background/80 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {item.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.size != null
                              ? formatFileSize(item.size)
                              : "未知大小"}
                          </div>
                        </div>
                        <div
                          className={clsx(
                            "flex items-center gap-1 text-xs",
                            item.status === "error"
                              ? "text-destructive"
                              : item.status === "done"
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                          )}
                        >
                          {item.status === "done" && (
                            <CircleCheck className="h-4 w-4" />
                          )}
                          {item.status === "error" && (
                            <AlertTriangle className="h-4 w-4" />
                          )}
                          {item.status === "processing" && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {statusLabel}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Progress
                          value={item.progress}
                          className="h-2 flex-1"
                        />
                        <div className="w-10 text-right text-xs text-muted-foreground">
                          {Math.round(item.progress)}%
                        </div>
                      </div>
                      {item.error && (
                        <div className="mt-2 text-xs text-destructive">
                          {item.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
