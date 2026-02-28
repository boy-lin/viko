import {
  AudioEncoderEnum,
  EncoderEnum,
  FormatEnum,
  ImageEncoderEnum,
  SelectOption,
  VideoEncoderEnum,
} from "@/types/options";
import { AUDIO_BITRATES, AUDIO_CHANNELS, AUDIO_SAMPLE_RATES } from "@/data/audio_options";
import { COLOR_SPACES, VIDEO_BITRATES } from "@/data/video_options";
import { ColorSpaceOption } from "@/types/options";
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
  };
}

const SDR_COLOR_SPACE_VALUES = ["auto", "rec709"];
const HDR_COLOR_SPACE_VALUES = ["auto", "rec709", "rec2100hlg", "rec2100pq"];

export const VIDEO_ENCODER_DEFINITIONS: Partial<Record<VideoEncoderEnum, VideoEncoderDefinition>> = {
  // --- Video Encoders ---
  [VideoEncoderEnum.H264]: {
    video: {
      maxResolution: [4096, 2304],
      maxFrameRate: 60,
      minBitrate: 256,
      maxBitrate: 50000,
      colorSpaces: HDR_COLOR_SPACE_VALUES,
    },
  },
  [VideoEncoderEnum.H265]: {

    video: {
      maxResolution: [8192, 4320],
      maxFrameRate: 60,
      minBitrate: 256,
      maxBitrate: 80000,
      colorSpaces: HDR_COLOR_SPACE_VALUES,
    },
  },
  [VideoEncoderEnum.VP9]: {

    video: {
      maxResolution: [7680, 4320],
      maxFrameRate: 60,
      minBitrate: 256,
      maxBitrate: 50000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
    },
  },
  [VideoEncoderEnum.AV1]: {

    video: {
      maxResolution: [7680, 4320],
      maxFrameRate: 60,
      minBitrate: 256,
      maxBitrate: 50000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
    },
  },
  [VideoEncoderEnum.MPEG4]: {

    video: {
      maxResolution: [1920, 1080],
      maxFrameRate: 60,
      minBitrate: 128,
      maxBitrate: 50000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
    },
  },
  [VideoEncoderEnum.MPEG2VIDEO]: {

    video: {
      maxResolution: [1920, 1080],
      maxFrameRate: 60,
      minBitrate: 128,
      maxBitrate: 50000,
      pixelFormats: ['yuv420p', 'yuv422p'],
      colorSpaces: SDR_COLOR_SPACE_VALUES,
    },
  },
  [VideoEncoderEnum.PRORES]: {

    video: {
      maxResolution: [8192, 4320],
      maxFrameRate: 60,
      minBitrate: 1000,
      maxBitrate: 200000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
    },
  },
  [VideoEncoderEnum.MJPEG]: {

    video: {
      maxResolution: [1920, 1080],
      maxFrameRate: 60,
      minBitrate: 500,
      maxBitrate: 50000,
      colorSpaces: SDR_COLOR_SPACE_VALUES,
    },
  },
};

export interface AudioEncoderDefinition {
  maxSampleRate?: number;
  minSampleRate?: number;
  maxBitrate?: number;
  minBitrate?: number;
  allowedChannels?: string[];
}

export const AUDIO_ENCODER_DEFINITIONS: Partial<Record<AudioEncoderEnum, AudioEncoderDefinition>> = {
  [AudioEncoderEnum.AAC]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ['1', '2', '3', '4', '5', '6'],
  },
  [AudioEncoderEnum.MP3]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ['1', '2'],
  },
  [AudioEncoderEnum.OPUS]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ['1', '2'],
  },
  [AudioEncoderEnum.AC3]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ['1', '2', '6'],
  },
  [AudioEncoderEnum.FLAC]: {
    maxSampleRate: 48000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ['1', '2', '3', '4', '5', '6', '7', '8'],
  },
  [AudioEncoderEnum.AMR_NB]: {
    maxSampleRate: 8000,
    minSampleRate: 8000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ['1'],
  },
  [AudioEncoderEnum.AMR_WB]: {
    maxSampleRate: 16000,
    minSampleRate: 16000,
    maxBitrate: 320,
    minBitrate: 32,
    allowedChannels: ['1'],
  },
};
export interface ImageEncoderDefinition {
  maxWidth?: number;
  maxHeight?: number;
}
export const IMAGE_ENCODER_DEFINITIONS: Partial<Record<ImageEncoderEnum, ImageEncoderDefinition>> = {
  [ImageEncoderEnum.JPEG]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.PNG]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.WEBP]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.AVIF]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.GIF]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.HEIC]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.TIFF]: { maxWidth: 4096, maxHeight: 4096 },
  [ImageEncoderEnum.BMP]: { maxWidth: 4096, maxHeight: 4096 },
};

// ================= DATA: CONTAINER RULES =================
export interface ContainerDefinition {
  video?: {
    allowedEncoders: VideoEncoderEnum[];
  };
  audio?: {
    allowedEncoders: AudioEncoderEnum[];
  };
  image?: {
    allowedEncoders: ImageEncoderEnum[];
  };
}

export const CONTAINER_DEFINITIONS: Record<string, ContainerDefinition> = {
  [FormatEnum.MP4]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H265,
        VideoEncoderEnum.AV1,
        VideoEncoderEnum.VP9,
        VideoEncoderEnum.MPEG4
      ],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.MP3, AudioEncoderEnum.AC3, AudioEncoderEnum.OPUS],
    }
  },

  [FormatEnum.MOV]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264,
        VideoEncoderEnum.H265,
        VideoEncoderEnum.PRORES,
        VideoEncoderEnum.MJPEG, VideoEncoderEnum.MPEG4
      ],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.ALAC, AudioEncoderEnum.PCM_S16LE],

    }
  },

  [FormatEnum.MKV]: {
    video: {
      allowedEncoders: [
        VideoEncoderEnum.H264, VideoEncoderEnum.H265, VideoEncoderEnum.AV1,
        VideoEncoderEnum.VP9, VideoEncoderEnum.MPEG4, VideoEncoderEnum.MPEG2VIDEO
      ],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.MP3, AudioEncoderEnum.AC3, AudioEncoderEnum.FLAC, AudioEncoderEnum.VORBIS, AudioEncoderEnum.OPUS],

    }
  },

  [FormatEnum.WEBM]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.VP8, VideoEncoderEnum.VP9, VideoEncoderEnum.AV1],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.OPUS, AudioEncoderEnum.VORBIS],

    }
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
      allowedEncoders: [AudioEncoderEnum.MP3, AudioEncoderEnum.PCM_S16LE, AudioEncoderEnum.AC3],
    }
  },

  [FormatEnum.M4V]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.H264, VideoEncoderEnum.H265, VideoEncoderEnum.MPEG4],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.MP3, AudioEncoderEnum.AC3],
    }
  },

  [FormatEnum.ASF]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.MPEG4, VideoEncoderEnum.H264],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.WMAV2, AudioEncoderEnum.MP3, AudioEncoderEnum.AAC],
    }
  },

  [FormatEnum.FLV]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.H264],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.MP3],
    }
  },

  [FormatEnum.WMV]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.MPEG4, VideoEncoderEnum.H264],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.WMAV2, AudioEncoderEnum.MP3],

    }
  },

  [FormatEnum.GP3]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.H264, VideoEncoderEnum.H263, VideoEncoderEnum.MPEG4],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.AMR_NB, AudioEncoderEnum.AMR_WB],

    }
  },

  [FormatEnum.TS]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.H264, VideoEncoderEnum.H265, VideoEncoderEnum.MPEG2VIDEO],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.AC3, AudioEncoderEnum.MP2, AudioEncoderEnum.MP3],
    }
  },

  [FormatEnum.M2TS]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.H264, VideoEncoderEnum.H265, VideoEncoderEnum.MPEG2VIDEO],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.AC3, AudioEncoderEnum.MP2],
    }
  },

  [FormatEnum.MPG]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.MPEG2VIDEO],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.MP2, AudioEncoderEnum.AC3, AudioEncoderEnum.MP3],

    }
  },

  [FormatEnum.VOB]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.MPEG2VIDEO],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.PCM_S16BE, AudioEncoderEnum.AC3, AudioEncoderEnum.MP2],

    }
  },

  [FormatEnum.OGV]: {
    video: {
      allowedEncoders: [VideoEncoderEnum.THEORA],
    },
    audio: {
      allowedEncoders: [AudioEncoderEnum.VORBIS, AudioEncoderEnum.OPUS],

    }
  },
  [FormatEnum.M4A]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.ALAC],

    }
  },
  [FormatEnum.M4B]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.ALAC],

    }
  },
  [FormatEnum.M4R]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC],
    }
  },

  //audo
  [FormatEnum.MP3]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.MP3],
    }
  },
  [FormatEnum.AAC]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC],
    }
  },
  [FormatEnum.WAV]: {
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.PCM_S16LE, AudioEncoderEnum.PCM_S24LE, AudioEncoderEnum.PCM_S32LE,
        AudioEncoderEnum.PCM_F32LE, AudioEncoderEnum.PCM_F64LE, AudioEncoderEnum.PCM_U8,
        AudioEncoderEnum.PCM_ALAW, AudioEncoderEnum.PCM_MULAW, AudioEncoderEnum.ADPCM_MS, AudioEncoderEnum.ADPCM_IMA_WAV
      ],
    }
  },
  [FormatEnum.AIFF]: {
    audio: {
      allowedEncoders: [
        AudioEncoderEnum.PCM_S16BE, AudioEncoderEnum.PCM_S24BE, AudioEncoderEnum.PCM_S32BE,
        AudioEncoderEnum.PCM_F32BE, AudioEncoderEnum.PCM_F64BE
      ],

    }
  },
  [FormatEnum.FLAC]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.FLAC],

    }
  },
  [FormatEnum.OGG]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.OPUS, AudioEncoderEnum.VORBIS, AudioEncoderEnum.FLAC],

    }
  },
  [FormatEnum.AC3]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AC3],
    }
  },
  [FormatEnum.EAC3]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.EAC3],
    }
  },
  [FormatEnum.AMR]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AMR_NB, AudioEncoderEnum.AMR_WB],
    }
  },
  [FormatEnum.MP2]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.MP2],

    }
  },
  [FormatEnum.APE]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.APE],

    }
  },
  [FormatEnum.CAF]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.AAC, AudioEncoderEnum.ALAC, AudioEncoderEnum.PCM_S16BE],

    }
  },

  [FormatEnum.OPUS]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.OPUS],
    }
  },

  [FormatEnum.WMA]: {
    audio: {
      allowedEncoders: [AudioEncoderEnum.WMAV2, AudioEncoderEnum.MP3],
    }
  },

  [FormatEnum.PNG]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.PNG],
    }
  },
  [FormatEnum.JPG]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.JPEG],
    }
  },
  [FormatEnum.WEBP]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.WEBP],
    }
  },
  [FormatEnum.AVIF]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.AVIF],
    }
  },
  [FormatEnum.GIF]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.GIF],
    }
  },
  [FormatEnum.HEIC]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.HEIC],
    }
  },
  [FormatEnum.TIFF]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.TIFF],
    }
  },
  [FormatEnum.BMP]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.BMP],
    }
  },
  [FormatEnum.ICO]: {
    image: {
      allowedEncoders: [ImageEncoderEnum.ICO],
    }
  },
};

export const formatToDefinition = new Map<string, ContainerDefinition>(Object.entries(CONTAINER_DEFINITIONS));

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

/**
 * Get valid video encoders for a given Container Group
 */
export function getValidVideoEncoders(group: string): VideoEncoderEnum[] {
  const caps = CONTAINER_DEFINITIONS[group];
  if (caps?.video) {
    return caps.video.allowedEncoders;
  }
  // Fallback default
  return [VideoEncoderEnum.H264, VideoEncoderEnum.H265];
}

/**
 * Get valid audio encoders for a given Container Group
 */
export function getValidAudioEncoders(group: string): AudioEncoderEnum[] {
  const caps = CONTAINER_DEFINITIONS[group];
  if (caps?.audio) {
    return caps.audio.allowedEncoders;
  }
  return [AudioEncoderEnum.AAC, AudioEncoderEnum.MP3];
}

export function getDefaultVideoEncoder(group: string): VideoEncoderEnum {
  return CONTAINER_DEFINITIONS[group]?.video?.allowedEncoders[0] ?? VideoEncoderEnum.H264;
}

export function getDefaultAudioEncoder(group: string): AudioEncoderEnum {
  return CONTAINER_DEFINITIONS[group]?.audio?.allowedEncoders[0] ?? AudioEncoderEnum.AAC;
}

// ================= OPTION HELPERS =================

const parseResolution = (res: string) => {
  const match = res.match(/(\d+)x(\d+)/);
  if (!match) return null;
  return { w: parseInt(match[1]), h: parseInt(match[2]) };
};

export function getVideoOptionsByEncoder(encoderId?: string): VideoEncoderOptions {
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
  const colorSpaces = allowedColorSpaces && allowedColorSpaces.length > 0
    ? COLOR_SPACES.filter((option) => allowedColorSpaces.includes(option.value))
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

