import { resolveResource } from "@tauri-apps/api/path";

import { bridge } from "@/lib/bridge";

export const DEFAULT_WATERMARK_FONT_NAME = "Watermark Noto Sans SC";
export const DEFAULT_WATERMARK_FONT_CSS_FAMILY = `"${DEFAULT_WATERMARK_FONT_NAME}", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
export const DEFAULT_WATERMARK_FONT_RESOURCE_PATH =
  "resources/fonts/NotoSansSC-Regular.otf";

export async function resolveDefaultWatermarkFontPath(): Promise<
  string | undefined
> {
  console.log("bridge.isTauri()", bridge.isTauri());

  if (!bridge.isTauri()) {
    return undefined;
  }

  try {
    return await resolveResource(DEFAULT_WATERMARK_FONT_RESOURCE_PATH);
  } catch (error) {
    console.warn("Failed to resolve watermark font resource:", error);
    return undefined;
  }
}
