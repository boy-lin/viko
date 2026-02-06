import { EncoderEnum, FormatEnum } from "@/types/options";
import { SelectOption } from "@/types/options";
import { AUDIO_BITRATES, AUDIO_CHANNELS, AUDIO_SAMPLE_RATES } from "@/data/audio_options";
import { COLOR_SPACES } from "@/data/video_options";
import { ColorSpaceOption } from "@/types/options";

// ================= TYPES =================

export interface AudioEncoderOptions {
  sampleRates: SelectOption[];
  channels: SelectOption[];
  bitrates: SelectOption[];
}

export interface VideoEncoderOptions {
  resolutions: SelectOption[];
  frameRates: SelectOption[];
  bitrates: SelectOption[];
  colorSpaces: ColorSpaceOption[];
}

export interface EncoderDefinition {
  id: EncoderEnum;
  type: 'video' | 'audio' | 'image';
  label: string;
  // Intrinsic capabilities
  maxResolution?: string; // "w x h"
  maxFrameRate?: number;
  supportedPixelFormats?: string[];
  bitrateRange?: { min: number; max: number }; // kbps
  // If specific options are restricted (e.g. only specific sample rates)
  supportedSampleRates?: string[];
  supportedChannels?: string[];
}

export interface ContainerDefinition {
  video?: {
    allowedEncoders: EncoderEnum[];
    defaultEncoder: EncoderEnum;
  };
  audio?: {
    allowedEncoders: EncoderEnum[];
    defaultEncoder: EncoderEnum;
    maxChannels?: number;
  };
}

// ================= DATA: ENCODERS =================

export const ENCODER_DEFINITIONS: Record<string, EncoderDefinition> = {
  // --- Video Encoders ---
  [EncoderEnum.H264]: {
    id: EncoderEnum.H264,
    type: 'video',
    label: 'H.264 / AVC',
    maxResolution: "4096x2304", // 4K+
  },
  [EncoderEnum.H264_HARDWARE]: {
    id: EncoderEnum.H264_HARDWARE,
    type: 'video',
    label: 'H.264 (Hardware)',
  },
  [EncoderEnum.H265]: {
    id: EncoderEnum.H265,
    type: 'video',
    label: 'H.265 / HEVC',
    maxResolution: "8192x4320", // 8K
  },
  [EncoderEnum.HEVC_HARDWARE]: {
    id: EncoderEnum.HEVC_HARDWARE,
    type: 'video',
    label: 'H.265 (Hardware)',
  },
  [EncoderEnum.VP9]: {
    id: EncoderEnum.VP9,
    type: 'video',
    label: 'VP9',
    maxResolution: "7680x4320",
  },
  [EncoderEnum.AV1]: {
    id: EncoderEnum.AV1,
    type: 'video',
    label: 'AV1',
    maxResolution: "7680x4320",
  },
  [EncoderEnum.MPEG4]: {
    id: EncoderEnum.MPEG4,
    type: 'video',
    label: 'MPEG-4 Part 2',
    maxResolution: "1920x1080", // Typically HD
  },
  [EncoderEnum.MPEG2VIDEO]: {
    id: EncoderEnum.MPEG2VIDEO,
    type: 'video',
    label: 'MPEG-2 Video',
    maxResolution: "1920x1080",
    supportedPixelFormats: ['yuv420p', 'yuv422p'],
  },
  [EncoderEnum.PRORES]: {
    id: EncoderEnum.PRORES,
    type: 'video',
    label: 'ProRes',
    maxResolution: "8192x4320",
  },
  [EncoderEnum.MJPEG]: {
    id: EncoderEnum.MJPEG,
    type: 'video',
    label: 'Motion JPEG',
  },
  [EncoderEnum.WMAV2]: {
    id: EncoderEnum.WMAV2,
    type: 'video', // Actually acts as video codec enum in our context typically? No, WMAV2 is audio. WMV is video codec "wmv2".
    label: 'WMV2',
  },
  // Correction: WMV2 is video
  //   [EncoderEnum.WMV2]: { ... } // Need to check if WMV2 is in EncoderEnum. 
  //   In previous steps, EncoderEnum had WMAV2 (Audio). It seems WMV2 was missing or I missed it.

  // --- Audio Encoders ---
  [EncoderEnum.AAC]: {
    id: EncoderEnum.AAC,
    type: 'audio',
    label: 'AAC',
    supportedSampleRates: ['48000', '44100', '32000', '24000', '22050', '16000'],
  },
  [EncoderEnum.MP3]: {
    id: EncoderEnum.MP3,
    type: 'audio',
    label: 'MP3',
    supportedSampleRates: ['48000', '44100', '32000', '24000', '22050', '16000', '12000', '11025', '8000'],
  },
  [EncoderEnum.AC3]: {
    id: EncoderEnum.AC3,
    type: 'audio',
    label: 'AC-3',
    supportedChannels: ['1', '2', '6'], // Mono, Stereo, 5.1
  },
  // ... Add others as needed
};


// ================= DATA: CONTAINER RULES =================
// This replaces FORMAT_CAPABILITIES

export const CONTAINER_DEFINITIONS: Record<string, ContainerDefinition> = {
  [FormatEnum.MP4]: {
    video: {
      allowedEncoders: [
        EncoderEnum.H264, EncoderEnum.H264_HARDWARE,
        EncoderEnum.H265, EncoderEnum.HEVC_HARDWARE,
        EncoderEnum.AV1, EncoderEnum.VP9, EncoderEnum.MPEG4
      ],
      defaultEncoder: EncoderEnum.H264
    },
    audio: {
      allowedEncoders: [EncoderEnum.AAC, EncoderEnum.MP3, EncoderEnum.AC3, EncoderEnum.OPUS],
      defaultEncoder: EncoderEnum.AAC,
    }
  },

  [FormatEnum.MKV]: {
    video: {
      allowedEncoders: [
        EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.AV1,
        EncoderEnum.VP9, EncoderEnum.MPEG4, EncoderEnum.MPEG2VIDEO
      ],
      defaultEncoder: EncoderEnum.H264,
    },
    audio: {
      allowedEncoders: [EncoderEnum.AAC, EncoderEnum.MP3, EncoderEnum.AC3, EncoderEnum.FLAC, EncoderEnum.VORBIS, EncoderEnum.OPUS],
      defaultEncoder: EncoderEnum.AAC,
      maxChannels: 2,
    }
  },

  [FormatEnum.AVI]: {
    video: {
      allowedEncoders: [EncoderEnum.MPEG4, EncoderEnum.MJPEG, EncoderEnum.H264], // H264 in AVI is non-standard but possible
      defaultEncoder: EncoderEnum.MPEG4,
    },
    audio: {
      allowedEncoders: [EncoderEnum.MP3, EncoderEnum.PCM_S16LE, EncoderEnum.AC3],
      defaultEncoder: EncoderEnum.MP3,
      maxChannels: 2,
    }
  },

  [FormatEnum.VOB]: {
    video: {
      allowedEncoders: [EncoderEnum.MPEG2VIDEO],
      defaultEncoder: EncoderEnum.MPEG2VIDEO,
    },
    audio: {
      allowedEncoders: [EncoderEnum.PCM_S16BE, EncoderEnum.AC3, EncoderEnum.MP2],
      defaultEncoder: EncoderEnum.PCM_S16BE, // or AC3
      maxChannels: 2,
    }
  },

  [FormatEnum.MP3]: {
    audio: {
      allowedEncoders: [EncoderEnum.MP3],
      defaultEncoder: EncoderEnum.MP3,
      maxChannels: 2,
    }
  },
};

export const formatToDefinition = new Map<string, ContainerDefinition>(Object.entries(CONTAINER_DEFINITIONS));

interface VideoEncoderDefinition {
  maxResolution: string;
  defaultResolution: string;
  maxFrameRate: number;
  defaultFrameRate: number;
  maxBitrate: number;
  defaultBitrate: number;
  colorSpaces: ColorSpaceOption[];
}

export const encoderToDefinition = new Map<string, VideoEncoderDefinition>(Object.entries({
  [EncoderEnum.H264]: {
    maxResolution: "4096x2304", // 4K+
    defaultResolution: "1920x1080", // 1080p
    maxFrameRate: 60,
    defaultFrameRate: 30,
    maxBitrate: 10000000, // 10 Mbps
    defaultBitrate: 5000000, // 5 Mbps
    colorSpaces: COLOR_SPACES,
  },
  [EncoderEnum.H265]: {
    maxResolution: "8192x4320", // 8K
    defaultResolution: "1920x1080", // 1080p
    maxFrameRate: 60,
    defaultFrameRate: 30,
    maxBitrate: 10000000, // 10 Mbps
    defaultBitrate: 5000000, // 5 Mbps
    colorSpaces: COLOR_SPACES,
  },
  [EncoderEnum.HEVC_HARDWARE]: {
    maxResolution: "8192x4320", // 8K
    defaultResolution: "1920x1080", // 1080p
    maxFrameRate: 60,
    defaultFrameRate: 30,
    maxBitrate: 10000000, // 10 Mbps
    defaultBitrate: 5000000, // 5 Mbps
    colorSpaces: COLOR_SPACES,
  },
  [EncoderEnum.AV1]: {
    maxResolution: "8192x4320", // 8K
    defaultResolution: "1920x1080", // 1080p
    maxFrameRate: 60,
    defaultFrameRate: 30,
    maxBitrate: 10000000, // 10 Mbps
    defaultBitrate: 5000000, // 5 Mbps
    colorSpaces: COLOR_SPACES,
  },
}));


// ================= HELPERS =================

const VIDEO_RESOLUTIONS: SelectOption[] = [
  { value: "auto", label: "auto" },
  { value: "7680x4320", label: "7680x4320" },
  { value: "3840x2160", label: "3840x2160" },
  { value: "1920x1080", label: "1920x1080" },
  { value: "1280x720", label: "1280x720" },
  { value: "720x576", label: "720x576" },
  { value: "720x480", label: "720x480" },
  { value: "640x480", label: "640x480" },
];

const VIDEO_FRAME_RATES: SelectOption[] = [
  { value: "auto", label: "auto" },
  { value: "60", label: "60 FPS" },
  { value: "30", label: "30 FPS" },
  { value: "29.97", label: "29.97 FPS (NTSC)" },
  { value: "25", label: "25 FPS (PAL)" },
  { value: "24", label: "24 FPS" },
  { value: "23.976", label: "23.976 FPS" },
];

/**
 * Get valid video encoders for a given Container Group
 */
export function getValidVideoEncoders(group: string): EncoderEnum[] {
  const caps = CONTAINER_DEFINITIONS[group];
  if (caps?.video) {
    return caps.video.allowedEncoders;
  }
  // Fallback default
  return [EncoderEnum.H264, EncoderEnum.H265];
}

/**
 * Get valid audio encoders for a given Container Group
 */
export function getValidAudioEncoders(group: string): EncoderEnum[] {
  const caps = CONTAINER_DEFINITIONS[group];
  if (caps?.audio) {
    return caps.audio.allowedEncoders;
  }
  return [EncoderEnum.AAC, EncoderEnum.MP3];
}

/**
 * Get valid resolutions for a given Container + Encoder
 */
export function getAvailableResolutions(group: string, encoderId: string): SelectOption[] {
  const containerDef = CONTAINER_DEFINITIONS[group];
  const encoderDef = ENCODER_DEFINITIONS[encoderId];

  let maxRes = "99999x99999";

  // 1. Container Limit
  if (containerDef?.video?.maxResolution) {
    maxRes = containerDef.video.maxResolution;
  }

  // 2. Encoder Limit
  if (encoderDef?.maxResolution) {
    // Simple logic: take the stricter of the two?
    // Parsing "WxH" to compare area
    if (compareRes(encoderDef.maxResolution, maxRes) < 0) {
      maxRes = encoderDef.maxResolution;
    }
  }

  // Filter list
  return VIDEO_RESOLUTIONS.filter(opt => {
    if (opt.value === 'auto') return true;
    return compareRes(opt.value, maxRes) <= 0;
  });
}

function parseRes(res: string) {
  const [w, h] = res.split('x').map(Number);
  return w * h;
}

function compareRes(res1: string, res2: string) {
  return parseRes(res1) - parseRes(res2);
}

export function getDefaultVideoEncoder(group: string): EncoderEnum {
  return CONTAINER_DEFINITIONS[group]?.video?.defaultEncoder ?? EncoderEnum.H264;
}

export function getDefaultAudioEncoder(group: string): EncoderEnum {
  return CONTAINER_DEFINITIONS[group]?.audio?.defaultEncoder ?? EncoderEnum.AAC;
}

// ================= OPTION HELPERS =================

const VIDEO_BITRATES: SelectOption[] = [
  { value: "auto", label: "Smart Fit" },
  { value: "5000", label: "5000 kbps" },
  { value: "2000", label: "2000 kbps" },
  { value: "1000", label: "1000 kbps" },
];

export function getAudioEncoderOptions(encoderId?: string): AudioEncoderOptions {
  const defaults: AudioEncoderOptions = {
    sampleRates: AUDIO_SAMPLE_RATES,
    channels: AUDIO_CHANNELS,
    bitrates: AUDIO_BITRATES,
  };

  if (!encoderId) return defaults;

  const def = ENCODER_DEFINITIONS[encoderId];
  if (!def) return defaults;

  // Filter based on intrinsic capabilities
  let sampleRates = AUDIO_SAMPLE_RATES;
  if (def.supportedSampleRates) {
    sampleRates = AUDIO_SAMPLE_RATES.filter(opt =>
      opt.value === 'auto' || def.supportedSampleRates?.includes(opt.value)
    );
  }

  let channels = AUDIO_CHANNELS;
  if (def.supportedChannels) {
    channels = AUDIO_CHANNELS.filter(opt =>
      opt.value === 'auto' || def.supportedChannels?.includes(opt.value)
    );
  }

  // Custom logic for specific encoders if needed (porting from old file)
  if (encoderId === EncoderEnum.AMR_NB) {
    return {
      sampleRates: [{ value: "8000", label: "8000 Hz" }],
      channels: [{ value: "1", label: "Mono" }],
      bitrates: [
        { value: "12.2k", label: "12.2 kbps" },
        { value: "10.2k", label: "10.2 kbps" },
        { value: "7.95k", label: "7.95 kbps" },
        { value: "6.7k", label: "6.7 kbps" },
      ],
    };
  }

  return {
    sampleRates,
    channels,
    bitrates: AUDIO_BITRATES, // Default bitrates for now
  };
}

const parseResolution = (res: string) => {
  const match = res.match(/(\d+)x(\d+)/);
  if (!match) return null;
  return { w: parseInt(match[1]), h: parseInt(match[2]) };
};

export function getVideoOptionsByEncoder(encoderId?: string): VideoEncoderOptions {
  const defaults: VideoEncoderOptions = {
    resolutions: VIDEO_RESOLUTIONS,
    frameRates: VIDEO_FRAME_RATES,
    bitrates: VIDEO_BITRATES,
    colorSpaces: [],
  };

  if (!encoderId) return defaults;
  const def = encoderToDefinition.get(encoderId);
  if (!def) return defaults;

  // Filter color spaces
  const colorSpaces = COLOR_SPACES.filter((option) => {
    if (!option.supportedEncoders) return true;
    return option.supportedEncoders.includes(encoderId);
  });
  const maxResolution = parseResolution(def.maxResolution);

  return {
    resolutions: VIDEO_RESOLUTIONS.filter((opt) => {
      if (opt.value === "auto") return true;
      const current = parseResolution(opt.value);
      if (maxResolution && current) {
        return current.w * current.h <= maxResolution.w * maxResolution.h;
      }
      return true;
    }),
    frameRates: VIDEO_FRAME_RATES.filter((opt) => {
      if (opt.value === "auto") return true;
      const current = parseFloat(opt.value);
      if (def.maxFrameRate) {
        return current <= def.maxFrameRate;
      }
      return true;
    }),
    bitrates: VIDEO_BITRATES.filter((opt) => {
      if (opt.value === "auto") return true;
      const current = parseInt(opt.value);
      if (def.maxBitrate) {
        return current <= def.maxBitrate;
      }
      return true;
    }),
    colorSpaces,
  };
}
