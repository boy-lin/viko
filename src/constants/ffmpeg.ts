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

export const FFMPEG_RESOURCES_DEV: Record<PlatformKey, FfmpegResource[]> = {
  mac: [
    {
      version: "8.0",
      ffmpeg: "http://localhost:9000/ffmpeg-6.1.1.zip",
      ffprobe: "http://localhost:9000/ffprobe-6.1.1.zip",
    },
    {
      version: "7.0",
      ffmpeg: "http://localhost:9000/ffmpeg-6.1.1.zip",
      ffprobe: "http://localhost:9000/ffprobe-6.1.1.zip",
    },
    {
      version: "6.1.1",
      ffmpeg: "http://localhost:9000/ffmpeg-6.1.1.zip",
      ffprobe: "http://localhost:9000/ffprobe-6.1.1.zip",
    },
  ],
  win: [
    {
      version: "8.0",
      ffmpeg:
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
      ffprobe:
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
    },
  ],
  linux: [
    {
      version: "8.0",
      ffmpeg:
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
      ffprobe:
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
    },
  ],
};
export const FFMPEG_RESOURCES: Record<PlatformKey, FfmpegResource[]> = {
  mac: [
    {
      version: "8.0",
      ffmpeg: "https://evermeet.cx/ffmpeg/ffmpeg-8.0.zip",
      ffprobe: "https://evermeet.cx/ffmpeg/ffprobe-8.0.zip",
    },
    {
      version: "7.0",
      ffmpeg: "https://evermeet.cx/ffmpeg/ffmpeg-7.0.zip",
      ffprobe: "https://evermeet.cx/ffmpeg/ffprobe-7.0.zip",
    },
    {
      version: "6.1.1",
      ffmpeg:
        "https://s3.tebi.io/tebi.2342342.xyz/static/ffmpeg/ffmpeg-6.1.1.zip",
      ffprobe:
        "https://s3.tebi.io/tebi.2342342.xyz/static/ffmpeg/ffprobe-6.1.1.zip",
    },
  ],
  win: [
    {
      version: "8.0",
      ffmpeg:
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
      ffprobe:
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
    },
    {
      version: "7.0",
      ffmpeg:
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
      ffprobe:
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
    },
    {
      version: "6.1.1",
      ffmpeg:
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
      ffprobe:
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
    },
  ],
  linux: [
    {
      version: "8.0",
      ffmpeg:
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
      ffprobe:
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
    },
    {
      version: "7.0",
      ffmpeg:
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
      ffprobe:
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
    },
    {
      version: "6.1.1",
      ffmpeg:
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
      ffprobe:
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
    },
  ],
};
