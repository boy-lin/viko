import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FileVideo, FileAudio, ImageIcon, Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn, getExtension } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { ShakaPlayer } from "@/components/player/ShakaPlayer";
import { MusicPlayer } from "@/components/player/MusicPlayer";
import { ImageViewer } from "@/components/player/ImageViewer";
import { PlayIcon } from "@/components/icons/play";
import { FileType } from "@/types/tasks";
import { bridge } from "@/lib/bridge";
import {
  AUDIO_SUPPORT_FORMATS,
  VIDEO_SUPPORT_FORMATS,
  IMAGE_SUPPORT_FORMATS,
} from "@/data/formats";

interface MediaThumbnailProps {
  path?: string;
  title?: string;
  className?: string;
  thumbnailPath?: string;
  disableAutoGenerate?: boolean;
  thumbnailOptions?: {
    width?: number;
    height?: number;
    fitMode?: "contain" | "cover";
  };
}

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  path,
  title = "Media",
  className,
  thumbnailPath,
  disableAutoGenerate = false,
  thumbnailOptions,
}) => {
  const resolvedThumbnailOptions = useMemo(
    () => ({
      width: thumbnailOptions?.width ?? 160,
      height: thumbnailOptions?.height ?? 90,
      fitMode: thumbnailOptions?.fitMode ?? "cover",
    }),
    [thumbnailOptions?.width, thumbnailOptions?.height, thumbnailOptions?.fitMode]
  );
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailResolution, setThumbnailResolution] = useState<
    { width: number; height: number } | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isMissing, setIsMissing] = useState(false);

  const fileType = useMemo<FileType | undefined>(() => {
    if (!path) return undefined;
    const extension = getExtension(path)?.toLowerCase();
    if (!extension) return undefined;

    if (VIDEO_SUPPORT_FORMATS.includes(extension as any)) return FileType.Video;
    if (AUDIO_SUPPORT_FORMATS.includes(extension as any)) return FileType.Audio;
    if (IMAGE_SUPPORT_FORMATS.includes(extension as any)) {
      return extension === "gif" ? FileType.Gif : FileType.Image;
    }
    return undefined;
  }, [path]);
  const isUnsupported = Boolean(path && !fileType);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchThumbnail = async () => {
      if (!path || isUnsupported) return;
      if (disableAutoGenerate && !thumbnailPath) {
        if (isMounted) {
          setIsMissing(false);
          setThumbnail(null);
          setThumbnailResolution(null);
          setIsLoading(false);
        }
        return;
      }
      if (thumbnailPath) {
        if (isMounted) {
          setIsMissing(false);
          setThumbnail(convertFileSrc(thumbnailPath));
          setThumbnailResolution(null);
          setIsLoading(false);
        }
        return;
      }
      if (isMounted) {
        setIsMissing(false);
        setIsLoading(true);
      }

      try {
        const thumb = await bridge.generateMediaThumbnail(
          path,
          resolvedThumbnailOptions,
          { signal: controller.signal }
        );
        if (isMounted) {
          if (thumb?.thumbnailPath) {
            setThumbnail(convertFileSrc(thumb.thumbnailPath));
            setThumbnailResolution({ width: thumb.width, height: thumb.height });
          } else if (thumb?.dataUrl) {
            setThumbnail(thumb.dataUrl);
            setThumbnailResolution({ width: thumb.width, height: thumb.height });
          } else {
            setThumbnail(null);
            setThumbnailResolution(null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (!isMounted) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const missing =
          errorMessage.includes("文件不存在") ||
          errorMessage.toLowerCase().includes("no such file") ||
          errorMessage.toLowerCase().includes("not found");
        if (missing) {
          setIsMissing(true);
          setThumbnail(null);
          setThumbnailResolution(null);
          setIsDialogOpen(false);
        }
        setIsLoading(false);
        console.error("Failed to load thumbnail:", err);
      }
    };

    fetchThumbnail();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [path, thumbnailPath, disableAutoGenerate, resolvedThumbnailOptions, isUnsupported]);

  const icon = useMemo(() => {
    if (fileType === FileType.Video) return <FileVideo className="w-6 h-6" />;
    if (fileType === FileType.Audio)
      return <FileAudio className="text-blue-500 w-6 h-6" />;
    if (fileType === FileType.Image || fileType === FileType.Gif) return <ImageIcon className="w-6 h-6" />;
    return null;
  }, [fileType]);

  const handleClick = useCallback(() => {
    if (isMissing || isUnsupported) return;
    React.startTransition(() => {
      setIsDialogOpen(true);
    });
  }, [isMissing, isUnsupported]);

  const renderPlayer = () => {
    if (!fileType || !path) return null;

    switch (fileType) {
      case FileType.Video:
        return (
          <ShakaPlayer
            filePath={path}
            title={title}
            className="w-full"
            autoPlay={false}
          />
        );
      case FileType.Audio:
        return (
          <MusicPlayer
            filePath={path}
            title={title}
            className="w-full"
            autoPlay={false}
          />
        );
      case FileType.Image:
      case FileType.Gif:
        return (
          <ImageViewer imagePath={path} alt={title} className="w-full h-full" />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div
        className={cn(
          "w-38 h-38 bg-muted/30 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative group",
          isMissing || isUnsupported ? "cursor-not-allowed" : "cursor-pointer",
          className
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={handleClick}
      >
        {isMissing ? (
          <div className="w-full h-full bg-muted/30 rounded-lg flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
            {icon}
            <span>文件已删除</span>
          </div>
        ) : isUnsupported ? (
          <div className="w-full h-full bg-muted/30 rounded-lg flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
            <ImageIcon className="w-6 h-6" />
            <span>格式不支持</span>
          </div>
        ) : thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt={title}
              title={
                thumbnailResolution
                  ? `${title} (${thumbnailResolution.width}x${thumbnailResolution.height})`
                  : title
              }
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
            {/* Hover 播放效果 */}
            {isHovering && (
              <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center transition-opacity duration-200">
                <div className="w-8 h-8 rounded-full bg-background/90 flex items-center justify-center shadow-lg">
                  <PlayIcon className="w-6 h-6 text-foreground" />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full bg-muted/30 rounded-lg flex items-center justify-center text-muted-foreground">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              icon
            )}
          </div>
        )}
      </div>

      {/* 播放器 Dialog */}
      {
        isDialogOpen && <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent
            className={cn(
              "bg-transparent border-0 shadow-none max-w-6xl w-[95vw] p-0",
              (fileType === FileType.Image || fileType === FileType.Gif) && "max-w-[95vw] h-[95vh]"
            )}
            showCloseButton={true}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>
                {title}
              </DialogTitle>
              <DialogDescription className="sr-only"></DialogDescription>
            </DialogHeader>
            {renderPlayer()}
          </DialogContent>
        </Dialog>
      }
      
    </>
  );
};
