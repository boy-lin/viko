import React, { useEffect, useState } from "react";
import { FileVideo, FileAudio } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface MediaThumbnailProps {
  path: string;
  title?: string;
  isVideo?: boolean;
  className?: string; // Allow external styling overrides if needed
}

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  path,
  title = "Media",
  isVideo = false,
  className
}) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchThumbnail = async () => {
      if (!path) return;

      try {
        // Invoke backend command to generate thumbnail
        const thumb = await invoke<string | null>('generate_media_thumbnail', { path });
        if (isMounted && thumb) {
          setThumbnail(thumb);
        }
      } catch (err) {
        console.error("Failed to load thumbnail:", err);
      }
    };

    fetchThumbnail();

    return () => { isMounted = false; };
  }, [path]);

  return (
    <div className={`w-32 h-32 bg-muted/30 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative ${className || ''}`}>
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={title}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center text-white">
          {isVideo ? <FileVideo className="w-6 h-6" /> : <FileAudio className="w-6 h-6" />}
        </div>
      )}
    </div>
  );
};
