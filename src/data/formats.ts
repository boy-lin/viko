import {
  Music,
  Smartphone,
  Globe,
  Image as ImageIcon,
  Layers,
  FileVideo,
} from "lucide-react";
import { FormatEnum } from "@/types/options";
import { FormatOption, FormatCategory } from "@/types/options";

export const FORMAT_CATEGORIES: FormatCategory[] = [
  { id: "audio", label: "Audio", icon: Music },
  { id: "video_generic", label: "Video", icon: FileVideo },
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "video_device", label: "Devices", icon: Smartphone },
  { id: "video_social", label: "Web/Social", icon: Globe },
  { id: "video_editor", label: "Editors", icon: Layers },
];

export const FORMAT_DATA: FormatOption[] = [
  // ================= AUDIO =================
  // Group: MP3
  {
    id: "mp3-320",
    label: "High Quality (320 kbps)",
    category: "audio",
    group: "MP3",
    extension: FormatEnum.MP3,
    quality: "320k",
    tags: ["lossy", "music"],
  },
  {
    id: "mp3-256",
    label: "Medium Quality (256 kbps)",
    category: "audio",
    group: "MP3",
    extension: FormatEnum.MP3,
    quality: "256k",
    tags: ["lossy", "music"],
  },
  {
    id: "mp3-128",
    label: "Low Quality (128 kbps)",
    category: "audio",
    group: "MP3",
    extension: FormatEnum.MP3,
    quality: "128k",
    tags: ["lossy", "speech"],
  },

  // Group: M4A
  {
    id: "m4a-aac-320",
    label: "High Quality (320 kbps)",
    category: "audio",
    group: "M4A",
    extension: FormatEnum.M4A,
    quality: "320k",
    tags: ["apple", "music", "aac"],
  },
  {
    id: "m4a-aac-256",
    label: "Medium Quality (256 kbps)",
    category: "audio",
    group: "M4A",
    extension: FormatEnum.M4A,
    quality: "256k",
    tags: ["apple", "music", "aac"],
  },
  {
    id: "m4a-aac-128",
    label: "Low Quality (128 kbps)",
    category: "audio",
    group: "M4A",
    extension: FormatEnum.M4A,
    quality: "128k",
    tags: ["apple", "speech", "aac"],
  },

  // Group: WAV
  {
    id: "wav-pcm",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    group: "WAV",
    extension: FormatEnum.WAV,
    quality: "lossless",
    tags: ["pc", "uncompressed"],
  },

  // Group: M4R (Ringtone)
  {
    id: "m4r-aac-256",
    label: "High Quality (256 kbps)",
    category: "audio",
    group: "M4R",
    extension: FormatEnum.M4R,
    quality: "256k",
    tags: ["apple", "ringtone"],
  },
  {
    id: "m4r-aac-128",
    label: "Medium Quality (128 kbps)",
    category: "audio",
    group: "M4R",
    extension: FormatEnum.M4R,
    quality: "128k",
    tags: ["apple", "ringtone"],
  },

  // Group: AIFF
  {
    id: "aiff-pcm",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    group: "AIFF",
    extension: FormatEnum.AIFF,
    quality: "lossless",
    tags: ["mac", "uncompressed"],
  },

  // Group: FLAC
  {
    id: "flac-lossless",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    group: "FLAC",
    extension: FormatEnum.FLAC,
    quality: "lossless",
    tags: ["archive"],
  },

  // Group: OGG
  {
    id: "ogg-320",
    label: "High Quality (320 kbps)",
    category: "audio",
    group: "OGG",
    extension: FormatEnum.OGG,
    quality: "320k",
    tags: ["open", "web"],
  },
  {
    id: "ogg-256",
    label: "Medium Quality (256 kbps)",
    category: "audio",
    group: "OGG",
    extension: FormatEnum.OGG,
    quality: "256k",
    tags: ["open", "web"],
  },
  {
    id: "ogg-128",
    label: "Low Quality (128 kbps)",
    category: "audio",
    group: "OGG",
    extension: FormatEnum.OGG,
    quality: "128k",
    tags: ["open", "web"],
  },

  // Group: AAC
  {
    id: "aac-320",
    label: "High Quality (320 kbps)",
    category: "audio",
    group: "AAC",
    extension: FormatEnum.AAC,
    quality: "320k",
    tags: ["raw"],
  },
  {
    id: "aac-256",
    label: "Medium Quality (256 kbps)",
    category: "audio",
    group: "AAC",
    extension: FormatEnum.AAC,
    quality: "256k",
    tags: ["raw"],
  },
  {
    id: "aac-128",
    label: "Low Quality (128 kbps)",
    category: "audio",
    group: "AAC",
    extension: FormatEnum.AAC,
    quality: "128k",
    tags: ["raw"],
  },

  // Group: AC3
  {
    id: "ac3-640",
    label: "High Quality (640 kbps)",
    category: "audio",
    group: "AC3",
    extension: FormatEnum.AC3,
    quality: "640k",
    tags: ["surround"],
  },
  {
    id: "ac3-448",
    label: "Medium Quality (448 kbps)",
    category: "audio",
    group: "AC3",
    extension: FormatEnum.AC3,
    quality: "448k",
    tags: ["surround"],
  },
  {
    id: "ac3-192",
    label: "Low Quality (192 kbps)",
    category: "audio",
    group: "AC3",
    extension: FormatEnum.AC3,
    quality: "192k",
    tags: ["stereo"],
  },

  // Group: AMR
  {
    id: "amr-122",
    label: "High Quality (12.2 kbps)",
    category: "audio",
    group: "AMR",
    extension: FormatEnum.AMR,
    quality: "12.2k",
    tags: ["speech"],
  },
  {
    id: "amr-795",
    label: "Medium Quality (7.95 kbps)",
    category: "audio",
    group: "AMR",
    extension: FormatEnum.AMR,
    quality: "7.95k",
    tags: ["speech"],
  },
  {
    id: "amr-67",
    label: "Low Quality (6.7 kbps)",
    category: "audio",
    group: "AMR",
    extension: FormatEnum.AMR,
    quality: "6.7k",
    tags: ["speech"],
  },

  // Group: MP2
  {
    id: "mp2-256",
    label: "High Quality (256 kbps)",
    category: "audio",
    group: "MP2",
    extension: FormatEnum.MP2,
    quality: "256k",
    tags: ["broadcast"],
  },
  {
    id: "mp2-128",
    label: "Medium Quality (128 kbps)",
    category: "audio",
    group: "MP2",
    extension: FormatEnum.MP2,
    quality: "128k",
    tags: ["broadcast"],
  },
  {
    id: "mp2-96",
    label: "Low Quality (96 kbps)",
    category: "audio",
    group: "MP2",
    extension: FormatEnum.MP2,
    quality: "96k",
    tags: ["broadcast"],
  },

  // Group: M4B
  {
    id: "m4b-256",
    label: "High Quality (256 kbps)",
    category: "audio",
    group: "M4B",
    extension: FormatEnum.M4B,
    quality: "256k",
    tags: ["book", "aac"],
  },
  {
    id: "m4b-128",
    label: "Medium Quality (128 kbps)",
    category: "audio",
    group: "M4B",
    extension: FormatEnum.M4B,
    quality: "128k",
    tags: ["book", "aac"],
  },
  {
    id: "m4b-96",
    label: "Low Quality (96 kbps)",
    category: "audio",
    group: "M4B",
    extension: FormatEnum.M4B,
    quality: "96k",
    tags: ["book", "aac"],
  },

  // Group: APE
  {
    id: "ape-lossless",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    group: "APE",
    extension: FormatEnum.APE,
    quality: "lossless",
    tags: ["archive"],
  },

  // Group: CAF
  {
    id: "caf-lossless",
    label: "Lossless Quality (Smart Fit)",
    category: "audio",
    group: "CAF",
    extension: FormatEnum.CAF,
    quality: "lossless",
    tags: ["apple"],
  },

  // ================= VIDEO (GENERIC) =================

  // Group: MP4
  {
    id: "mp4-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "MP4",
    extension: FormatEnum.MP4,
    quality: "original",
    tags: ["universal"],
  },
  {
    id: "mp4-8k",
    label: "8K Video (7680x4320)",
    category: "video_generic",
    group: "MP4",
    extension: FormatEnum.MP4,
    quality: "7680x4320",
    tags: ["ultra-hd"],
  },
  {
    id: "mp4-4k",
    label: "4K Video (3840x2160)",
    category: "video_generic",
    group: "MP4",
    extension: FormatEnum.MP4,
    quality: "3840x2160",
    tags: ["ultra-hd"],
  },
  {
    id: "mp4-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "MP4",
    extension: FormatEnum.MP4,
    quality: "1920x1080",
    tags: ["hd"],
  },
  {
    id: "mp4-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "MP4",
    extension: FormatEnum.MP4,
    quality: "1280x720",
    tags: ["hd"],
  },
  {
    id: "mp4-640",
    label: "SD 640P (960x640)",
    category: "video_generic",
    group: "MP4",
    extension: FormatEnum.MP4,
    quality: "960x640",
    tags: ["sd"],
  },
  {
    id: "mp4-576",
    label: "SD 576P (720x576)",
    category: "video_generic",
    group: "MP4",
    extension: FormatEnum.MP4,
    quality: "720x576",
    tags: ["sd"],
  },

  // Group: HEVC MP4
  {
    id: "hevc-mp4-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "HEVC MP4",
    extension: FormatEnum.MP4,
    quality: "original",
    tags: ["hevc", "modern"],
  },
  {
    id: "hevc-mp4-8k",
    label: "8K Video (7680x4320)",
    category: "video_generic",
    group: "HEVC MP4",
    extension: FormatEnum.MP4,
    quality: "7680x4320",
    tags: ["hevc", "ultra-hd"],
  },
  {
    id: "hevc-mp4-4k",
    label: "4K Video (3840x2160)",
    category: "video_generic",
    group: "HEVC MP4",
    extension: FormatEnum.MP4,
    quality: "3840x2160",
    tags: ["hevc", "ultra-hd"],
  },
  {
    id: "hevc-mp4-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "HEVC MP4",
    extension: FormatEnum.MP4,
    quality: "1920x1080",
    tags: ["hevc", "hd"],
  },
  {
    id: "hevc-mp4-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "HEVC MP4",
    extension: FormatEnum.MP4,
    quality: "1280x720",
    tags: ["hevc", "hd"],
  },

  // Group: MOV
  {
    id: "mov-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "MOV",
    extension: FormatEnum.MOV,
    quality: "original",
    tags: ["mac"],
  },
  {
    id: "mov-4k",
    label: "4K Video (3840x2160)",
    category: "video_generic",
    group: "MOV",
    extension: FormatEnum.MOV,
    quality: "3840x2160",
    tags: ["mac", "ultra-hd"],
  },
  {
    id: "mov-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "MOV",
    extension: FormatEnum.MOV,
    quality: "1920x1080",
    tags: ["mac", "hd"],
  },
  {
    id: "mov-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "MOV",
    extension: FormatEnum.MOV,
    quality: "1280x720",
    tags: ["mac", "hd"],
  },

  // Group: MKV
  {
    id: "mkv-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "MKV",
    extension: FormatEnum.MKV,
    quality: "original",
    tags: ["universal"],
  },
  {
    id: "mkv-4k",
    label: "4K Video (3840x2160)",
    category: "video_generic",
    group: "MKV",
    extension: FormatEnum.MKV,
    quality: "3840x2160",
    tags: ["ultra-hd"],
  },
  {
    id: "mkv-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "MKV",
    extension: FormatEnum.MKV,
    quality: "1920x1080",
    tags: ["hd"],
  },
  {
    id: "mkv-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "MKV",
    extension: FormatEnum.MKV,
    quality: "1280x720",
    tags: ["hd"],
  },

  // Group: HEVC MKV
  {
    id: "hevc-mkv-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "HEVC MKV",
    extension: FormatEnum.MKV,
    quality: "original",
    tags: ["hevc"],
  },
  {
    id: "hevc-mkv-4k",
    label: "4K Video (3840x2160)",
    category: "video_generic",
    group: "HEVC MKV",
    extension: FormatEnum.MKV,
    quality: "3840x2160",
    tags: ["hevc", "ultra-hd"],
  },
  {
    id: "hevc-mkv-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "HEVC MKV",
    extension: FormatEnum.MKV,
    quality: "1920x1080",
    tags: ["hevc", "hd"],
  },

  // Group: AVI
  {
    id: "avi-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "AVI",
    extension: FormatEnum.AVI,
    quality: "original",
    tags: ["legacy"],
  },
  {
    id: "avi-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "AVI",
    extension: FormatEnum.AVI,
    quality: "1920x1080",
    tags: ["legacy"],
  },
  {
    id: "avi-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "AVI",
    extension: FormatEnum.AVI,
    quality: "1280x720",
    tags: ["legacy"],
  },
  {
    id: "avi-576",
    label: "SD 576P (720x576)",
    category: "video_generic",
    group: "AVI",
    extension: FormatEnum.AVI,
    quality: "720x576",
    tags: ["legacy", "sd"],
  },

  // Group: WMV
  {
    id: "wmv-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "WMV",
    extension: FormatEnum.WMV,
    quality: "original",
    tags: ["windows"],
  },
  {
    id: "wmv-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "WMV",
    extension: FormatEnum.WMV,
    quality: "1920x1080",
    tags: ["windows"],
  },
  {
    id: "wmv-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "WMV",
    extension: FormatEnum.WMV,
    quality: "1280x720",
    tags: ["windows"],
  },

  // Group: WebM
  {
    id: "webm-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "WebM",
    extension: FormatEnum.WEBM,
    quality: "original",
    tags: ["web"],
  },
  {
    id: "webm-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "WebM",
    extension: FormatEnum.WEBM,
    quality: "1920x1080",
    tags: ["web"],
  },
  {
    id: "webm-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "WebM",
    extension: FormatEnum.WEBM,
    quality: "1280x720",
    tags: ["web"],
  },

  // Group: FLV
  {
    id: "flv-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "FLV",
    extension: FormatEnum.FLV,
    quality: "original",
    tags: ["flash"],
  },
  {
    id: "flv-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "FLV",
    extension: FormatEnum.FLV,
    quality: "1920x1080",
    tags: ["flash"],
  },
  {
    id: "flv-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "FLV",
    extension: FormatEnum.FLV,
    quality: "1280x720",
    tags: ["flash"],
  },

  // Group: 3GP
  {
    id: "3gp-352",
    label: "CIF (352x288)",
    category: "video_generic",
    group: "3GP",
    extension: FormatEnum.GP3,
    quality: "352x288",
    tags: ["mobile"],
  },
  {
    id: "3gp-176",
    label: "QCIF (176x144)",
    category: "video_generic",
    group: "3GP",
    extension: FormatEnum.GP3,
    quality: "176x144",
    tags: ["mobile"],
  },

  // Group: MPEG-1
  {
    id: "mpeg1-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "MPEG-1",
    extension: FormatEnum.MPG,
    quality: "original",
    tags: ["vcd"],
  },
  {
    id: "mpeg1-cif",
    label: "CIF (352x288)",
    category: "video_generic",
    group: "MPEG-1",
    extension: FormatEnum.MPG,
    quality: "352x288",
    tags: ["vcd"],
  },

  // Group: MPEG-2
  {
    id: "mpeg2-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "MPEG-2",
    extension: FormatEnum.MPG,
    quality: "original",
    tags: ["dvd"],
  },
  {
    id: "mpeg2-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_generic",
    group: "MPEG-2",
    extension: FormatEnum.MPG,
    quality: "1920x1080",
    tags: ["hd"],
  },
  {
    id: "mpeg2-576",
    label: "SD (720x576)",
    category: "video_generic",
    group: "MPEG-2",
    extension: FormatEnum.MPG,
    quality: "720x576",
    tags: ["dvd"],
  },

  // Group: VOB
  {
    id: "vob-dvd",
    label: "DVD Standard",
    category: "video_generic",
    group: "VOB",
    extension: FormatEnum.VOB,
    quality: "original",
    tags: ["dvd"],
  },

  // Group: OGV
  {
    id: "ogv-orig",
    label: "Same as source (Original)",
    category: "video_generic",
    group: "OGV",
    extension: FormatEnum.OGV,
    quality: "original",
    tags: ["open"],
  },
  {
    id: "ogv-720",
    label: "HD 720P (1280x720)",
    category: "video_generic",
    group: "OGV",
    extension: FormatEnum.OGV,
    quality: "1280x720",
    tags: ["open"],
  },

  // ================= DEVICES =================
  // Group: Apple
  {
    id: "apple-4k",
    label: "4K Video (3840x2160)",
    category: "video_device",
    group: "Apple",
    extension: FormatEnum.MP4,
    quality: "3840x2160",
    description: "iPhone 16/15/14/13/12/11 Pro Max, Apple TV 4K, iPad Pro",
    tags: ["latest", "apple"],
  },
  {
    id: "apple-ipad-pro",
    label: "iPad Pro (2732x2048)",
    category: "video_device",
    group: "Apple",
    extension: FormatEnum.MP4,
    quality: "2732x2048",
    description: 'iPad Pro 12.9"',
    tags: ["apple", "tablet"],
  },
  {
    id: "apple-1284",
    label: "Super Retina (2778x1284)",
    category: "video_device",
    group: "Apple",
    extension: FormatEnum.MP4,
    quality: "2778x1284",
    description: "iPhone 13/12 Pro Max",
    tags: ["apple"],
  },
  {
    id: "apple-1080",
    label: "HD 1080P (1920x1080)",
    category: "video_device",
    group: "Apple",
    extension: FormatEnum.MP4,
    quality: "1920x1080",
    description: "All iPhone/iPad/Apple TV models",
    tags: ["apple"],
  },

  // Group: Samsung
  {
    id: "samsung-qhd",
    label: "QHD+ (3120x1440)",
    category: "video_device",
    group: "Samsung",
    extension: FormatEnum.MP4,
    quality: "3120x1440",
    description: "Galaxy S24/S23 Ultra",
    tags: ["samsung"],
  },
  {
    id: "samsung-1080",
    label: "FHD+ (2340x1080)",
    category: "video_device",
    group: "Samsung",
    extension: FormatEnum.MP4,
    quality: "2340x1080",
    description: "All Galaxy S Series",
    tags: ["samsung"],
  },

  // Group: Huawei
  {
    id: "huawei-1.5k",
    label: "1.5K (2720x1260)",
    category: "video_device",
    group: "Huawei",
    extension: FormatEnum.MP4,
    quality: "2720x1260",
    description: "Mate 60 Pro, P60 Pro",
    tags: ["huawei"],
  },
  {
    id: "huawei-1080",
    label: "FHD+ (2400x1080)",
    category: "video_device",
    group: "Huawei",
    extension: FormatEnum.MP4,
    quality: "2400x1080",
    description: "All Huawei Models",
    tags: ["huawei"],
  },

  // Group: Xiaomi
  {
    id: "xiaomi-2k",
    label: "2K (3200x1440)",
    category: "video_device",
    group: "Xiaomi",
    extension: FormatEnum.MP4,
    quality: "3200x1440",
    description: "Xiaomi 14 Ultra, 13 Pro",
    tags: ["xiaomi"],
  },
  {
    id: "xiaomi-1080",
    label: "FHD+ (2400x1080)",
    category: "video_device",
    group: "Xiaomi",
    extension: FormatEnum.MP4,
    quality: "2400x1080",
    description: "All Xiaomi Models",
    tags: ["xiaomi"],
  },

  // Group: Google
  {
    id: "pixel-pro",
    label: "Super Res (2992x1344)",
    category: "video_device",
    group: "Google",
    extension: FormatEnum.MP4,
    quality: "2992x1344",
    description: "Pixel 8 Pro, 7 Pro",
    tags: ["google"],
  },
  {
    id: "pixel-1080",
    label: "FHD+ (2400x1080)",
    category: "video_device",
    group: "Google",
    extension: FormatEnum.MP4,
    quality: "2400x1080",
    description: "All Pixel Models",
    tags: ["google"],
  },

  // Group: Sony
  {
    id: "sony-4k",
    label: "4K OLED (3840x1644)",
    category: "video_device",
    group: "Sony",
    extension: FormatEnum.MP4,
    quality: "3840x1644",
    description: "Xperia 1 V / 1 IV (21:9)",
    tags: ["sony"],
  },
  {
    id: "sony-1080",
    label: "FHD+ (2520x1080)",
    category: "video_device",
    group: "Sony",
    extension: FormatEnum.MP4,
    quality: "2520x1080",
    description: "Xperia 5 Series",
    tags: ["sony"],
  },

  // Group: Games
  {
    id: "console-4k",
    label: "4K UHD (3840x2160)",
    category: "video_device",
    group: "Games",
    extension: FormatEnum.MP4,
    quality: "3840x2160",
    description: "PS5, Xbox Series X",
    tags: ["game"],
  },
  {
    id: "console-1080",
    label: "Full HD (1920x1080)",
    category: "video_device",
    group: "Games",
    extension: FormatEnum.MP4,
    quality: "1920x1080",
    description: "PS4, Switch Docked",
    tags: ["game"],
  },
  {
    id: "console-720",
    label: "HD 720P (1280x720)",
    category: "video_device",
    group: "Games",
    extension: FormatEnum.MP4,
    quality: "1280x720",
    description: "Nintendo Switch Handheld",
    tags: ["game"],
  },

  // ================= EDITORS =================
  // Group: Final Cut Pro
  {
    id: "fcp-prores-422",
    label: "ProRes 422",
    category: "video_editor",
    group: "Final Cut Pro X",
    extension: FormatEnum.MP4,
    quality: "original",
    tags: ["apple"],
  },
  {
    id: "fcp-prores-hq",
    label: "ProRes 422 HQ",
    category: "video_editor",
    group: "Final Cut Pro X",
    extension: FormatEnum.MP4,
    quality: "original",
    tags: ["apple"],
  },
  {
    id: "fcp-prores-lt",
    label: "ProRes 422 LT",
    category: "video_editor",
    group: "Final Cut Pro X",
    extension: FormatEnum.MP4,
    quality: "original",
    tags: ["apple"],
  },
  {
    id: "fcp-prores-proxy",
    label: "ProRes 422 Proxy",
    category: "video_editor",
    group: "Final Cut Pro X",
    extension: FormatEnum.MP4,
    quality: "original",
    tags: ["apple"],
  },
  {
    id: "fcp-prores-4444",
    label: "ProRes 4444",
    category: "video_editor",
    group: "Final Cut Pro X",
    extension: FormatEnum.MP4,
    quality: "original",
    tags: ["apple"],
  },

  // Group: iMovie
  {
    id: "imovie-hd",
    label: "HD 1080p",
    category: "video_editor",
    group: "iMovie",
    extension: FormatEnum.MP4,
    quality: "1920x1080",
    tags: [],
  },

  // Group: Avid
  {
    id: "avid-dnxhd",
    label: "DNxHD",
    category: "video_editor",
    group: "Avid",
    extension: FormatEnum.MP4,
    quality: "original",
    tags: [],
  },

  // ================= WEB / SOCIAL =================
  // Group: YouTube
  {
    id: "yt-4k",
    label: "4K Ultra HD",
    category: "video_social",
    group: "YouTube",
    extension: FormatEnum.MP4,
    quality: "3840x2160",
    tags: [],
  },
  {
    id: "yt-1080",
    label: "Full HD 1080p",
    category: "video_social",
    group: "YouTube",
    extension: FormatEnum.MP4,
    quality: "1920x1080",
    tags: [],
  },

  // Group: Facebook
  {
    id: "fb-720",
    label: "HD 720p",
    category: "video_social",
    group: "Facebook",
    extension: FormatEnum.MP4,
    quality: "1280x720",
    tags: [],
  },

  // Group: Instagram
  {
    id: "ig-story",
    label: "Story/Reel (Vertical)",
    category: "video_social",
    group: "Instagram",
    extension: FormatEnum.MP4,
    quality: "1080x1920",
    tags: ["vertical"],
  },
  {
    id: "ig-post",
    label: "Square Post",
    category: "video_social",
    group: "Instagram",
    extension: FormatEnum.MP4,
    quality: "1080x1080",
    tags: ["square"],
  },

  // Group: Vimeo
  {
    id: "vimeo-1080",
    label: "HD 1080p",
    category: "video_social",
    group: "Vimeo",
    extension: FormatEnum.MP4,
    quality: "1920x1080",
    tags: [],
  },

  // ================= IMAGES =================
  {
    id: "jpeg-orig",
    label: "Original",
    category: "image",
    group: "JPEG",
    extension: FormatEnum.JPG,
    quality: "original",
    tags: [],
  },
  {
    id: "png-orig",
    label: "Original",
    category: "image",
    group: "PNG",
    extension: FormatEnum.PNG,
    quality: "original",
    tags: [],
  },
  {
    id: "webp-orig",
    label: "Original",
    category: "image",
    group: "WEBP",
    extension: FormatEnum.WEBP,
    quality: "original",
    tags: [],
  },
  {
    id: "heic-orig",
    label: "Original",
    category: "image",
    group: "HEIC",
    extension: FormatEnum.HEIC,
    quality: "original",
    tags: [],
  },
  {
    id: "gif-anim",
    label: "Standard",
    category: "image",
    group: "GIF",
    extension: FormatEnum.GIF,
    quality: "original",
    tags: [],
  },
  {
    id: "tiff-orig",
    label: "Original",
    category: "image",
    group: "TIFF",
    extension: FormatEnum.TIFF,
    quality: "original",
    tags: [],
  },
];

const AUDIO_FORMATS = [
  FormatEnum.MP3,
  FormatEnum.M4A,
  FormatEnum.WAV,
  FormatEnum.M4R,
  FormatEnum.AIFF,
  FormatEnum.FLAC,
  FormatEnum.OGG,
  FormatEnum.AAC,
  FormatEnum.AC3,
  FormatEnum.AMR,
  FormatEnum.MP2,
  FormatEnum.M4B,
  FormatEnum.APE,
  FormatEnum.CAF,
];

const VIDEO_FORMATS = [
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

const IMAGE_FORMATS = [
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

export function isAudioFormat(format: any): boolean {
  if (!format) return false;
  return AUDIO_FORMATS.includes(format);
}

export function isVideoFormat(format: any): boolean {
  if (!format) return false;
  return VIDEO_FORMATS.includes(format);
}

export function isImageFormat(format: any): boolean {
  if (!format) return false;
  return IMAGE_FORMATS.includes(format);
}
