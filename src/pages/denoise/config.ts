import { DenoiseFilterConfig } from "@/lib/mediaTaskEvent";

export const DEFAULT_DENOISE_FILTER_CONFIG: DenoiseFilterConfig = {
  remove_low: true,
  remove_high: true,
  fft_denoise: true,
  noise_gate: true,
  low_cutoff_hz: 120,
  high_cutoff_hz: 8000,
  fft_nr: 12,
  fft_nf: -25,
  gate_threshold: 0.015,
  gate_ratio: 2.5,
  gate_attack_ms: 20,
  gate_release_ms: 250,
};

