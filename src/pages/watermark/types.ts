export type WatermarkEditorConfig = {
  type: "text" | "image";
  text: string;
  fontFamily: string;
  fontPath: string;
  opacity: number;
  size: number;
  rotation: number;
  position: string;
  offsetX: number;
  offsetY: number;
  offsetUnit: "px";
  imagePath: string;
};

export const defaultWatermarkConfig: WatermarkEditorConfig = {
  type: "text",
  text: "Watermark",
  fontFamily: "Watermark Noto Sans SC",
  fontPath: "",
  opacity: 50,
  size: 24,
  rotation: 0,
  position: "c",
  offsetX: 0,
  offsetY: 0,
  offsetUnit: "px",
  imagePath: "",
};

export const positionMap: Record<string, { x: string; y: string }> = {
  tl: { x: "10", y: "10" },
  tm: { x: "(W-w)/2", y: "10" },
  tr: { x: "W-w-10", y: "10" },
  ml: { x: "10", y: "(H-h)/2" },
  c: { x: "(W-w)/2", y: "(H-h)/2" },
  mr: { x: "W-w-10", y: "(H-h)/2" },
  bl: { x: "10", y: "H-h-10" },
  bm: { x: "(W-w)/2", y: "H-h-10" },
  br: { x: "W-w-10", y: "H-h-10" },
};

export const positionOptions = ["tl", "tm", "tr", "ml", "c", "mr", "bl", "bm", "br"];
