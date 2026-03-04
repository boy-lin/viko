import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Loading } from "@/components/ui-lab/loading";
import {
  isAudioFormat,
  isImageFormat,
  isVideoFormat,
} from "@/data/formats";
import { useDragDrop } from "@/lib/drag";
import { bridge } from "@/lib/bridge";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type UploadStatus = "queued" | "processing" | "done" | "error";
type UploadKind = "audio" | "video" | "image" | "file";

export type UploadItem = {
  id: string;
  path?: string;
  size?: number;
  status: UploadStatus;
  progress: number;
  error?: string;
};

export const getFileKind = (extension?: string): UploadKind => {
  if (!extension) return "file";
  if (isAudioFormat(extension)) return "audio";
  if (isVideoFormat(extension)) return "video";
  if (isImageFormat(extension)) return "image";
  return "file";
};

export function UploadDrag({
  className,
  supportedExtensions,
  onUploadComplete
}: {
  className?: string;
  supportedExtensions: string[];
  onUploadComplete: (uploads: string[]) => void,
}) {
  const { t } = useTranslation("common");
  const [pending, setPending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const supportedHint = useMemo(() => {
    const preview = supportedExtensions.map((ext) =>
      ext.toUpperCase()
    );
    return `${preview.join(" / ")} 等`;
  }, [supportedExtensions]);


  // 处理文件路径（来自 Tauri 后端事件）
  const handlePaths = useCallback(
    async (paths: string[]) => {
      try {
        setPending(true);
        let finalPaths: string[] = [];
        if (paths.length) {
          finalPaths = await bridge.getDirectoryToFiles(paths, supportedExtensions) || [];
        }
        onUploadComplete(finalPaths);
      } catch (error) {
        console.error("Error handling paths:", error);
      } finally {
        setPending(false);
      }
    },
    [onUploadComplete]
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

  return (
    <div className={cn("rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground flex items-center justify-center", className, isDragging && !pending
      ? "border-primary bg-primary/10"
      : "border-muted-foreground/30 bg-background/60")}

      onClick={async () => {
        if (pending) return;
        const selected = await open({
          multiple: true,
          filters: [
            {
              name: t("upload_drag.picker_name"),
              extensions: supportedExtensions,
            },
          ]
        });
        if (!selected) return [];
        const paths = Array.isArray(selected) ? selected : [selected];
        handlePaths(paths)
      }}>
      {pending ? ( 
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <div className="flex flex-col items-center gap-2">
              <Loading />
            </div>
          </div>
      ) : (
        <div
          className={cn(
            "group cursor-pointer flex flex-col items-center justify-center gap-3 text-center transition-all",
          )}
        >
          <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary/20"
          >
            <UploadCloud className="h-7 w-7" />
          </div>
          <div className="text-base font-medium">{t("upload_drag.title")}</div>
          <div className="text-xs text-muted-foreground">
            {t("upload_drag.support_hint", { hint: supportedHint })}
          </div>
        </div>
      )}
    </div>
  );
}
