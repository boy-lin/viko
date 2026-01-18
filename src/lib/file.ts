import { stat } from "@tauri-apps/plugin-fs";
import { readDirectoryFiles } from "./bridge";

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

export async function handleDirectoryToFiles({
  paths,
  depth,
  filterCallback,
}: {
  paths: string[];
  depth: number;
  filterCallback?: (path: string) => boolean;
}) {
  // 处理文件夹：如果是文件夹，读取文件夹下的所有支持文件（只递归一层）
  let finalPaths: string[] = [];

  function addPath(path: string) {
    const isAdd = filterCallback?.(path) || true;
    if (isAdd) {
      finalPaths.push(path);
    }
  }

  for (const path of paths) {
    try {
      const pathStat = await stat(path);
      if (pathStat.isDirectory) {
        // 如果是目录，读取目录下的所有支持文件（最大递归层数为1）
        const dirFiles = await readDirectoryFiles(path, depth);

        dirFiles.forEach((file) => {
          addPath(file);
        });
      } else if (pathStat.isFile) {
        // 如果是文件，直接添加
        addPath(path);
      }
    } catch (err) {
      // 如果 stat 失败，假设是文件路径（可能是路径不存在或权限问题）
      console.warn(`Failed to stat ${path}, treating as file:`, err);
      addPath(path);
    }
  }
  return finalPaths;
}
