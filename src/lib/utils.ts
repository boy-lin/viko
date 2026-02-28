import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract filename from path, removing directory path and file extension
 * @param filePath Full file path
 * @returns Filename without extension
 */
export function extractFilenameFromPath(filePath?: string): string {
  if (!filePath) return "";
  // Get filename with extension (handle both / and \ separators)
  const filenameWithExt = filePath.split(/[/\\]/).pop() || "";

  // Remove extension (last dot and following characters)
  // If no dot or starts with dot (hidden file), keep as is
  if (filenameWithExt.lastIndexOf('.') <= 0) {
    return filenameWithExt;
  }

  return filenameWithExt.substring(0, filenameWithExt.lastIndexOf('.'));
}


export const getExtension = (path?: string) => {
  if (!path) return undefined;
  const filename = path.split(/[/\\]/).pop() || "";
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return undefined;
  return filename.slice(idx + 1).toLowerCase();
};

export const formatBitrate = (bitrate?: number, denominator = 1000) => {
  if (!bitrate) return "auto";
  return Math.round(bitrate / denominator) + 'kbps';
};


export const parseOptionalInt = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};
