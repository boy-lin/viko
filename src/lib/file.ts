// 文件相关工具函数 
export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`; // Cursor Write It
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`; // Cursor Write It
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`; // Cursor Write It
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`; // Cursor Write It
}

/**
 * 获取文件类型
 * @param path 文件路径
 * @returns 文件类型
 */
export function getFormatByPath(path: string): string {
  const ext = path.split(".").pop();
  return ext || "";
}
