export interface OutputFormatOption {
  label: string;
  value: string;
}

export const SUPPORTED_FORMATS: string[] = ["mp4", "webm", "mov", "avi"]; // 支持的视频格式 Cursor Write It

export const OUTPUT_FORMATS: OutputFormatOption[] = [
  { label: "MP4", value: "mp4" },
  { label: "WebM", value: "webm" },
  { label: "MOV", value: "mov" },
]; // 输出格式选项 Cursor Write It
