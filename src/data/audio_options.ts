import { SelectOption } from "@/types/options";

export const AUDIO_BITRATES: SelectOption[] = [
  { value: "auto", label: "Smart Fit" },
  { value: "320k", label: "320 kbps" },
  { value: "256k", label: "256 kbps" },
  { value: "224k", label: "224 kbps" },
  { value: "192k", label: "192 kbps" },
  { value: "160k", label: "160 kbps" },
  { value: "128k", label: "128 kbps" },
  { value: "96k", label: "96 kbps" },
  { value: "64k", label: "64 kbps" },
  { value: "12.2k", label: "12.2 kbps" },
  { value: "7.95k", label: "7.95 kbps" },
  { value: "6.7k", label: "6.7 kbps" },
];

export const AUDIO_SAMPLE_RATES: SelectOption[] = [
  { value: "auto", label: "auto" },
  { value: "8000", label: "8000 Hz" },
  { value: "48000", label: "48000 Hz" },
  { value: "44100", label: "44100 Hz" },
  { value: "32000", label: "32000 Hz" },
  { value: "22050", label: "22050 Hz" },
  { value: "auto", label: "Smart Fit" },
];

export const AUDIO_CHANNELS: SelectOption[] = [
  { value: "auto", label: "auto" },
  { value: "2", label: "Stereo" },
  { value: "1", label: "Mono" },
  { value: "auto", label: "Smart Fit" },
];
