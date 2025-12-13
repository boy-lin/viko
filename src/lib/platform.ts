import { PlatformKey } from "@/constants/ffmpeg";

export function detectPlatform(): PlatformKey {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent;
  const isMac = ua.includes("Macintosh") || ua.includes("Mac OS X");
  const isWin = ua.includes("Windows");
  if (isMac) return "mac";
  if (isWin) return "win";
  return "linux";
}

