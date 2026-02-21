import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FileVideo, FileAudio, ImageIcon } from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ShakaPlayer } from "@/components/player/ShakaPlayer";
import { MusicPlayer } from "@/components/player/MusicPlayer";
import { ImageViewer } from "@/components/player/ImageViewer";
import { PlayIcon } from "@/components/icons/play";
import { FileType } from "@/types/tasks";

interface MediaThumbnailProps {
  path?: string;
  title?: string;
  className?: string;
  fileType?: FileType;
  thumbnailPath?: string;
  disableAutoGenerate?: boolean;
  thumbnailOptions?: {
    width?: number;
    height?: number;
    fitMode?: "contain" | "cover";
  };
}

type ThumbnailPayload = {
  thumbnailPath?: string;
  dataUrl?: string;
  width: number;
  height: number;
};

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  path,
  title = "Media",
  className,
  fileType,
  thumbnailPath,
  disableAutoGenerate = false,
  thumbnailOptions = {
    width: 160,
    height: 90,
    fitMode: "cover",
  },
}) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailResolution, setThumbnailResolution] = useState<
    { width: number; height: number } | null
  >(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isMissing, setIsMissing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchThumbnail = async () => {
      if (!path) return;
      if (disableAutoGenerate && !thumbnailPath) {
        if (isMounted) {
          setIsMissing(false);
          setThumbnail(null);
          setThumbnailResolution(null);
        }
        return;
      }
      if (thumbnailPath) {
        if (isMounted) {
          setIsMissing(false);
          setThumbnail(convertFileSrc(thumbnailPath));
          setThumbnailResolution(null);
        }
        return;
      }
      if (isMounted) {
        setIsMissing(false);
      }

      try {
        // Invoke backend command to generate thumbnail
        const thumb = await invoke<ThumbnailPayload | null>("generate_media_thumbnail", {
          path,
          options: thumbnailOptions,
        });
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
        console.error("Failed to load thumbnail:", err);
      }
    };

    fetchThumbnail();

    return () => {
      isMounted = false;
    };
  }, [path, thumbnailPath, disableAutoGenerate]);

  const icon = useMemo(() => {
    if (fileType === FileType.Video) return <FileVideo className="w-6 h-6" />;
    if (fileType === FileType.Audio)
      return <FileAudio className="text-blue-500 w-6 h-6" />;
    if (fileType === FileType.Image || fileType === FileType.Gif) return <ImageIcon className="w-6 h-6" />;
    return null;
  }, [fileType]);

  const handleClick = useCallback(() => {
    if (isMissing) return;
    React.startTransition(() => {
      setIsDialogOpen(true);
    });
  }, [isMissing]);

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
          isMissing ? "cursor-not-allowed" : "cursor-pointer",
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
            {icon}
          </div>
        )}
      </div>

      {/* 播放器 Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className={cn(
            "bg-transparent border-0 shadow-none max-w-6xl w-[95vw] p-0",
            (fileType === FileType.Image || fileType === FileType.Gif) && "max-w-[95vw] h-[95vh]"
          )}
          showCloseButton={true}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {renderPlayer()}
        </DialogContent>
      </Dialog>
    </>
  );
};
