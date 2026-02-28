import { SelectOption } from "@/types/options";

export const AUDIO_BITRATES: SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "320", label: "320 kbps" },
  { value: "256", label: "256 kbps" },
  { value: "224", label: "224 kbps" },
  { value: "192", label: "192 kbps" },
  { value: "160", label: "160 kbps" },
  { value: "128", label: "128 kbps" },
  { value: "96", label: "96 kbps" },
  { value: "64", label: "64 kbps" },
  { value: "48", label: "48 kbps" },
  { value: "32", label: "32 kbps" },
  { value: "12.2", label: "12.2 kbps" },
  { value: "7.95", label: "7.95 kbps" },
  { value: "6.7", label: "6.7 kbps" },
];

export const AUDIO_SAMPLE_RATES: SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "8000", label: "8000 Hz" },
  { value: "11025", label: "11025 Hz" },
  { value: "12000", label: "12000 Hz" },
  { value: "16000", label: "16000 Hz" },
  { value: "48000", label: "48000 Hz" },
  { value: "44100", label: "44100 Hz" },
  { value: "32000", label: "32000 Hz" },
  { value: "22050", label: "22050 Hz" },
];

export const AUDIO_CHANNELS: SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "1", label: "Mono（1）" },
  { value: "2", label: "Stereo（2）" },
  { value: "3", label: "3.0（3）" },
  { value: "4", label: "4.0（4）" },
  { value: "5", label: "5.0（5）" },
  { value: "6", label: "6.0（6）" },
  { value: "7", label: "7.0（7）" },
  { value: "8", label: "8.0（8）" },
  { value: "9", label: "9.0（9）" },
  { value: "10", label: "10.0（10）" },
];
