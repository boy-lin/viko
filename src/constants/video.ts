// 视频相关常量定义 Cursor Write It

export interface ResolutionOption {
  label: string;
  value: string;
}

export interface OutputFormatOption {
  label: string;
  value: string;
}

export const SUPPORTED_FORMATS: string[] = ["mp4", "webm", "mov", "avi"]; // 支持的视频格式 Cursor Write It

export const RESOLUTIONS: ResolutionOption[] = [
  { label: "1080p", value: "1920x1080" },
  { label: "720p", value: "1280x720" },
  { label: "480p", value: "854x480" },
  { label: "自定义", value: "custom" },
]; // 常用分辨率选项 Cursor Write It

export const OUTPUT_FORMATS: OutputFormatOption[] = [
  { label: "MP4", value: "mp4" },
  { label: "WebM", value: "webm" },
  { label: "MOV", value: "mov" },
]; // 输出格式选项 Cursor Write It
