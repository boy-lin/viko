// 文件相关工具函数 Cursor Write It

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`; // Cursor Write It
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`; // Cursor Write It
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`; // Cursor Write It
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`; // Cursor Write It
}
// 其他文件工具函数可在此扩展 Cursor Write It

export function getTypeByPath(path: string): string {
  const ext = path.split(".").pop();
  return ext || "";
}
