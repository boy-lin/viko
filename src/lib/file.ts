import { isAudioFormat, isImageFormat, isVideoFormat } from "@/data/formats";
import { FileType } from "@/types/tasks";
import { readDir, stat } from "@tauri-apps/plugin-fs";

// 文件相关工具函数
export function formatFileSize(size?: number): string {
  if (!size) return "0 B";
  if (size === 0) return "0 B";

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
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


export async function readDirectoryFiles(
  dirPath: string,
  maxDepth: number = Infinity,
  currentDepth: number = 0,
  supportedExtensions: string[]
): Promise<string[]> {
  const filePaths: string[] = [];

  if (currentDepth >= maxDepth) {
    return filePaths;
  }

  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      const separator = dirPath.includes("\\") ? "\\" : "/";
      const entryPath = `${dirPath}${separator}${entry.name}`;
      try {
        const entryStat = await stat(entryPath);
        if (entryStat.isDirectory) {
          const subFiles = await readDirectoryFiles(
            entryPath,
            maxDepth,
            currentDepth + 1,
            supportedExtensions
          );
          filePaths.push(...subFiles);
        } else if (entryStat.isFile) {
          const extension = entryPath.split(".").pop()?.toLowerCase();
          if (extension && supportedExtensions.includes(extension)) {
            filePaths.push(entryPath);
          }
        }
      } catch (err) {
        console.warn(`Failed to read entry ${entryPath}:`, err);
      }
    }
  } catch (err) {
    console.error(`Failed to read directory ${dirPath}:`, err);
  }
  return filePaths;
}

export async function handleDirectoryToFiles({
  paths,
  depth,
  supportedExtensions,
}: {
  paths: string[];
  depth: number;
  supportedExtensions: string[];
}) {
  // 处理文件夹：如果是文件夹，读取文件夹下的所有支持文件（只递归一层）
  let finalPaths: string[] = [];

  function addPath(path: string) {
    const ext = getFormatByPath(path);
    const isAdd = supportedExtensions.includes(ext);
    if (isAdd) {
      finalPaths.push(path);
    }
  }

  for (const path of paths) {
    try {
      const pathStat = await stat(path);
      if (pathStat.isDirectory) {
        // 如果是目录，读取目录下的所有支持文件（最大递归层数为1）
        const dirFiles = await readDirectoryFiles(path, depth, 0, supportedExtensions);

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

export function getFileType(extension: string): FileType {
  if (isAudioFormat(extension)) return FileType.Audio;
  if (isVideoFormat(extension)) return FileType.Video;
  if (isImageFormat(extension)) return FileType.Image;
  throw new Error(`Unsupported file type: ${extension}`);
}