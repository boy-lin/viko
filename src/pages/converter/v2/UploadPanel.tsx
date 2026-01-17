import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import clsx from "clsx";
import {
  UploadCloud,
  FileAudio,
  FileImage,
  FileVideo,
  CircleCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";
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

  const supportedExtensions = useMemo(
    () => new Set(SupportedFormats.map((ext) => ext.toLowerCase())),
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

  // 用于防止重复处理的 Set
  const processingPathsRef = useRef(new Set<string>());

  // 处理文件路径（来自 Tauri 后端事件）
  const handlePaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;

      // 过滤掉正在处理的路径
      const filteredPaths = paths.filter((path) => {
        if (processingPathsRef.current.has(path)) {
          return false;
        }
        processingPathsRef.current.add(path);
        return true;
      });

      if (!filteredPaths.length) return;

      const nextItems: UploadItem[] = [];

      filteredPaths.forEach((path) => {
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
          processingPathsRef.current.delete(path);
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
          processingPathsRef.current.delete(path);
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

      console.log("nextItems", nextItems);
      setUploads((prev) => [...nextItems, ...prev]);

      const queuedItems = nextItems.filter((item) => item.status === "queued");
      if (queuedItems.length > 0) {
        await processUploads(queuedItems);
      }

      // 处理完成后，从 processingPathsRef 中移除
      filteredPaths.forEach((path) => {
        processingPathsRef.current.delete(path);
      });
    },
    [existingPaths, processUploads, supportedExtensions]
  );

  // 使用 ref 存储最新的 handlePaths，避免闭包问题
  const handlePathsRef = useRef(handlePaths);
  useEffect(() => {
    handlePathsRef.current = handlePaths;
  }, [handlePaths]);

  // 监听 Tauri 文件拖拽事件（使用 Webview API）
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const webview = getCurrentWebview();
        // 使用 Tauri Webview 的文件拖拽事件监听
        unlisten = await webview.onDragDropEvent((event) => {
          const payload = event.payload;
          const type = payload.type;

          if (type === "over" || type === "enter") {
            setIsDragging(true);
          } else if (type === "drop") {
            console.log("drop event", payload);
            setIsDragging(false);
            // 在 drop 事件中，payload 包含 paths 数组
            // 使用 ref 中的最新版本，避免闭包问题
            if (
              "paths" in payload &&
              Array.isArray(payload.paths) &&
              payload.paths.length > 0
            ) {
              handlePathsRef.current(payload.paths as string[]);
            }
          } else if (type === "leave" || type === "cancel") {
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
  }, []); // 依赖项为空数组，因为使用 ref 来访问最新的 handlePaths

  const overallProgress =
    uploads.length > 0
      ? Math.round(
          uploads.reduce((sum, item) => sum + item.progress, 0) / uploads.length
        )
      : 0;

  return (
    <div>
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
    </div>
  );
}
