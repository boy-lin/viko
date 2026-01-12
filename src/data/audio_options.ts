import { SelectOption } from "@/types/options";

export const AUDIO_BITRATES: SelectOption[] = [
  { value: "auto", label: "Smart Fit" },
  { value: "320", label: "320 kbps" },
  { value: "256", label: "256 kbps" },
  { value: "224", label: "224 kbps" },
  { value: "192", label: "192 kbps" },
  { value: "160", label: "160 kbps" },
  { value: "128", label: "128 kbps" },
  { value: "96", label: "96 kbps" },
  { value: "64", label: "64 kbps" },
];

export const AUDIO_SAMPLE_RATES: SelectOption[] = [
  { value: "original", label: "Original" },
  { value: "48000", label: "48000 Hz" },
  { value: "44100", label: "44100 Hz" },
  { value: "32000", label: "32000 Hz" },
  { value: "22050", label: "22050 Hz" },
  { value: "auto", label: "Smart Fit" },
];

export const AUDIO_CHANNELS: SelectOption[] = [
  { value: "original", label: "Original" },
  { value: "2", label: "Stereo" },
  { value: "1", label: "Mono" },
  { value: "auto", label: "Smart Fit" },
];
