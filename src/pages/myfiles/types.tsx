import type { FileType } from "@/types/tasks";

export type MyFileRecord = {
  id: string;
  title: string;
  fileType: FileType;
  path: string;
  outputPath?: string;
  thumbnail?: string;
  size?: number;
  duration?: number;
  extension?: string;
  displayFormat?: string;
  displayResolution?: string;
  createdAt: number;
  taskType: string;
};

export type TabItem = {
  value: "all" | FileType;
  labelKey: string;
};