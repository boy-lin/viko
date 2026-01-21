import type { ColorSpaceOption, SelectOption } from "@/types/options";
import { EncoderEnum } from "@/types/options";
import { AUDIO_BITRATES, AUDIO_CHANNELS, AUDIO_SAMPLE_RATES } from "@/data/audio_options";
import { COLOR_SPACES } from "@/data/video_options";

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

const AUDIO_ONLY_AUTO: SelectOption[] = AUDIO_BITRATES.filter(
  (option) => option.value === "auto"
);

const AUDIO_AMR_NB_BITRATES: SelectOption[] = [
  { value: "12.2k", label: "12.2 kbps" },
  { value: "10.2k", label: "10.2 kbps" },
  { value: "7.95k", label: "7.95 kbps" },
  { value: "6.7k", label: "6.7 kbps" },
  { value: "5.9k", label: "5.9 kbps" },
  { value: "5.15k", label: "5.15 kbps" },
  { value: "4.75k", label: "4.75 kbps" },
];

const AUDIO_AMR_NB_SAMPLE_RATES: SelectOption[] = [
  { value: "8000", label: "8000 Hz" },
];

const AUDIO_AMR_NB_CHANNELS: SelectOption[] = [
  { value: "1", label: "Mono" },
];

const DEFAULT_AUDIO_OPTIONS: AudioEncoderOptions = {
  sampleRates: AUDIO_SAMPLE_RATES,
  channels: AUDIO_CHANNELS,
  bitrates: AUDIO_BITRATES,
};

const LOSSLESS_AUDIO_OPTIONS: AudioEncoderOptions = {
  sampleRates: AUDIO_SAMPLE_RATES,
  channels: AUDIO_CHANNELS,
  bitrates: AUDIO_ONLY_AUTO,
};

const AUDIO_ENCODER_OPTIONS: Record<string, AudioEncoderOptions> = {
  [EncoderEnum.AUTO]: DEFAULT_AUDIO_OPTIONS,
  [EncoderEnum.COPY]: DEFAULT_AUDIO_OPTIONS,
  [EncoderEnum.AAC]: DEFAULT_AUDIO_OPTIONS,
  [EncoderEnum.MP3]: DEFAULT_AUDIO_OPTIONS,
  [EncoderEnum.OPUS]: DEFAULT_AUDIO_OPTIONS,
  [EncoderEnum.VORBIS]: DEFAULT_AUDIO_OPTIONS,
  [EncoderEnum.AC3]: DEFAULT_AUDIO_OPTIONS,
  [EncoderEnum.EAC3]: DEFAULT_AUDIO_OPTIONS,
  [EncoderEnum.FLAC]: LOSSLESS_AUDIO_OPTIONS,
  [EncoderEnum.ALAC]: LOSSLESS_AUDIO_OPTIONS,
  [EncoderEnum.PCM_S16LE]: LOSSLESS_AUDIO_OPTIONS,
  [EncoderEnum.PCM_S24LE]: LOSSLESS_AUDIO_OPTIONS,
  [EncoderEnum.MP2]: {
    sampleRates: AUDIO_SAMPLE_RATES,
    channels: AUDIO_CHANNELS,
    bitrates: AUDIO_BITRATES,
  },
  [EncoderEnum.AMR_NB]: {
    sampleRates: AUDIO_AMR_NB_SAMPLE_RATES,
    channels: AUDIO_AMR_NB_CHANNELS,
    bitrates: AUDIO_AMR_NB_BITRATES,
  },
};

const VIDEO_RESOLUTIONS: SelectOption[] = [
  { value: "auto", label: "auto" },
  { value: "7680x4320", label: "7680x4320" },
  { value: "3840x2160", label: "3840x2160" },
  { value: "1920x1080", label: "1920x1080" },
  { value: "1280x720", label: "1280x720" },
  { value: "720x576", label: "720x576" },
];

const VIDEO_FRAME_RATES: SelectOption[] = [
  { value: "auto", label: "auto" },
  { value: "60", label: "60 FPS" },
  { value: "30", label: "30 FPS" },
  { value: "24", label: "24 FPS" },
  { value: "auto", label: "Smart Fit" },
];

const VIDEO_BITRATES: SelectOption[] = [
  { value: "auto", label: "Smart Fit" },
  { value: "5000", label: "5000 kbps" },
  { value: "2000", label: "2000 kbps" },
  { value: "1000", label: "1000 kbps" },
];

const DEFAULT_VIDEO_OPTIONS: VideoEncoderOptions = {
  resolutions: VIDEO_RESOLUTIONS,
  frameRates: VIDEO_FRAME_RATES,
  bitrates: VIDEO_BITRATES,
  colorSpaces: COLOR_SPACES,
};

const VIDEO_ENCODER_OPTIONS: Record<string, VideoEncoderOptions> = {
  [EncoderEnum.AUTO]: DEFAULT_VIDEO_OPTIONS,
  [EncoderEnum.COPY]: DEFAULT_VIDEO_OPTIONS,
  [EncoderEnum.H264]: DEFAULT_VIDEO_OPTIONS,
  [EncoderEnum.H265]: DEFAULT_VIDEO_OPTIONS,
  [EncoderEnum.H264_HARDWARE]: DEFAULT_VIDEO_OPTIONS,
  [EncoderEnum.HEVC_HARDWARE]: DEFAULT_VIDEO_OPTIONS,
  [EncoderEnum.PRORES]: DEFAULT_VIDEO_OPTIONS,
  [EncoderEnum.VP9]: DEFAULT_VIDEO_OPTIONS,
  [EncoderEnum.AV1]: DEFAULT_VIDEO_OPTIONS,
};

export const getAudioEncoderOptions = (encoder?: string): AudioEncoderOptions =>
  AUDIO_ENCODER_OPTIONS[encoder ?? ""] ?? DEFAULT_AUDIO_OPTIONS;

const filterColorSpaces = (encoder?: string): ColorSpaceOption[] => {
  if (!encoder) return COLOR_SPACES;
  return COLOR_SPACES.filter((option) => {
    if (!option.supportedEncoders) return true;
    return option.supportedEncoders.includes(encoder);
  });
};

export const getVideoEncoderOptions = (encoder?: string): VideoEncoderOptions => {
  const base = VIDEO_ENCODER_OPTIONS[encoder ?? ""] ?? DEFAULT_VIDEO_OPTIONS;
  return {
    ...base,
    colorSpaces: filterColorSpaces(encoder),
  };
};
