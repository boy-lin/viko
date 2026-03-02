import {
  Music,
  Image as ImageIcon,
  FileVideo,
} from "lucide-react";
import { FormatEnum } from "@/types/options";
import { FormatCategory, FormatGroup } from "@/types/options";
import { FileType } from "@/types/tasks";

export const FORMAT_CATEGORIES: FormatCategory[] = [
  { id: FileType.Audio, label: "Audio", icon: Music },
  { id: FileType.Video, label: "Video", icon: FileVideo },
  { id: FileType.Image, label: "Image", icon: ImageIcon },
];

export const AUDIO_FORMAT_OPTIONS: FormatGroup[] = [
  { id: FormatEnum.MP3, label: "MP3", category: FileType.Audio },
  { id: FormatEnum.M4A, label: "M4A", category: FileType.Audio },
  { id: FormatEnum.WAV, label: "WAV", category: FileType.Audio },
  { id: FormatEnum.FLAC, label: "FLAC", category: FileType.Audio },
  { id: FormatEnum.OGG, label: "OGG", category: FileType.Audio },
  { id: FormatEnum.AAC, label: "AAC", category: FileType.Audio },
  { id: FormatEnum.AC3, label: "AC3", category: FileType.Audio },
  // { id: FormatEnum.AMR, label: "AMR", category: FileType.Audio },
  { id: FormatEnum.MP2, label: "MP2", category: FileType.Audio },
  { id: FormatEnum.M4B, label: "M4B", category: FileType.Audio },
  { id: FormatEnum.APE, label: "APE", category: FileType.Audio },
  { id: FormatEnum.CAF, label: "CAF", category: FileType.Audio },
  { id: FormatEnum.AIFF, label: "AIFF", category: FileType.Audio },
  { id: FormatEnum.M4R, label: "M4R", category: FileType.Audio },
];

export const VIDEO_FORMAT_OPTIONS: FormatGroup[] = [
  { id: FormatEnum.MP4, label: "MP4", category: FileType.Video },
  { id: FormatEnum.MOV, label: "MOV", category: FileType.Video },
  { id: FormatEnum.MKV, label: "MKV", category: FileType.Video },
  { id: FormatEnum.AVI, label: "AVI", category: FileType.Video },
  { id: FormatEnum.WMV, label: "WMV", category: FileType.Video },
  { id: FormatEnum.WEBM, label: "WebM", category: FileType.Video },
  { id: FormatEnum.FLV, label: "FLV", category: FileType.Video },
  { id: FormatEnum.GP3, label: "3GP", category: FileType.Video },
  { id: FormatEnum.MPG, label: "MPG", category: FileType.Video },
  { id: FormatEnum.VOB, label: "VOB", category: FileType.Video },
  { id: FormatEnum.OGV, label: "OGV", category: FileType.Video },
];

export const IMAGE_FORMAT_OPTIONS: FormatGroup[] = [
  { id: FormatEnum.JPG, label: "JPEG", category: FileType.Image },
  { id: FormatEnum.PNG, label: "PNG", category: FileType.Image },
  { id: FormatEnum.WEBP, label: "WEBP", category: FileType.Image },
  // { id: FormatEnum.HEIC, label: "HEIC", category: FileType.Image },
  { id: FormatEnum.GIF, label: "GIF", category: FileType.Image },
  { id: FormatEnum.TIFF, label: "TIFF", category: FileType.Image },
  { id: FormatEnum.BMP, label: "BMP", category: FileType.Image },
  { id: FormatEnum.ICO, label: "ICO", category: FileType.Image },
  // { id: FormatEnum.AVIF, label: "AVIF", category: FileType.Image },
];

export const FORMAT_OPTIONS: FormatGroup[] = [
  // Audio
  ...AUDIO_FORMAT_OPTIONS,
  // Video Generic
  ...VIDEO_FORMAT_OPTIONS,
  // Images
  ...IMAGE_FORMAT_OPTIONS,
];

export const AUDIO_SUPPORT_FORMATS = AUDIO_FORMAT_OPTIONS.map((option) => option.id);

export const VIDEO_SUPPORT_FORMATS = VIDEO_FORMAT_OPTIONS.map((option) => option.id);

export const IMAGE_SUPPORT_FORMATS = IMAGE_FORMAT_OPTIONS.map((option) => option.id);

export const SUPPORT_FORMATS = [
  ...AUDIO_SUPPORT_FORMATS,
  ...VIDEO_SUPPORT_FORMATS,
  ...IMAGE_SUPPORT_FORMATS,
];

export const supportedExtensions = new Set(
  SUPPORT_FORMATS.map((ext) => ext.toLowerCase())
);

export function isAudioFormat(extension: any): boolean {
  if (!extension) return false;
  return AUDIO_SUPPORT_FORMATS.includes(extension);
}

export function isVideoFormat(extension: any): boolean {
  if (!extension) return false;
  return VIDEO_SUPPORT_FORMATS.includes(extension);
}

export function isImageFormat(extension: any): boolean {
  if (!extension) return false;
  return IMAGE_FORMAT_OPTIONS.some((option) => option.id === extension);
}
