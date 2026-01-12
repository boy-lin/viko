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
export function extractFilenameFromPath(filePath: string): string {
  // Get filename with extension (handle both / and \ separators)
  const filenameWithExt = filePath.split(/[/\\]/).pop() || "";
  
  // Remove extension (last dot and following characters)
  // If no dot or starts with dot (hidden file), keep as is
  if (filenameWithExt.lastIndexOf('.') <= 0) {
      return filenameWithExt;
  }
  
  return filenameWithExt.substring(0, filenameWithExt.lastIndexOf('.'));
}
