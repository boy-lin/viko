import { type ReactNode, useEffect, useState } from "react";
import { bridge, type ThumbnailOptions } from "@/lib/bridge";

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
    const controller = new AbortController();

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
        const options: ThumbnailOptions = {
          width,
          height,
          fitMode,
        };
        const src = await bridge.getMediaThumbnailSrc(path, options, {
          signal: controller.signal,
        });

        if (!active) return;
        if (src) {
          setThumbnailSrc(src);
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
      controller.abort();
    };
  }, [imagePath, width, height, fitMode]);

  if (!thumbnailSrc || failed) {
    return <>{fallback}</>;
  }

  return <img src={thumbnailSrc} alt={alt} className={className} draggable={false} />;
}
