import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { UploadCloud } from "lucide-react";
import { Gauge } from "@/components/ui-lab/gague-1";
import {
  isAudioFormat,
  isImageFormat,
  isVideoFormat,
} from "@/data/formats";
import { useDragDrop } from "@/lib/drag";
import { MediaDetails, MediaTaskType } from "@/types/tasks";
import { bridge } from "@/lib/bridge";
import { open } from "@tauri-apps/plugin-dialog";

type UploadStatus = "queued" | "processing" | "done" | "error";
type UploadKind = "audio" | "video" | "image" | "file";

export type UploadItem = {
  id: string;
  path?: string;
  size?: number;
  status: UploadStatus;
  progress: number;
  error?: string;
  details?: MediaDetails;
};

export const getFileKind = (extension?: string): UploadKind => {
  if (!extension) return "file";
  if (isAudioFormat(extension)) return "audio";
  if (isVideoFormat(extension)) return "video";
  if (isImageFormat(extension)) return "image";
  return "file";
};

export function UploadDrag({
  supportedExtensions,
  onUploadComplete
}: {
  supportedExtensions: string[];
  mediaType: MediaTaskType;
  onUploadComplete: (uploads: UploadItem[]) => void,
}) {

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const supportedHint = useMemo(() => {
    const preview = supportedExtensions.map((ext) =>
      ext.toUpperCase()
    );
    return `${preview.join(" / ")} 等`;
  }, []);

  const updateUpload = useCallback(
    (id: string, updates: Partial<UploadItem>) => {
      setUploads((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
    },
    []
  );

  const processUploads = useCallback(
    async (items: UploadItem[]) => {
      await Promise.all(items.map(async (item) => {
        if (!item.path) return;
        updateUpload(item.id, { status: "processing" });
        try {
          const details = await bridge.getMediaDetails(item.path);
          updateUpload(item.id, {
            status: "done",
            progress: 100,
            details
          });
        } catch (error: any) {
          updateUpload(item.id, {
            status: "error",
            error: error?.message || "获取媒体信息失败",
          });
        }
      }))
    },
    [updateUpload]
  );

  // 处理文件路径（来自 Tauri 后端事件）
  const handlePaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      try {
        // 处理文件夹：如果是文件夹，读取文件夹下的所有支持文件（只递归一层）
        const finalPaths: string[] = await bridge.getDirectoryToFiles(paths, supportedExtensions);
        if (!finalPaths.length) {
          return;
        }
        const nextItems: UploadItem[] = finalPaths.map((path) => {
          return {
            id: crypto.randomUUID(),
            path,
            status: "queued",
            progress: 0,
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

  const completedCount = useMemo(
    () => {
      const finished = uploads.filter((item) => ["done", "error"].includes(item.status)).length

      if (finished === uploads.length) {
        onUploadComplete(uploads)
      }
      return finished
    },
    [uploads]
  );

  const totalCount = uploads.length;

  const overallProgress =
    uploads.length > 0
      ? Math.round((completedCount / uploads.length) * 100)
      : 0;

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
            onClick={async () => {
              const selected = await open({
                multiple: true,
                filters: [
                  {
                    name: "Media Files",
                    extensions: supportedExtensions,
                  },
                ],
              });
              if (!selected) return [];
              const paths = Array.isArray(selected) ? selected : [selected];
              handlePaths(paths)
            }}
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
