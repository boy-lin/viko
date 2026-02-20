import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { type ReactNode, useEffect, useState } from "react";

type ThumbnailPayload = {
  thumbnailPath?: string;
  dataUrl?: string;
  width: number;
  height: number;
};

type ThumbnailImageProps = {
  imagePath?: string;
  width?: number;
  height?: number;
  fitMode?: "contain" | "cover";
  alt?: string;
  className?: string;
  fallback?: ReactNode;
};

export function ThumbnailImage({
  imagePath,
  width,
  height,
  fitMode = "contain",
  alt = "thumbnail",
  className,
  fallback = null,
}: ThumbnailImageProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const path = imagePath?.trim();
      if (!path) {
        if (active) {
          setThumbnailSrc(null);
          setFailed(false);
        }
        return;
      }

      try {
        const result = await invoke<ThumbnailPayload | null>("generate_media_thumbnail", {
          path,
          options: {
            width,
            height,
            fitMode,
          },
        });

        if (!active) return;
        if (result?.thumbnailPath) {
          setThumbnailSrc(convertFileSrc(result.thumbnailPath));
          setFailed(false);
        } else if (result?.dataUrl) {
          setThumbnailSrc(result.dataUrl);
          setFailed(false);
        } else {
          setThumbnailSrc(null);
          setFailed(true);
        }
      } catch {
        if (!active) return;
        setThumbnailSrc(null);
        setFailed(true);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [imagePath, width, height, fitMode]);

  if (!thumbnailSrc || failed) {
    return <>{fallback}</>;
  }

  return <img src={thumbnailSrc} alt={alt} className={className} draggable={false} />;
}
