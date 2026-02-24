import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir as revealItemInDirPlugin } from "@tauri-apps/plugin-opener";

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
    await invoke("plugin:opener|reveal_item_in_dir", { paths: [path] });
  }
}

