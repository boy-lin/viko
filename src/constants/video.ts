export const isDev = import.meta.env.DEV;

export type ModuleInfo = {
  id: string;
  name: string;
  ffmpeg_path: string;
  ffprobe_path: string;
  version?: string | null;
  source: string;
  is_active: boolean;
};

export type FfmpegResource = {
  version: string;
  ffmpeg: string;
  ffprobe: string;
};

export type PlatformKey = "mac" | "win" | "linux";

