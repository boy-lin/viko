import { EncoderOption, EncoderEnum, FormatEnum } from "@/types/options";

export const AUDIO_ENCODERS: EncoderOption[] = [
  {
    value: EncoderEnum.AUTO,
    label: "Auto",
    description: "Automatically select best encoder",
  },
  { value: EncoderEnum.COPY, label: "Copy", description: "Direct stream copy" },
  {
    value: EncoderEnum.AAC,
    label: "AAC",
    description: "Advanced Audio Coding",
    formats: [
      FormatEnum.MP4,
      FormatEnum.MOV,
      FormatEnum.MKV,
      FormatEnum.M4A,
      FormatEnum.GP3,
      FormatEnum.AAC,
    ],
  },
  {
    value: EncoderEnum.MP3,
    label: "MP3 (LAME)",
    description: "MP3 Audio",
    formats: [
      FormatEnum.MP3,
      FormatEnum.MP4,
      FormatEnum.MKV,
      FormatEnum.AVI,
      FormatEnum.MOV,
    ],
  },
  {
    value: EncoderEnum.OPUS,
    label: "Opus",
    description: "Opus Audio",
    formats: [FormatEnum.OGG, FormatEnum.WEBM, FormatEnum.MKV, FormatEnum.MP4],
  },
  {
    value: EncoderEnum.FLAC,
    label: "FLAC",
    description: "Free Lossless Audio Codec",
    formats: [
      FormatEnum.FLAC,
      FormatEnum.OGG,
      FormatEnum.MKV,
      FormatEnum.MP4,
      FormatEnum.MOV,
    ],
  },
  {
    value: EncoderEnum.ALAC,
    label: "ALAC",
    description: "Apple Lossless Audio Codec",
    formats: [FormatEnum.M4A, FormatEnum.MOV, FormatEnum.MP4, FormatEnum.MKV],
  },
  {
    value: EncoderEnum.VORBIS,
    label: "Vorbis",
    description: "Vorbis Audio",
    formats: [FormatEnum.OGG, FormatEnum.WEBM, FormatEnum.MKV, FormatEnum.MP4],
  },
  {
    value: EncoderEnum.AC3,
    label: "AC-3",
    description: "Dolby Digital",
    formats: [
      FormatEnum.AC3,
      FormatEnum.MP4,
      FormatEnum.MKV,
      FormatEnum.MOV,
      FormatEnum.AVI,
    ],
  },
  {
    value: EncoderEnum.EAC3,
    label: "E-AC-3",
    description: "Dolby Digital Plus",
    formats: [FormatEnum.EAC3, FormatEnum.MP4, FormatEnum.MKV, FormatEnum.MOV],
  },
  {
    value: EncoderEnum.PCM_S16LE,
    label: "PCM 16-bit",
    description: "Uncompressed PCM 16-bit",
    formats: [
      FormatEnum.WAV,
      FormatEnum.AIFF,
      FormatEnum.MOV,
      FormatEnum.MKV,
      FormatEnum.AVI,
    ],
  },
  {
    value: EncoderEnum.PCM_S24LE,
    label: "PCM 24-bit",
    description: "Uncompressed PCM 24-bit",
    formats: [
      FormatEnum.WAV,
      FormatEnum.AIFF,
      FormatEnum.MOV,
      FormatEnum.MKV,
      FormatEnum.AVI,
    ],
  },
];

export const VIDEO_ENCODERS: EncoderOption[] = [
  {
    value: EncoderEnum.AUTO,
    label: "Auto",
    description: "Automatically select best encoder",
  },
  { value: EncoderEnum.COPY, label: "Copy", description: "Direct stream copy" },
  {
    value: EncoderEnum.H264,
    label: "H.264 / AVC",
    description: "Most common, high compatibility",
  },
  {
    value: EncoderEnum.H265,
    label: "H.265 / HEVC",
    description: "High efficiency, smaller file size",
  },
  {
    value: EncoderEnum.H264_HARDWARE,
    label: "H.264 (Hardware)",
    description: "Apple Silicon Hardware Acceleration",
  },
  {
    value: EncoderEnum.HEVC_HARDWARE,
    label: "H.265 (Hardware)",
    description: "Apple Silicon Hardware Acceleration",
  },
  { value: EncoderEnum.PRORES, label: "ProRes", description: "Apple ProRes" },
  { value: EncoderEnum.VP9, label: "VP9", description: "Google VP9" },
  { value: EncoderEnum.AV1, label: "AV1", description: "AOMedia Video 1" },
];

export const IMAGE_ENCODERS: EncoderOption[] = [
  {
    value: EncoderEnum.JPEG,
    label: "JPEG",
    description: "JPEG Image",
  },
  {
    value: EncoderEnum.PNG,
    label: "PNG",
    description: "PNG Image",
  },
  {
    value: EncoderEnum.WEBP,
    label: "WEBP",
    description: "WEBP Image",
  },
  {
    value: EncoderEnum.HEIC,
    label: "HEIC",
    description: "HEIC Image",
  },
  {
    value: EncoderEnum.GIF,
    label: "GIF",
    description: "GIF Image",
  },
  {
    value: EncoderEnum.TIFF,
    label: "TIFF",
    description: "TIFF Image",
  },
  {
    value: EncoderEnum.BMP,
    label: "BMP",
    description: "BMP Image",
  },
  {
    value: EncoderEnum.JPEG2000,
    label: "JPEG 2000",
    description: "JPEG 2000 Image",
  },
  {
    value: EncoderEnum.AVIF,
    label: "AVIF",
    description: "AVIF Image",
  },
]

