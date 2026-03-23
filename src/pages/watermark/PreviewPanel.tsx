import { type PointerEvent as ReactPointerEvent, useMemo, useRef } from "react";
import { ThumbnailImage } from "@/components/image/ThumbnailImage";
import { WatermarkEditorConfig } from "./types";
import { DEFAULT_WATERMARK_FONT_CSS_FAMILY } from "./font";

type PreviewPanelProps = {
  config: WatermarkEditorConfig;
  frame?: {
    dataUrl: string;
    width: number;
    height: number;
  } | null;
  loading?: boolean;
  onOffsetChange?: (offsetX: number, offsetY: number) => void;
};

export function PreviewPanel({ config, frame, loading = false, onOffsetChange }: PreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ pointerOffsetX: number; pointerOffsetY: number } | null>(null);
  const videoWidth = frame?.width ?? 1280;
  const videoHeight = frame?.height ?? 720;
  const previewCanvasWidth = 388;
  const previewCanvasHeight = 412;
  const videoAspect = videoWidth / videoHeight;
  const canvasAspect = previewCanvasWidth / previewCanvasHeight;

  const renderedSize = useMemo(() => {
    if (videoAspect > canvasAspect) {
      const width = previewCanvasWidth;
      const height = Math.round(width / videoAspect);
      return { width, height };
    }
    const height = previewCanvasHeight;
    const width = Math.round(height * videoAspect);
    return { width, height };
  }, [videoAspect, canvasAspect]);

  const scaleFactor = renderedSize.width / videoWidth;
  const previewFontSize = Math.max(10, Math.round(config.size * scaleFactor));
  const previewImageWidth = Math.max(
    16,
    Math.round(renderedSize.width * (config.size / 100))
  );
  const previewImageHeight = previewImageWidth;
  const estimatedTextWidth = Math.max(
    8,
    Math.round((config.text?.length || 1) * previewFontSize * 0.62)
  );
  const estimatedTextHeight = Math.max(8, Math.round(previewFontSize * 1.2));
  const watermarkWidth = config.type === "text" ? estimatedTextWidth : previewImageWidth;
  const watermarkHeight = config.type === "text" ? estimatedTextHeight : previewImageHeight;
  const scaleX = renderedSize.width / videoWidth;
  const scaleY = renderedSize.height / videoHeight;

  const toPreviewPosition = useMemo(() => {
    const anchor = config.position;
    const isLeft = anchor.includes("l");
    const isRight = anchor.includes("r");
    const isTop = anchor.includes("t");
    const isBottom = anchor.includes("b");
    const isCenterX = !(isLeft || isRight);
    const isCenterY = !(isTop || isBottom);
    const offsetPreviewX = config.offsetX * scaleX;
    const offsetPreviewY = config.offsetY * scaleY;
    const x = isLeft
      ? offsetPreviewX
      : isRight
        ? renderedSize.width - watermarkWidth - offsetPreviewX
        : (renderedSize.width - watermarkWidth) / 2 + offsetPreviewX;
    const y = isTop
      ? offsetPreviewY
      : isBottom
        ? renderedSize.height - watermarkHeight - offsetPreviewY
        : (renderedSize.height - watermarkHeight) / 2 + offsetPreviewY;

    return {
      x,
      y,
      isLeft,
      isRight,
      isTop,
      isBottom,
      isCenterX,
      isCenterY,
    };
  }, [
    config.position,
    config.offsetX,
    config.offsetY,
    scaleX,
    scaleY,
    renderedSize.width,
    renderedSize.height,
    watermarkWidth,
    watermarkHeight,
  ]);

  const commitOffsetByPreviewXY = (x: number, y: number) => {
    const { isLeft, isRight, isTop, isBottom } = toPreviewPosition;
    const clampedX = Math.max(0, Math.min(x, renderedSize.width - watermarkWidth));
    const clampedY = Math.max(0, Math.min(y, renderedSize.height - watermarkHeight));

    const offsetPreviewX = isLeft
      ? clampedX
      : isRight
        ? renderedSize.width - watermarkWidth - clampedX
        : clampedX - (renderedSize.width - watermarkWidth) / 2;
    const offsetPreviewY = isTop
      ? clampedY
      : isBottom
        ? renderedSize.height - watermarkHeight - clampedY
        : clampedY - (renderedSize.height - watermarkHeight) / 2;

    const nextOffsetX = Math.round((offsetPreviewX / scaleX) * 100) / 100;
    const nextOffsetY = Math.round((offsetPreviewY / scaleY) * 100) / 100;

    onOffsetChange?.(nextOffsetX, nextOffsetY);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const currentX = toPreviewPosition.x;
    const currentY = toPreviewPosition.y;
    dragStateRef.current = {
      pointerOffsetX: event.clientX - rect.left - currentX,
      pointerOffsetY: event.clientY - rect.top - currentY,
    };

    const move = (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const nextX = e.clientX - rect.left - state.pointerOffsetX;
      const nextY = e.clientY - rect.top - state.pointerOffsetY;
      commitOffsetByPreviewXY(nextX, nextY);
    };
    const up = () => {
      dragStateRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex items-center justify-center relative overflow-hidden h-full m-auto">
      <div
        ref={containerRef}
        className="relative bg-black/20 rounded-md overflow-hidden select-none"
        style={{
          width: renderedSize.width,
          height: renderedSize.height,
        }}
      >
        {frame?.dataUrl ? (
          <img
            src={frame.dataUrl}
            alt="Video first frame"
            className="object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            {loading ? "加载预览帧中..." : "暂无预览帧"}
          </div>
        )}
        {loading ? (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
          </div>
        ) : null}
        <div
          className="absolute origin-center cursor-move select-none"
          onPointerDown={handlePointerDown}
          style={{
            top: toPreviewPosition.y,
            left: toPreviewPosition.x,
            transform: `rotate(${config.rotation}deg)`,
            opacity: config.opacity / 100,
            fontSize: config.type === "text" ? `${previewFontSize}px` : undefined,
            fontFamily: config.type === "text" ? (config.fontFamily || DEFAULT_WATERMARK_FONT_CSS_FAMILY) : undefined,
            width: config.type === "image" ? `${previewImageWidth}px` : undefined,
            height: config.type === "image" ? `${previewImageHeight}px` : undefined,
            color: "rgba(255,255,255,1)",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            textShadow: "0 2px 4px rgba(0,0,0,0.5)",
          }}
        >
          {config.type === "text" ? (
            config.text
          ) : (
            <ThumbnailImage
              imagePath={config.imagePath}
              width={previewImageWidth}
              height={previewImageHeight}
              fitMode="contain"
              alt="Watermark preview"
              className="w-full h-full object-contain rounded"
              fallback={
                <div className="bg-blue-500/50 rounded flex items-center justify-center text-[10px] text-white w-full h-full">
                  IMG
                </div>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
