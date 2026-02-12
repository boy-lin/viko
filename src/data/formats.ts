import {
  Music,
  Image as ImageIcon,
  FileVideo,
} from "lucide-react";
import { FormatEnum } from "@/types/options";
import { FormatOption, FormatCategory, FormatGroup } from "@/types/options";
import { FileType } from "@/types/tasks";

export const FORMAT_CATEGORIES: FormatCategory[] = [
  { id: FileType.Audio, label: "Audio", icon: Music },
  { id: FileType.Video, label: "Video", icon: FileVideo },
  { id: FileType.Image, label: "Images", icon: ImageIcon },
];

export const FORMAT_GROUPS: FormatGroup[] = [
  // Audio
  { id: "mp3", label: "MP3", category: FileType.Audio },
  { id: "m4a", label: "M4A", category: FileType.Audio },
  { id: "wav", label: "WAV", category: FileType.Audio },
  { id: "flac", label: "FLAC", category: FileType.Audio },
  { id: "ogg", label: "OGG", category: FileType.Audio },
  { id: "aac", label: "AAC", category: FileType.Audio },
  { id: "ac3", label: "AC3", category: FileType.Audio },
  { id: "amr", label: "AMR", category: FileType.Audio },
  { id: "mp2", label: "MP2", category: FileType.Audio },
  { id: "m4b", label: "M4B", category: FileType.Audio },
  { id: "ape", label: "APE", category: FileType.Audio },
  { id: "caf", label: "CAF", category: FileType.Audio },
  { id: "aiff", label: "AIFF", category: FileType.Audio },
  { id: "m4r", label: "M4R", category: FileType.Audio },

  // Video Generic
  { id: "mp4", label: "MP4", category: FileType.Video },
  { id: "mov", label: "MOV", category: FileType.Video },
  { id: "mkv", label: "MKV", category: FileType.Video },
  { id: "avi", label: "AVI", category: FileType.Video },
  { id: "wmv", label: "WMV", category: FileType.Video },
  { id: "webm", label: "WebM", category: FileType.Video },
  { id: "flv", label: "FLV", category: FileType.Video },
  { id: "3gp", label: "3GP", category: FileType.Video },
  { id: "mpeg1", label: "MPEG-1", category: FileType.Video },
  { id: "mpeg2", label: "MPEG-2", category: FileType.Video },
  { id: "vob", label: "VOB", category: FileType.Video },
  { id: "ogv", label: "OGV", category: FileType.Video },

  // Images
  { id: "jpeg", label: "JPEG", category: FileType.Image },
  { id: "png", label: "PNG", category: FileType.Image },
  { id: "webp", label: "WEBP", category: FileType.Image },
  { id: "heic", label: "HEIC", category: FileType.Image },
  { id: "gif", label: "GIF", category: FileType.Image },
  { id: "tiff", label: "TIFF", category: FileType.Image },
];

export const FORMAT_DATA: FormatOption[] = [
  // ================= AUDIO =================
  // Group: MP3
  {
    id: "mp3-320",
    label: "High Quality",
    category: "audio",
    groupId: "mp3",
    extension: FormatEnum.MP3,
    audioBitrate: "320k",
  },
  {
    id: "mp3-256",
    label: "Medium Quality",
    category: "audio",
    groupId: "mp3",
    extension: FormatEnum.MP3,
    audioBitrate: "256k",
  },
  {
    id: "mp3-128",
    label: "Low Quality",
    category: "audio",
    groupId: "mp3",
    extension: FormatEnum.MP3,
    audioBitrate: "128k",
  },

  // Group: M4A
  {
    id: "m4a-aac-320",
    label: "High Quality",
    category: "audio",
    groupId: "m4a",
    extension: FormatEnum.M4A,
    audioBitrate: "320k",
  },
  {
    id: "m4a-aac-256",
    label: "Medium Quality (256 kbps)",
    category: "audio",
    groupId: "m4a",
    extension: FormatEnum.M4A,
    audioBitrate: "256k",
  },
  {
    id: "m4a-aac-128",
    label: "Low Quality (128 kbps)",
    category: "audio",
    groupId: "m4a",
    extension: FormatEnum.M4A,
    audioBitrate: "128k",
  },

  // Group: WAV
  {
    id: "wav-pcm",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    groupId: "wav",
    extension: FormatEnum.WAV,
    audioBitrate: "lossless",
  },

  // Group: M4R (Ringtone)
  {
    id: "m4r-aac-256",
    label: "High Quality (256 kbps)",
    category: "audio",
    groupId: "m4r",
    extension: FormatEnum.M4R,
    audioBitrate: "256k",
  },
  {
    id: "m4r-aac-128",
    label: "Medium Quality (128 kbps)",
    category: "audio",
    groupId: "m4r",
    extension: FormatEnum.M4R,
    audioBitrate: "128k",
  },

  // Group: AIFF
  {
    id: "aiff-pcm",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    groupId: "aiff",
    extension: FormatEnum.AIFF,
    audioBitrate: "lossless",
  },

  // Group: FLAC
  {
    id: "flac-lossless",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    groupId: "flac",
    extension: FormatEnum.FLAC,
    audioBitrate: "lossless",
  },

  // Group: OGG
  {
    id: "ogg-320",
    label: "High Quality (320 kbps)",
    category: "audio",
    groupId: "ogg",
    extension: FormatEnum.OGG,
    audioBitrate: "320k",
  },
  {
    id: "ogg-256",
    label: "Medium Quality (256 kbps)",
    category: "audio",
    groupId: "ogg",
    extension: FormatEnum.OGG,
    audioBitrate: "256k",
  },
  {
    id: "ogg-128",
    label: "Low Quality (128 kbps)",
    category: "audio",
    groupId: "ogg",
    extension: FormatEnum.OGG,
    audioBitrate: "128k",
  },

  // Group: AAC
  {
    id: "aac-320",
    label: "High Quality (320 kbps)",
    category: "audio",
    groupId: "aac",
    extension: FormatEnum.AAC,
    audioBitrate: "320k",
  },
  {
    id: "aac-256",
    label: "Medium Quality (256 kbps)",
    category: "audio",
    groupId: "aac",
    extension: FormatEnum.AAC,
    audioBitrate: "256k",
  },
  {
    id: "aac-128",
    label: "Low Quality (128 kbps)",
    category: "audio",
    groupId: "aac",
    extension: FormatEnum.AAC,
    audioBitrate: "128k",
  },

  // Group: AC3
  {
    id: "ac3-640",
    label: "High Quality (640 kbps)",
    category: "audio",
    groupId: "ac3",
    extension: FormatEnum.AC3,
    audioBitrate: "640k",
  },
  {
    id: "ac3-448",
    label: "Medium Quality (448 kbps)",
    category: "audio",
    groupId: "ac3",
    extension: FormatEnum.AC3,
    audioBitrate: "448k",
  },
  {
    id: "ac3-192",
    label: "Low Quality (192 kbps)",
    category: "audio",
    groupId: "ac3",
    extension: FormatEnum.AC3,
    audioBitrate: "192k",
  },

  // Group: AMR
  {
    id: "amr-122",
    label: "High Quality (12.2 kbps)",
    category: "audio",
    groupId: "amr",
    extension: FormatEnum.AMR,
    audioBitrate: "12.2k",
  },
  {
    id: "amr-795",
    label: "Medium Quality (7.95 kbps)",
    category: "audio",
    groupId: "amr",
    extension: FormatEnum.AMR,
    audioBitrate: "7.95k",
  },
  {
    id: "amr-67",
    label: "Low Quality (6.7 kbps)",
    category: "audio",
    groupId: "amr",
    extension: FormatEnum.AMR,
    audioBitrate: "6.7k",
  },

  // Group: MP2
  {
    id: "mp2-256",
    label: "High Quality (256 kbps)",
    category: "audio",
    groupId: "mp2",
    extension: FormatEnum.MP2,
    audioBitrate: "256k",
  },
  {
    id: "mp2-128",
    label: "Medium Quality (128 kbps)",
    category: "audio",
    groupId: "mp2",
    extension: FormatEnum.MP2,
    audioBitrate: "128k",
  },
  {
    id: "mp2-96",
    label: "Low Quality (96 kbps)",
    category: "audio",
    groupId: "mp2",
    extension: FormatEnum.MP2,
    audioBitrate: "96k",
  },

  // Group: M4B
  {
    id: "m4b-256",
    label: "High Quality (256 kbps)",
    category: "audio",
    groupId: "m4b",
    extension: FormatEnum.M4B,
    audioBitrate: "256k",
  },
  {
    id: "m4b-128",
    label: "Medium Quality (128 kbps)",
    category: "audio",
    groupId: "m4b",
    extension: FormatEnum.M4B,
    audioBitrate: "128k",
  },
  {
    id: "m4b-96",
    label: "Low Quality (96 kbps)",
    category: "audio",
    groupId: "m4b",
    extension: FormatEnum.M4B,
    audioBitrate: "96k",
  },

  // Group: APE
  {
    id: "ape-lossless",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    groupId: "ape",
    extension: FormatEnum.APE,
    audioBitrate: "lossless",
  },

  // Group: CAF
  {
    id: "caf-lossless",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    groupId: "caf",
    extension: FormatEnum.CAF,
    audioBitrate: "lossless",
  },

  // ================= VIDEO (GENERIC) =================

  // Group: MP4
  {
    id: "mp4-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "mp4",
    extension: FormatEnum.MP4,
    videoResolution: "auto",
  },
  {
    id: "mp4-8k",
    label: "8K Video",
    category: FileType.Video,
    groupId: "mp4",
    extension: FormatEnum.MP4,
    videoResolution: "7680x4320",
  },
  {
    id: "mp4-4k",
    label: "4K Video",
    category: FileType.Video,
    groupId: "mp4",
    extension: FormatEnum.MP4,
    videoResolution: "3840x2160",
  },
  {
    id: "mp4-1080",
    label: "HD 1080P",
    category: FileType.Video,
    groupId: "mp4",
    extension: FormatEnum.MP4,
    videoResolution: "1920x1080",
  },
  {
    id: "mp4-720",
    label: "HD 720P",
    category: FileType.Video,
    groupId: "mp4",
    extension: FormatEnum.MP4,
    videoResolution: "1280x720",
  },
  {
    id: "mp4-640",
    label: "SD 640P",
    category: FileType.Video,
    groupId: "mp4",
    extension: FormatEnum.MP4,
    videoResolution: "960x640",
  },
  {
    id: "mp4-576",
    label: "SD 576P",
    category: FileType.Video,
    groupId: "mp4",
    extension: FormatEnum.MP4,
    videoResolution: "720x576",
  },

  // Group: HEVC MP4
  {
    id: "hevc-mp4-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "hevc_mp4",
    extension: FormatEnum.MP4,
    videoResolution: "auto",
  },
  {
    id: "hevc-mp4-8k",
    label: "8K Video (7680x4320)",
    category: FileType.Video,
    groupId: "hevc_mp4",
    extension: FormatEnum.MP4,
    videoResolution: "7680x4320",
  },
  {
    id: "hevc-mp4-4k",
    label: "4K Video (3840x2160)",
    category: FileType.Video,
    groupId: "hevc_mp4",
    extension: FormatEnum.MP4,
    videoResolution: "3840x2160",
  },
  {
    id: "hevc-mp4-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "hevc_mp4",
    extension: FormatEnum.MP4,
    videoResolution: "1920x1080",
  },
  {
    id: "hevc-mp4-720",
    label: "HD 720P (1280x720)",
    category: FileType.Video,
    groupId: "hevc_mp4",
    extension: FormatEnum.MP4,
    videoResolution: "1280x720",
  },

  // Group: MOV
  {
    id: "mov-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "mov",
    extension: FormatEnum.MOV,
    videoResolution: "auto",
  },
  {
    id: "mov-4k",
    label: "4K Video (3840x2160)",
    category: FileType.Video,
    groupId: "mov",
    extension: FormatEnum.MOV,
    videoResolution: "3840x2160",
  },
  {
    id: "mov-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "mov",
    extension: FormatEnum.MOV,
    videoResolution: "1920x1080",
  },
  {
    id: "mov-720",
    label: "HD 720P (1280x720)",
    category: FileType.Video,
    groupId: "mov",
    extension: FormatEnum.MOV,
    videoResolution: "1280x720",
  },

  // Group: MKV
  {
    id: "mkv-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "mkv",
    extension: FormatEnum.MKV,
    videoResolution: "auto",
  },
  {
    id: "mkv-4k",
    label: "4K Video (3840x2160)",
    category: FileType.Video,
    groupId: "mkv",
    extension: FormatEnum.MKV,
    videoResolution: "3840x2160",
  },
  {
    id: "mkv-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "mkv",
    extension: FormatEnum.MKV,
    videoResolution: "1920x1080",
  },
  {
    id: "mkv-720",
    label: "HD 720P (1280x720)",
    category: FileType.Video,
    groupId: "mkv",
    extension: FormatEnum.MKV,
    videoResolution: "1280x720",
  },

  // Group: HEVC MKV
  {
    id: "hevc-mkv-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "hevc_mkv",
    extension: FormatEnum.MKV,
    videoResolution: "auto",
  },
  {
    id: "hevc-mkv-4k",
    label: "4K Video (3840x2160)",
    category: FileType.Video,
    groupId: "hevc_mkv",
    extension: FormatEnum.MKV,
    videoResolution: "3840x2160",
  },
  {
    id: "hevc-mkv-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "hevc_mkv",
    extension: FormatEnum.MKV,
    videoResolution: "1920x1080",
  },

  // Group: AVI
  {
    id: "avi-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "avi",
    extension: FormatEnum.AVI,
    videoResolution: "auto",
  },
  {
    id: "avi-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "avi",
    extension: FormatEnum.AVI,
    videoResolution: "1920x1080",
  },
  {
    id: "avi-720",
    label: "HD 720P (1280x720)",
    category: FileType.Video,
    groupId: "avi",
    extension: FormatEnum.AVI,
    videoResolution: "1280x720",
  },
  {
    id: "avi-576",
    label: "SD 576P (720x576)",
    category: FileType.Video,
    groupId: "avi",
    extension: FormatEnum.AVI,
    videoResolution: "720x576",
  },

  // Group: WMV
  {
    id: "wmv-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "wmv",
    extension: FormatEnum.WMV,
    videoResolution: "auto",
  },
  {
    id: "wmv-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "wmv",
    extension: FormatEnum.WMV,
    videoResolution: "1920x1080",
  },
  {
    id: "wmv-720",
    label: "HD 720P (1280x720)",
    category: FileType.Video,
    groupId: "wmv",
    extension: FormatEnum.WMV,
    videoResolution: "1280x720",
  },

  // Group: WebM
  {
    id: "webm-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "webm",
    extension: FormatEnum.WEBM,
    videoResolution: "auto",
  },
  {
    id: "webm-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "webm",
    extension: FormatEnum.WEBM,
    videoResolution: "1920x1080",
  },
  {
    id: "webm-720",
    label: "HD 720P (1280x720)",
    category: FileType.Video,
    groupId: "webm",
    extension: FormatEnum.WEBM,
    videoResolution: "1280x720",
  },

  // Group: FLV
  {
    id: "flv-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "flv",
    extension: FormatEnum.FLV,
    videoResolution: "auto",
  },
  {
    id: "flv-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "flv",
    extension: FormatEnum.FLV,
    videoResolution: "1920x1080",
  },
  {
    id: "flv-720",
    label: "HD 720P (1280x720)",
    category: FileType.Video,
    groupId: "flv",
    extension: FormatEnum.FLV,
    videoResolution: "1280x720",
  },

  // Group: 3GP
  {
    id: "3gp-352",
    label: "CIF (352x288)",
    category: FileType.Video,
    groupId: "3gp",
    extension: FormatEnum.GP3,
    videoResolution: "352x288",
  },
  {
    id: "3gp-176",
    label: "QCIF (176x144)",
    category: FileType.Video,
    groupId: "3gp",
    extension: FormatEnum.GP3,
    videoResolution: "176x144",
  },

  // Group: MPEG-1
  {
    id: "mpeg1-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "mpeg1",
    extension: FormatEnum.MPG,
    videoResolution: "auto",
  },
  {
    id: "mpeg1-cif",
    label: "CIF (352x288)",
    category: FileType.Video,
    groupId: "mpeg1",
    extension: FormatEnum.MPG,
    videoResolution: "352x288",
  },

  // Group: MPEG-2
  {
    id: "mpeg2-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "mpeg2",
    extension: FormatEnum.MPG,
    videoResolution: "auto",
  },
  {
    id: "mpeg2-1080",
    label: "HD 1080P (1920x1080)",
    category: FileType.Video,
    groupId: "mpeg2",
    extension: FormatEnum.MPG,
    videoResolution: "1920x1080",
  },
  {
    id: "mpeg2-576",
    label: "SD (720x576)",
    category: FileType.Video,
    groupId: "mpeg2",
    extension: FormatEnum.MPG,
    videoResolution: "720x576",
  },

  // Group: VOB
  {
    id: "vob-dvd",
    label: "DVD Standard",
    category: FileType.Video,
    groupId: "vob",
    extension: FormatEnum.VOB,
    videoResolution: "auto",
  },

  // Group: OGV
  {
    id: "ogv-orig",
    label: "Same as source",
    category: FileType.Video,
    groupId: "ogv",
    extension: FormatEnum.OGV,
    videoResolution: "auto",
  },
  {
    id: "ogv-720",
    label: "HD 720P (1280x720)",
    category: FileType.Video,
    groupId: "ogv",
    extension: FormatEnum.OGV,
    videoResolution: "1280x720",
  },

  // ================= DEVICES =================
  // Group: Apple
  {
    id: "apple-4k",
    label: "4K Video (3840x2160)",
    category: "video_device",
    groupId: "apple",
    extension: FormatEnum.MP4,
    videoResolution: "3840x2160",
    description: "iPhone 16/15/14/13/12/11 Pro Max, Apple TV 4K, iPad Pro",
  },
  {
    id: "apple-ipad-pro",
    label: "iPad Pro (2732x2048)",
    category: "video_device",
    groupId: "apple",
    extension: FormatEnum.MP4,
    videoResolution: "2732x2048",
    description: 'iPad Pro 12.9"',
  },
  {
    id: "apple-1284",
    label: "Super Retina (2778x1284)",
    category: "video_device",
    groupId: "apple",
    extension: FormatEnum.MP4,
    videoResolution: "2778x1284",
    description: "iPhone 13/12 Pro Max",
  },
  {
    id: "apple-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_device",
    groupId: "apple",
    extension: FormatEnum.MP4,
    videoResolution: "1920x1080",
    description: "All iPhone/iPad/Apple TV models",
  },

  // Group: Samsung
  {
    id: "samsung-qhd",
    label: "QHD+ (3120x1440)",
    category: "video_device",
    groupId: "samsung",
    extension: FormatEnum.MP4,
    videoResolution: "3120x1440",
    description: "Galaxy S24/S23 Ultra",
  },
  {
    id: "samsung-1080",
    label: "FHD+ (2340x1080)",
    category: "video_device",
    groupId: "samsung",
    extension: FormatEnum.MP4,
    videoResolution: "2340x1080",
    description: "All Galaxy S Series",
  },

  // Group: Huawei
  {
    id: "huawei-1.5k",
    label: "1.5K (2720x1260)",
    category: "video_device",
    groupId: "huawei",
    extension: FormatEnum.MP4,
    videoResolution: "2720x1260",
    description: "Mate 60 Pro, P60 Pro",
  },
  {
    id: "huawei-1080",
    label: "FHD+ (2400x1080)",
    category: "video_device",
    groupId: "huawei",
    extension: FormatEnum.MP4,
    videoResolution: "2400x1080",
    description: "All Huawei Models",
  },

  // Group: Xiaomi
  {
    id: "xiaomi-2k",
    label: "2K (3200x1440)",
    category: "video_device",
    groupId: "xiaomi",
    extension: FormatEnum.MP4,
    videoResolution: "3200x1440",
    description: "Xiaomi 14 Ultra, 13 Pro",
  },
  {
    id: "xiaomi-1080",
    label: "FHD+ (2400x1080)",
    category: "video_device",
    groupId: "xiaomi",
    extension: FormatEnum.MP4,
    videoResolution: "2400x1080",
    description: "All Xiaomi Models",
  },

  // Group: Google
  {
    id: "pixel-pro",
    label: "Super Res (2992x1344)",
    category: "video_device",
    groupId: "google",
    extension: FormatEnum.MP4,
    videoResolution: "2992x1344",
    description: "Pixel 8 Pro, 7 Pro",
  },
  {
    id: "pixel-1080",
    label: "FHD+ (2400x1080)",
    category: "video_device",
    groupId: "google",
    extension: FormatEnum.MP4,
    videoResolution: "2400x1080",
    description: "All Pixel Models",
  },

  // Group: Sony
  {
    id: "sony-4k",
    label: "4K OLED (3840x1644)",
    category: "video_device",
    groupId: "sony",
    extension: FormatEnum.MP4,
    videoResolution: "3840x1644",
    description: "Xperia 1 V / 1 IV (21:9)",
  },
  {
    id: "sony-1080",
    label: "FHD+ (2520x1080)",
    category: "video_device",
    groupId: "sony",
    extension: FormatEnum.MP4,
    videoResolution: "2520x1080",
    description: "Xperia 5 Series",
  },

  // Group: Games
  {
    id: "console-4k",
    label: "4K UHD (3840x2160)",
    category: "video_device",
    groupId: "games",
    extension: FormatEnum.MP4,
    videoResolution: "3840x2160",
    description: "PS5, Xbox Series X",
  },
  {
    id: "console-1080",
    label: "Full HD (1920x1080)",
    category: "video_device",
    groupId: "games",
    extension: FormatEnum.MP4,
    videoResolution: "1920x1080",
    description: "PS4, Switch Docked",
  },
  {
    id: "console-720",
    label: "HD 720P (1280x720)",
    category: "video_device",
    groupId: "games",
    extension: FormatEnum.MP4,
    videoResolution: "1280x720",
    description: "Nintendo Switch Handheld",
  },

  // ================= EDITORS =================
  // Group: Final Cut Pro
  {
    id: "fcp-prores-422",
    label: "ProRes 422",
    category: "video_editor",
    groupId: "final_cut",
    extension: FormatEnum.MP4,
    videoResolution: "auto",
  },
  {
    id: "fcp-prores-hq",
    label: "ProRes 422 HQ",
    category: "video_editor",
    groupId: "final_cut",
    extension: FormatEnum.MP4,
    videoResolution: "auto",
  },
  {
    id: "fcp-prores-lt",
    label: "ProRes 422 LT",
    category: "video_editor",
    groupId: "final_cut",
    extension: FormatEnum.MP4,
    videoResolution: "auto",
  },
  {
    id: "fcp-prores-proxy",
    label: "ProRes 422 Proxy",
    category: "video_editor",
    groupId: "final_cut",
    extension: FormatEnum.MP4,
    videoResolution: "auto",
  },
  {
    id: "fcp-prores-4444",
    label: "ProRes 4444",
    category: "video_editor",
    groupId: "final_cut",
    extension: FormatEnum.MP4,
    videoResolution: "auto",
  },

  // Group: iMovie
  {
    id: "imovie-hd",
    label: "HD 1080p",
    category: "video_editor",
    groupId: "imovie",
    extension: FormatEnum.MP4,
    videoResolution: "1920x1080",
  },

  // Group: Avid
  {
    id: "avid-dnxhd",
    label: "DNxHD",
    category: "video_editor",
    groupId: "avid",
    extension: FormatEnum.MP4,
    videoResolution: "auto",
  },

  // ================= WEB / SOCIAL =================
  // Group: YouTube
  {
    id: "yt-4k",
    label: "4K Ultra HD",
    category: "video_social",
    groupId: "youtube",
    extension: FormatEnum.MP4,
    videoResolution: "3840x2160",
  },
  {
    id: "yt-1080",
    label: "Full HD 1080p",
    category: "video_social",
    groupId: "youtube",
    extension: FormatEnum.MP4,
    videoResolution: "1920x1080",
  },

  // Group: Facebook
  {
    id: "fb-720",
    label: "HD 720p",
    category: "video_social",
    groupId: "facebook",
    extension: FormatEnum.MP4,
    videoResolution: "1280x720",
  },

  // Group: Instagram
  {
    id: "ig-story",
    label: "Story/Reel (Vertical)",
    category: "video_social",
    groupId: "instagram",
    extension: FormatEnum.MP4,
    videoResolution: "1080x1920",
  },
  {
    id: "ig-post",
    label: "Square Post",
    category: "video_social",
    groupId: "instagram",
    extension: FormatEnum.MP4,
    videoResolution: "1080x1080",
  },

  // Group: Vimeo
  {
    id: "vimeo-1080",
    label: "HD 1080p",
    category: "video_social",
    groupId: "vimeo",
    extension: FormatEnum.MP4,
    videoResolution: "1920x1080",
  },

  // ================= IMAGES =================
  {
    id: "jpeg-orig",
    label: "auto",
    category: "image",
    groupId: "jpeg",
    extension: FormatEnum.JPG,
    imageResolution: "auto",
  },
  {
    id: "png-orig",
    label: "auto",
    category: "image",
    groupId: "png",
    extension: FormatEnum.PNG,
    imageResolution: "auto",
  },
  {
    id: "webp-orig",
    label: "auto",
    category: "image",
    groupId: "webp",
    extension: FormatEnum.WEBP,
    imageResolution: "auto",
  },
  {
    id: "heic-orig",
    label: "auto",
    category: "image",
    groupId: "heic",
    extension: FormatEnum.HEIC,
    imageResolution: "auto",
  },
  {
    id: "gif-anim",
    label: "Standard",
    category: "image",
    groupId: "gif",
    extension: FormatEnum.GIF,
    imageResolution: "auto",
  },
  {
    id: "tiff-orig",
    label: "auto",
    category: "image",
    groupId: "tiff",
    extension: FormatEnum.TIFF,
    imageResolution: "auto",
  },
];

export const AUDIO_FORMATS = [
  FormatEnum.MP3,
  FormatEnum.AAC,
  FormatEnum.M4A,
  FormatEnum.WAV,
  FormatEnum.M4R,
  FormatEnum.AIFF,
  FormatEnum.FLAC,
  FormatEnum.OGG,
  FormatEnum.AC3,
  FormatEnum.AMR,
  FormatEnum.MP2,
  FormatEnum.M4B,
  FormatEnum.APE,
  FormatEnum.CAF,
];

export const VIDEO_FORMATS = [
  FormatEnum.MP4,
  FormatEnum.MOV,
  FormatEnum.MKV,
  FormatEnum.AVI,
  FormatEnum.WMV,
  FormatEnum.WEBM,
  FormatEnum.FLV,
  FormatEnum.GP3,
  FormatEnum.MPG,
  FormatEnum.VOB,
  FormatEnum.OGV,
];

export const IMAGE_FORMATS = [
  FormatEnum.JPG,
  FormatEnum.PNG,
  FormatEnum.WEBP,
  FormatEnum.HEIC,
  FormatEnum.GIF,
  FormatEnum.TIFF,
];

export const SupportedFormats = [
  ...AUDIO_FORMATS,
  ...VIDEO_FORMATS,
  ...IMAGE_FORMATS,
];

export const supportedExtensions = new Set(
  SupportedFormats.map((ext) => ext.toLowerCase())
);

export function isAudioFormat(extension: any): boolean {
  if (!extension) return false;
  return AUDIO_FORMATS.includes(extension);
}

export function isVideoFormat(extension: any): boolean {
  if (!extension) return false;
  return VIDEO_FORMATS.includes(extension);
}

export function isImageFormat(extension: any): boolean {
  if (!extension) return false;
  return IMAGE_FORMATS.includes(extension);
}
