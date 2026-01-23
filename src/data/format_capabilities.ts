import { EncoderEnum } from "@/types/options";

export interface FormatCapability {
  encoders?: string[]; // Allowed encoders
  resolutions?: string[]; // Allowed or suggested resolutions
  maxResolution?: string; // Max resolution limit, e.g. "3840x2160"
  maxFrameRate?: string; // Max frame rate, e.g. "60"
  defaultEncoder?: string; // Default encoder when switching to this format
  defaultAudioEncoder?: string; // Default audio encoder when switching to this format
}

export const FORMAT_CAPABILITIES: Record<string, FormatCapability> = {
  // ================= VIDEO GENERIC =================
  "MP4": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.AV1, EncoderEnum.VP9, EncoderEnum.MPEG4],
    defaultEncoder: EncoderEnum.H264,
  },
  "HEVC MP4": {
    encoders: [EncoderEnum.H265],
    defaultEncoder: EncoderEnum.H265,
  },
  "MOV": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.PRORES, EncoderEnum.MPEG4],
    defaultEncoder: EncoderEnum.H264,
  },
  "MKV": {
    // MKV supports almost everything
    encoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.AV1, EncoderEnum.VP9, EncoderEnum.MPEG4, EncoderEnum.MPEG2VIDEO],
    defaultEncoder: "h264",
  },
  "HEVC MKV": {
    encoders: [EncoderEnum.H265],
    defaultEncoder: "hevc",
  },
  "AVI": {
    encoders: [EncoderEnum.H264, EncoderEnum.MPEG4, EncoderEnum.MJPEG],
    defaultEncoder: EncoderEnum.MPEG4,
  },
  "WMV": {
    encoders: [EncoderEnum.WMAV2], // ffmpeg usually uses standard wmv codecs
    defaultEncoder: EncoderEnum.WMAV2,
  },
  "WebM": {
    encoders: [EncoderEnum.VP9, EncoderEnum.VP8, EncoderEnum.AV1],
    defaultEncoder: EncoderEnum.VP9,
  },
  "FLV": {
    encoders: [EncoderEnum.H264, EncoderEnum.PCM_F64LE],
    defaultEncoder: EncoderEnum.PCM_F64LE,
  },
  "3GP": {
    encoders: [EncoderEnum.H263, EncoderEnum.H264, EncoderEnum.MPEG4],
    defaultEncoder: EncoderEnum.H263,
    maxResolution: "352x288", // CIF
  },
  // Legacy
  // "MPEG-1": {
  //   encoders: [EncoderEnum.MPEG1VIDEO],
  //   defaultEncoder: EncoderEnum.MPEG1VIDEO,
  // },
  "MPEG-2": {
    encoders: [EncoderEnum.MPEG2VIDEO],
    defaultEncoder: EncoderEnum.MPEG2VIDEO,
  },
  // Unsupported audio codec. Must be one of mp1, mp2, mp3, 16-bit pcm_dvd, pcm_s16be, ac3 or dts.
  "VOB": {
    encoders: [EncoderEnum.MPEG2VIDEO],
    defaultEncoder: EncoderEnum.MPEG2VIDEO,
    defaultAudioEncoder: EncoderEnum.PCM_S16BE,
  },
  "OGV": {
    encoders: [EncoderEnum.THEORA],
    defaultEncoder: EncoderEnum.THEORA,
  },

  // ================= DEVICES =================
  "Apple": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265],
    defaultEncoder: EncoderEnum.H264,
  },
  "Android": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.VP9],
    defaultEncoder: EncoderEnum.H264,
  },

  // ================= SOCIAL =================
  "YouTube": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.VP9],
    defaultEncoder: EncoderEnum.H264,
  },
  "Facebook": {
    encoders: [EncoderEnum.H264],
    defaultEncoder: EncoderEnum.H264,
  },
  "Instagram": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265],
    defaultEncoder: "h264",
  },
  "TikTok": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265],
    defaultEncoder: EncoderEnum.H264,
  },
  "Twitter": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265],
    defaultEncoder: EncoderEnum.H264,
  },
  "Discord": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.VP9], // Discord supports webm too
    defaultEncoder: EncoderEnum.H264,
  },

  // ================= EDITORS =================
  "Premiere Pro": {
    encoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.PRORES],
    defaultEncoder: EncoderEnum.H264,
  },
  "Final Cut Pro": {
    encoders: [EncoderEnum.PRORES, EncoderEnum.H264, EncoderEnum.H265],
    defaultEncoder: EncoderEnum.PRORES,
  },
};

// Fallback capability if group not found
export const DEFAULT_CAPABILITY: FormatCapability = {
  encoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.VP9, EncoderEnum.MPEG4],
  defaultEncoder: EncoderEnum.H264,
};
