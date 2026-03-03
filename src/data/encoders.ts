import { EncoderOption, EncoderEnum } from "@/types/options";

export const AUDIO_ENCODERS: EncoderOption[] = [
  {
    value: EncoderEnum.AUTO,
    label: "Auto",
    description: "Automatically select best encoder",
  },
  {
    value: EncoderEnum.AAC,
    label: "AAC",
    description: "Advanced Audio Coding",
  },
  {
    value: EncoderEnum.MP3,
    label: "MP3 (LAME)",
    description: "MP3 Audio",
  },
  {
    value: EncoderEnum.OPUS,
    label: "Opus",
    description: "Opus Audio",
  },
  {
    value: EncoderEnum.FLAC,
    label: "FLAC",
    description: "Free Lossless Audio Codec",
  },
  {
    value: EncoderEnum.ALAC,
    label: "ALAC",
    description: "Apple Lossless Audio Codec",
  },
  {
    value: EncoderEnum.VORBIS,
    label: "Vorbis",
    description: "Vorbis Audio",
  },
  {
    value: EncoderEnum.AC3,
    label: "AC-3",
    description: "Dolby Digital",
    
  },
  {
    value: EncoderEnum.EAC3,
    label: "E-AC-3",
    description: "Dolby Digital Plus",
  },
  {
    value: EncoderEnum.PCM_S16LE,
    label: "PCM 16-bit",
    description: "Uncompressed PCM 16-bit",
    
  },
  {
    value: EncoderEnum.PCM_S24LE,
    label: "PCM 24-bit",
    description: "Uncompressed PCM 24-bit",
   
  },
  // {
  //   value: EncoderEnum.AMR_NB,
  //   label: "AMR NB",
  //   description: "AMR Narrowband",
  // },
  // {
  //   value: EncoderEnum.AMR_WB,
  //   label: "AMR WB",
  //   description: "AMR Wideband",
  // },
  {
    value: EncoderEnum.APE,
    label: "APE",
    description: "Monkey's Audio",
  },
  {
    value: EncoderEnum.MP2,
    label: "MP2",
    description: "MP2 Audio",
  },
  {
    value: EncoderEnum.WMAV2,
    label: "WMA V2",
    description: "Windows Media Audio 2",
  },
  {
    value: EncoderEnum.PCM_S16BE,
    label: "PCM 16-bit Big Endian",
    description: "Uncompressed PCM 16-bit Big Endian",
  },
  {
    value: EncoderEnum.PCM_S24BE,
    label: "PCM 24-bit Big Endian",
    description: "Uncompressed PCM 24-bit Big Endian",
  },
  {
    value: EncoderEnum.PCM_S32BE,
    label: "PCM 32-bit Big Endian",
    description: "Uncompressed PCM 32-bit Big Endian",
  },
  {
    value: EncoderEnum.PCM_F32BE,
    label: "PCM 32-bit Floating Point Big Endian",
    description: "Uncompressed PCM 32-bit Floating Point Big Endian",
  },
  {
    value: EncoderEnum.PCM_F64BE,
    label: "PCM 64-bit Floating Point Big Endian",
    description: "Uncompressed PCM 64-bit Floating Point Big Endian",
  },
  {
    value: EncoderEnum.PCM_ALAW,
    label: "PCM A-Law",
    description: "Uncompressed PCM A-Law",
  },
  {
    value: EncoderEnum.PCM_MULAW,
    label: "PCM μ-Law",
    description: "Uncompressed PCM μ-Law",
  },
  {
    value: EncoderEnum.ADPCM_MS,
    label: "ADPCM Microsoft",
    description: "ADPCM Microsoft",
  },
  {
    value: EncoderEnum.ADPCM_IMA_WAV,
    label: "ADPCM IMA WAV",
    description: "ADPCM IMA WAV",
  },
  {
    value: EncoderEnum.GSM_MS,
    label: "GSM Microsoft",
    description: "GSM Microsoft",
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
  { value: EncoderEnum.PRORES, label: "ProRes", description: "Apple ProRes" },

  { value: EncoderEnum.AV1, label: "AV1", description: "AOMedia Video 1" },
  { value: EncoderEnum.MJPEG, label: "MJPEG", description: "Motion JPEG" },
  { value: EncoderEnum.VP8, label: "VP8", description: "Google VP8" },
  { value: EncoderEnum.VP9, label: "VP9", description: "Google VP9" },
  { value: EncoderEnum.MPEG4, label: "MPEG4", description: "MPEG4 Video" },
  { value: EncoderEnum.MPEG2VIDEO, label: "MPEG2VIDEO", description: "MPEG2 Video" },
  { value: EncoderEnum.THEORA, label: "THEORA", description: "Theora Video" },
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
