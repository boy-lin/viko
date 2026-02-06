import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { UploadCloud } from "lucide-react";
import { Gauge } from "@/components/ui-lab/gague-1";
import { useConverterStore } from "@/stores/converterStore";
import {
  isAudioFormat,
  isImageFormat,
  isVideoFormat,
} from "@/data/formats";
import { handleDirectoryToFiles } from "@/lib/file";
import { useDragDrop } from "@/lib/drag";
import { MediaTaskType } from "@/lib/bridge";

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

export function UploadPanel({
  supportedExtensions,
  mediaType
}: {
  supportedExtensions: string[];
  mediaType: MediaTaskType;
}) {
  const addFilesFromPaths = useConverterStore(
    (state) => state.addFilesFromPaths
  );
  const addFiles = useConverterStore((state) => state.addFiles);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const progressTimers = useRef<Map<string, number>>(new Map());

  const supportedHint = useMemo(() => {
    const preview = supportedExtensions.map((ext) =>
      ext.toUpperCase()
    );
    return `${preview.join(" / ")} 等`;
  }, []);
  console.log("supportedHint", supportedHint);
  console.log("supportedExtensions", supportedExtensions);
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
    setUploads((prev) => prev.filter((item) => item.id !== id));
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

      try {
        // 处理文件夹：如果是文件夹，读取文件夹下的所有支持文件（只递归一层）
        const finalPaths: string[] = await handleDirectoryToFiles({
          paths,
          depth: 1,
          filterCallback: (path) => {
            const extension = path.split(".").pop()?.toLowerCase();
            return !!(extension && supportedExtensions.includes(extension));
          },
        });

        if (!finalPaths.length) {
          return;
        }

        const nextItems: UploadItem[] = finalPaths.map((path) => {
          const name = path.split(/[/\\]/).pop() || path;
          const kind = getFileKind(path.split(".").pop()?.toLowerCase());
          return {
            id: crypto.randomUUID(),
            name,
            path,
            status: "queued",
            progress: 0,
            kind,
          };
        });

        if (!nextItems.length) {
          return;
        }

        setUploads((prev) => [...nextItems, ...prev]);
        const queuedItems = nextItems.filter(
          (item) => item.status === "queued"
        );
        if (queuedItems.length > 0) {
          await processUploads(queuedItems);
        }
      } catch (error) {
        console.error("Error handling paths:", error);
      }
    },
    [processUploads]
  );

  // 使用拖拽管理器注册事件监听
  // 使用固定的 key，确保即使组件重新渲染也只会更新 callback 而不会重复注册
  useEffect(() => {
    const cleanup = useDragDrop(
      "UploadPanel", // 唯一 key
      (isDragging) => {
        setIsDragging(isDragging);
      },
      (paths) => {
        handlePaths(paths);
      }
    );

    return cleanup;
  }, [handlePaths]);

  const overallProgress =
    uploads.length > 0
      ? Math.round(
        uploads.reduce((sum, item) => sum + item.progress, 0) / uploads.length
      )
      : 0;

  const completedCount = useMemo(
    () => uploads.filter((item) => item.status === "done").length,
    [uploads]
  );
  const totalCount = uploads.length;

  return (
    <div>
      {uploads.length > 0 ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <div className="flex flex-col items-center gap-2">
              <Gauge
                size="medium"
                value={overallProgress}
                showValue={true}
                colors={{
                  "0": "#e2162a",
                  "34": "#ffae00",
                  "68": "#00ac3a",
                }}
              />
              <div className="text-sm text-muted-foreground">
                上传进度 {completedCount} / {totalCount}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={clsx(
            "mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-muted-foreground/30 bg-background/60"
          )}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
            onClick={() => addFiles({
              supportedExtensions,
              mediaType
            })}
          >
            <UploadCloud className="h-7 w-7" />
          </div>
          <div className="text-base font-medium">拖拽文件或文件夹到此处</div>
          <div className="text-xs text-muted-foreground">
            支持 {supportedHint}
          </div>
        </div>
      )}
    </div>
  );
}
