import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FileVideo, FileAudio, ImageIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ShakaPlayer } from "@/components/player/ShakaPlayer";
import { MusicPlayer } from "@/components/player/MusicPlayer";
import { ImageViewer } from "@/components/player/ImageViewer";
import { PlayIcon } from "@/components/icons/play";
import { FileType } from "@/types/converter";

interface MediaThumbnailProps {
  path: string;
  title?: string;
  className?: string;
  fileType?: FileType;
}

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  path,
  title = "Media",
  className,
  fileType,
}) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchThumbnail = async () => {
      if (!path) return;

      try {
        // Invoke backend command to generate thumbnail
        const thumb = await invoke<string | null>("generate_media_thumbnail", {
          path,
        });
        if (isMounted && thumb) {
          setThumbnail(thumb);
        }
      } catch (err) {
        console.error("Failed to load thumbnail:", err);
      }
    };

    fetchThumbnail();

    return () => {
      isMounted = false;
    };
  }, [path]);

  const icon = useMemo(() => {
    if (fileType === "video") return <FileVideo className="w-6 h-6" />;
    if (fileType === "audio")
      return <FileAudio className="text-blue-500 w-6 h-6" />;
    if (fileType === "image") return <ImageIcon className="w-6 h-6" />;
    return null;
  }, [fileType]);

  const handleClick = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const renderPlayer = () => {
    if (!fileType) return null;

    switch (fileType) {
      case "video":
        return (
          <ShakaPlayer
            filePath={path}
            title={title}
            className="w-full"
            autoPlay={false}
          />
        );
      case "audio":
        return (
          <MusicPlayer
            filePath={path}
            title={title}
            className="w-full"
            autoPlay={false}
          />
        );
      case "image":
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
          "w-38 h-38 bg-muted/30 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative cursor-pointer group",
          className
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={handleClick}
      >
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
            {/* Hover 播放效果 */}
            {isHovering && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-200">
                <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <PlayIcon className="w-6 h-6 text-black" />
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
            fileType === "image" && "max-w-[95vw] h-[95vh]"
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
