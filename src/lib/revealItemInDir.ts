import { revealItemInDir as revealItemInDirPlugin } from "@tauri-apps/plugin-opener";
import { bridge } from "@/lib/bridge";

function isMissingPathsArgError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? "");
  return (
    message.includes("reveal_item_in_dir") &&
    message.includes("missing required key paths")
  );
}

export async function revealItemInDir(path: string): Promise<void> {
  try {
    await revealItemInDirPlugin(path);
  } catch (error) {
    if (!isMissingPathsArgError(error)) {
      throw error;
    }
    await bridge.revealItemInDirFallback(path);
  }
}

