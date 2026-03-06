import {
  ImageEncoderEnum,
  SelectOption,
  VideoEncoderEnum,
  ColorSpaceOption,
  FormatEnum,
} from "@/types/options";
import { AudioEncoderEnum } from "@/types/options";
import { COLOR_SPACES, VIDEO_BITRATES } from "@/data/video_options";
import { RESOLUTION_OPTIONS, ResolutionGroup } from "./resolution";

// ================= TYPES =================

export interface AudioEncoderOptions {
  sampleRates: SelectOption[];
  channels: SelectOption[];
  bitrates: SelectOption[];
}

export interface VideoEncoderOptions {
  resolutions: ResolutionGroup[];
  frameRates: SelectOption[];
  bitrates: SelectOption[];
  colorSpaces: ColorSpaceOption[];
}

// ================= DATA: ENCODERS =================
export interface VideoEncoderDefinition {
  audio?: {
    sampleRates?: string[];
    channels?: string[];
    bitrates?: string[];
  };
  video?: {
    maxResolution?: [number, number];
    maxFrameRate?: number;
    minBitrate?: number;
    maxBitrate?: number;
    pixelFormats?: string[];
    colorSpaces?: string[];
    allowedColorRanges?: string[];
    gopOptions?: string[];
    allowedColorDepths?: number[];
  };
}

const SDR_COLOR_SPACE_VALUES = ["auto", "rec709"];
const HDR_COLOR_SPACE_VALUES = ["auto", "rec709", "rec2100hlg", "rec2100pq"];
const FULL_COLOR_RANGE_VALUES = ["auto", "limited", "full"];
const LIMITED_COLOR_RANGE_VALUES = ["auto", "limited"];
const COMMON_GOP_VALUES = [
  "12",
  "15",
  "18",
  "24",
  "30",
  "48",
  "60",
  "120",
  "250",
];
const LOW_LATENCY_GOP_VALUES = ["12", "15", "18", "24", "30", "48", "60"];
const INTRA_ONLY_GOP_VALUES = ["1"];

export const VIDEO_ENCODER_DEFINITIONS: Partial<
  Record<VideoEncoderEnum, VideoEncoderDefinition>
> = {
  // --- Video Encoders ---
  [VideoEncoderEnum.H264]: {
    video: {
      maxResolution: [4096, 2304],
      maxFrameRate: 60,
      minBitrate: 256,
      maxBitrate: 50000,
      colorSpaces: HDR_COLOR_SPACE_VALUES,
      allowedColorRanges: FULL_COLOR_RANGE_VALUES,
      gopOptions: COMMON_GOP_VALUES,
      allowedColorDepths: [8, 10],
    },
  },
  [VideoEncoderEnum.H265]: {
    video: {
      maxResolution: [8192, 4320],
      maxFrameRate: 60,
      minBitrate: 256,
      maxBitrate: 80000,
      colorSpaces: HDR_COLOR_SPACE_VALUES,
      allowedColorRanges: FULL_COLOR_RANGE_VALUES,
      gopOptions: COMMON_GOP_VALUES,
      allowedColorDepths: [8, 10, 12],
    },
  },
  [VideoEncoderEnum.VP9]: {
    video: {
      maxResolution: [7680, 4320],
      maxFrameRate: 60,
      minBitrate: 256,
      maxBitrate: 50000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
      allowedColorRanges: FULL_COLOR_RANGE_VALUES,
      gopOptions: COMMON_GOP_VALUES,
      allowedColorDepths: [8, 10, 12],
    },
  },
  [VideoEncoderEnum.AV1]: {
    video: {
      maxResolution: [7680, 4320],
      maxFrameRate: 60,
      minBitrate: 256,
      maxBitrate: 50000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
      allowedColorRanges: FULL_COLOR_RANGE_VALUES,
      gopOptions: COMMON_GOP_VALUES,
      allowedColorDepths: [8, 10, 12],
    },
  },
  [VideoEncoderEnum.MPEG4]: {
    video: {
      maxResolution: [1920, 1080],
      maxFrameRate: 60,
      minBitrate: 128,
      maxBitrate: 50000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
      allowedColorRanges: LIMITED_COLOR_RANGE_VALUES,
      gopOptions: COMMON_GOP_VALUES,
      allowedColorDepths: [8],
    },
  },
  [VideoEncoderEnum.MPEG2VIDEO]: {
    video: {
      maxResolution: [1920, 1080],
      maxFrameRate: 60,
      minBitrate: 128,
      maxBitrate: 50000,
      pixelFormats: ["yuv420p", "yuv422p"],
      colorSpaces: SDR_COLOR_SPACE_VALUES,
      allowedColorRanges: LIMITED_COLOR_RANGE_VALUES,
      gopOptions: COMMON_GOP_VALUES,
      allowedColorDepths: [8],
    },
  },
  [VideoEncoderEnum.PRORES]: {
    video: {
      maxResolution: [8192, 4320],
      maxFrameRate: 60,
      minBitrate: 1000,
      maxBitrate: 200000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
      allowedColorRanges: FULL_COLOR_RANGE_VALUES,
      gopOptions: INTRA_ONLY_GOP_VALUES,
      allowedColorDepths: [10, 12],
    },
  },
  [VideoEncoderEnum.MJPEG]: {
    video: {
      maxResolution: [1920, 1080],
      maxFrameRate: 60,
      minBitrate: 500,
      maxBitrate: 50000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
      allowedColorRanges: FULL_COLOR_RANGE_VALUES,
      gopOptions: LOW_LATENCY_GOP_VALUES,
      allowedColorDepths: [8],
    },
  },
};

export interface AudioEncoderDefinition {
  maxSampleRate?: number;
  minSampleRate?: number;
  maxBitrate?: number;
  minBitrate?: number;
  allowedChannels?: string[];
  allowedBitDepths?: number[];
}

export const AUDIO_ENCODER_DEFINITIONS: Partial<
  Record<AudioEncoderEnum, AudioEncoderDefinition>
> = {
  [AudioEncoderEnum.AAC]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ["1", "2", "3", "4", "5", "6"],
    allowedBitDepths: [16],
  },
  [AudioEncoderEnum.MP3]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ["1", "2"],
    allowedBitDepths: [16],
  },
  [AudioEncoderEnum.OPUS]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ["1", "2"],
    allowedBitDepths: [16],
  },
  [AudioEncoderEnum.VORBIS]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ["1", "2"],
    allowedBitDepths: [16],
  },
  [AudioEncoderEnum.AC3]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ["1", "2", "6"],
    allowedBitDepths: [16],
  },
  [AudioEncoderEnum.FLAC]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ["1", "2", "3", "4", "5", "6", "7", "8"],
    allowedBitDepths: [16, 24],
  },
};
export interface ImageEncoderDefinition {
  maxWidth?: number;
  maxHeight?: number;
}
export const IMAGE_ENCODER_DEFINITIONS: Partial<
  Record<ImageEncoderEnum, ImageEncoderDefinition>
> = {
  [ImageEncoderEnum.JPEG]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.PNG]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.WEBP]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.AVIF]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.GIF]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.HEIC]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.TIFF]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.BMP]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.ICO]: {
    maxWidth: 256,
    maxHeight: 256,
  },
  [ImageEncoderEnum.PCX]: {
    maxWidth: 640,
    maxHeight: 480,
  },
  [ImageEncoderEnum.SGI]: {
    maxWidth: 640,
    maxHeight: 480,
  },
  [ImageEncoderEnum.SUNRAST]: {
    maxWidth: 640,
    maxHeight: 480,
  },
  [ImageEncoderEnum.XBM]: {
    maxWidth: 32,
    maxHeight: 32,
  },
  [ImageEncoderEnum.XWD]: {
    maxWidth: 32,
    maxHeight: 32,
  },
};

// ================= DATA: CONTAINER RULES =================
export interface VideoContainerDefinition {
  video?: {
    allowedEncoders: VideoEncoderEnum[];
  };
  audio?: {
    allowedEncoders: AudioEncoderEnum[];
  };
}

export const VIDEO_CONTAINER_DEFINITIONS: Partial<
  Record<FormatEnum, VideoContainerDefinition>
> = {
  [FormatEnum.MP4]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H265,
        VideoEncoderEnum.AV1,
        VideoEncoderEnum.VP9,
        VideoEncoderEnum.MPEG4,
      ],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.AAC,
        AudioEncoderEnum.MP3,
        AudioEncoderEnum.AC3,
        AudioEncoderEnum.OPUS,
      ],
    },
  },

  [FormatEnum.MOV]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H265,
        VideoEncoderEnum.PRORES,
        VideoEncoderEnum.MJPEG,
        VideoEncoderEnum.MPEG4,
      ],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.AAC,
        AudioEncoderEnum.ALAC,
        AudioEncoderEnum.PCM_S16LE,
      ],
    },
  },

  [FormatEnum.MKV]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H265,
        VideoEncoderEnum.AV1,
        VideoEncoderEnum.VP9,
        VideoEncoderEnum.MPEG4,
        VideoEncoderEnum.MPEG2VIDEO,
      ],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.AAC,
        AudioEncoderEnum.MP3,
        AudioEncoderEnum.AC3,
        AudioEncoderEnum.FLAC,
        AudioEncoderEnum.VORBIS,
        AudioEncoderEnum.OPUS,
      ],
    },
  },

  [FormatEnum.WEBM]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.VP8,
        VideoEncoderEnum.VP9,
        VideoEncoderEnum.AV1,
      ],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.OPUS, AudioEncoderEnum.VORBIS],
    },
  },

  [FormatEnum.AVI]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.MPEG4,
        VideoEncoderEnum.XVID,
        VideoEncoderEnum.MJPEG,
        VideoEncoderEnum.H264,
        VideoEncoderEnum.MPEG2VIDEO,
      ],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.MP3,
        AudioEncoderEnum.PCM_S16LE,
        AudioEncoderEnum.AC3,
      ],
    },
  },

  [FormatEnum.M4V]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H265,
        VideoEncoderEnum.MPEG4,
      ],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.AAC,
        AudioEncoderEnum.MP3,
        AudioEncoderEnum.AC3,
      ],
    },
  },

  [FormatEnum.ASF]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.MPEG4, VideoEncoderEnum.H264],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.WMAV2,
        AudioEncoderEnum.MP3,
        AudioEncoderEnum.AAC,
      ],
    },
  },

  [FormatEnum.FLV]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.H264],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.MP3],
    },
  },

  [FormatEnum.WMV]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.MPEG4, VideoEncoderEnum.H264],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.WMAV2, AudioEncoderEnum.MP3],
    },
  },

  [FormatEnum.GP3]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H263,
        VideoEncoderEnum.MPEG4,
      ],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC],
    },
  },

  [FormatEnum.TS]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H265,
        VideoEncoderEnum.MPEG2VIDEO,
      ],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.AAC,
        AudioEncoderEnum.AC3,
        AudioEncoderEnum.MP2,
        AudioEncoderEnum.MP3,
      ],
    },
  },

  [FormatEnum.M2TS]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H265,
        VideoEncoderEnum.MPEG2VIDEO,
      ],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.AAC,
        AudioEncoderEnum.AC3,
        AudioEncoderEnum.MP2,
      ],
    },
  },
  [FormatEnum.MPG]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.MPEG2VIDEO],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.MP2,
        AudioEncoderEnum.AC3,
        AudioEncoderEnum.MP3,
      ],
    },
  },

  [FormatEnum.VOB]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.MPEG2VIDEO],
    },
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.PCM_S16BE,
        AudioEncoderEnum.AC3,
        AudioEncoderEnum.MP2,
      ],
    },
  },

  [FormatEnum.OGV]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.THEORA],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.VORBIS, AudioEncoderEnum.OPUS],
    },
  },
  [FormatEnum.M4A]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.ALAC],
    },
  },
  [FormatEnum.M4B]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.ALAC],
    },
  },
  [FormatEnum.M4R]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC],
    },
  },
};

interface AudioContainerDefinition {
  allowedEncoders: AudioEncoderEnum[];
}
export const AUDIO_CONTAINER_DEFINITIONS: Partial<
  Record<FormatEnum, AudioContainerDefinition>
> = {
  [FormatEnum.MP3]: {
    allowedEncoders: [AudioEncoderEnum.MP3],
  },
  [FormatEnum.AAC]: {
    allowedEncoders: [AudioEncoderEnum.AAC],
  },
  [FormatEnum.WAV]: {
    allowedEncoders: [
      AudioEncoderEnum.PCM_S16LE,
      AudioEncoderEnum.PCM_S24LE,
      AudioEncoderEnum.PCM_S32LE,
      AudioEncoderEnum.PCM_F32LE,
      AudioEncoderEnum.PCM_F64LE,
      AudioEncoderEnum.PCM_U8,
      AudioEncoderEnum.PCM_ALAW,
      AudioEncoderEnum.PCM_MULAW,
      AudioEncoderEnum.ADPCM_MS,
      AudioEncoderEnum.ADPCM_IMA_WAV,
    ],
  },
  [FormatEnum.AIFF]: {
    allowedEncoders: [
      AudioEncoderEnum.PCM_S16BE,
      AudioEncoderEnum.PCM_S24BE,
      AudioEncoderEnum.PCM_S32BE,
      AudioEncoderEnum.PCM_F32BE,
      AudioEncoderEnum.PCM_F64BE,
    ],
  },
  [FormatEnum.FLAC]: {
    allowedEncoders: [AudioEncoderEnum.FLAC],
  },
  [FormatEnum.OGG]: {
    allowedEncoders: [
      AudioEncoderEnum.OPUS,
      AudioEncoderEnum.VORBIS,
      AudioEncoderEnum.FLAC,
    ],
  },
  [FormatEnum.AC3]: {
    allowedEncoders: [AudioEncoderEnum.AC3],
  },
  [FormatEnum.EAC3]: {
    allowedEncoders: [AudioEncoderEnum.EAC3],
  },
  // [FormatEnum.AMR]: {
  //   allowedEncoders: [AudioEncoderEnum.AMR_NB, AudioEncoderEnum.AMR_WB],
  // },
  [FormatEnum.MP2]: {
    allowedEncoders: [AudioEncoderEnum.MP2],
  },
  [FormatEnum.APE]: {
    allowedEncoders: [AudioEncoderEnum.APE],
  },
  [FormatEnum.CAF]: {
    allowedEncoders: [
      AudioEncoderEnum.ALAC,
      AudioEncoderEnum.PCM_S16LE,
      AudioEncoderEnum.PCM_S24LE,
      AudioEncoderEnum.PCM_S32LE,
      AudioEncoderEnum.PCM_S16BE,
    ],
  },
  [FormatEnum.OPUS]: {
    allowedEncoders: [AudioEncoderEnum.OPUS],
  },
  [FormatEnum.WMA]: {
    allowedEncoders: [AudioEncoderEnum.WMAV2, AudioEncoderEnum.MP3],
  },
  [FormatEnum.M4A]: {
    allowedEncoders: [AudioEncoderEnum.AAC],
  },
  [FormatEnum.M4B]: {
    allowedEncoders: [AudioEncoderEnum.AAC],
  },
  [FormatEnum.M4R]: {
    allowedEncoders: [AudioEncoderEnum.AAC],
  },
};

interface ImageContainerDefinition {
  allowedEncoders: ImageEncoderEnum[];
}

export const IMAGE_CONTAINER_DEFINITIONS: Record<
  string,
  ImageContainerDefinition
> = {
  [FormatEnum.PNG]: {
    allowedEncoders: [ImageEncoderEnum.PNG],
  },
  [FormatEnum.JPG]: {
    allowedEncoders: [ImageEncoderEnum.JPEG],
  },
  [FormatEnum.WEBP]: {
    allowedEncoders: [ImageEncoderEnum.WEBP],
  },
  [FormatEnum.AVIF]: {
    allowedEncoders: [ImageEncoderEnum.AVIF],
  },
  [FormatEnum.GIF]: {
    allowedEncoders: [ImageEncoderEnum.GIF],
  },
  [FormatEnum.HEIC]: {
    allowedEncoders: [ImageEncoderEnum.HEIC],
  },
  [FormatEnum.TIFF]: {
    allowedEncoders: [ImageEncoderEnum.TIFF],
  },
  [FormatEnum.BMP]: {
    allowedEncoders: [ImageEncoderEnum.BMP],
  },
  [FormatEnum.ICO]: {
    allowedEncoders: [ImageEncoderEnum.ICO],
  },
};

// ================= HELPERS =================
export const VIDEO_FRAME_RATES: SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "120", label: "120 FPS" },
  { value: "60", label: "60 FPS" },
  { value: "50", label: "50 FPS" },
  { value: "30", label: "30 FPS" },
  { value: "29.97", label: "29.97 FPS (NTSC)" },
  { value: "25", label: "25 FPS (PAL)" },
  { value: "24", label: "24 FPS" },
  { value: "23.976", label: "23.976 FPS" },
];

// ================= OPTION HELPERS =================

const parseResolution = (res: string) => {
  const match = res.match(/(\d+)x(\d+)/);
  if (!match) return null;
  return { w: parseInt(match[1]), h: parseInt(match[2]) };
};

export function getVideoOptionsByEncoder(
  encoderId?: string,
): VideoEncoderOptions {
  const defaults: VideoEncoderOptions = {
    resolutions: RESOLUTION_OPTIONS,
    frameRates: VIDEO_FRAME_RATES,
    bitrates: VIDEO_BITRATES,
    colorSpaces: [],
  };

  if (!encoderId) return defaults;
  const def = VIDEO_ENCODER_DEFINITIONS[encoderId as VideoEncoderEnum];
  if (!def) return defaults;
  const videoConstraints = def.video;

  const allowedColorSpaces = videoConstraints?.colorSpaces;
  const colorSpaces =
    allowedColorSpaces && allowedColorSpaces.length > 0
      ? COLOR_SPACES.filter((option) =>
          allowedColorSpaces.includes(option.value),
        )
      : COLOR_SPACES;
  const maxResolution = videoConstraints?.maxResolution;
  const maxFrameRate = videoConstraints?.maxFrameRate;
  const minBitrate = videoConstraints?.minBitrate;
  const maxBitrate = videoConstraints?.maxBitrate;

  return {
    resolutions: RESOLUTION_OPTIONS.map((group) => ({
      ...group,
      options: group.options.filter((opt) => {
        if (opt.value === "auto") return true;
        const current = parseResolution(opt.value);
        if (maxResolution && current) {
          return current.w * current.h <= maxResolution[0] * maxResolution[1];
        }
        return true;
      }),
    })).filter((group) => group.options.length > 0),
    frameRates: VIDEO_FRAME_RATES.filter((opt) => {
      if (opt.value === "auto") return true;
      if (maxFrameRate) {
        return parseFloat(opt.value) <= maxFrameRate;
      }
      return true;
    }),
    bitrates: VIDEO_BITRATES.filter((opt) => {
      if (opt.value === "auto") return true;
      const current = parseInt(opt.value);
      if (minBitrate !== undefined && current < minBitrate) {
        return false;
      }
      if (maxBitrate !== undefined && current > maxBitrate) {
        return false;
      }
      return true;
    }),
    colorSpaces,
  };
}
