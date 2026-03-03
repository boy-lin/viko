import { ColorSpaceOption, SelectOption } from "@/types/options";

/**
 * 颜色空间选项
 * 注意：HDR 颜色空间仅在 H.264 或 HEVC 编码时可用，且不支持 GPU 加速
 */
export const COLOR_SPACES: ColorSpaceOption[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Automatically select color space",
  },
  {
    value: "rec709",
    label: "SDR-Rec.709",
    description: "Standard Dynamic Range (Rec. 709)",
  },
  {
    value: "rec2100hlg",
    label: "HDR-Rec.2100HLG",
    description: "High Dynamic Range (Rec. 2100 HLG)",
  },
  {
    value: "rec2100pq",
    label: "HDR-Rec.2100PQ",
    description: "High Dynamic Range (Rec. 2100 PQ)",
  },
];

export const VIDEO_BITRATES: SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "256", label: "256 kbps" },
  { value: "500", label: "500 kbps" },
  { value: "800", label: "800 kbps" },
  { value: "1000", label: "1000 kbps" },
  { value: "1500", label: "1500 kbps" },
  { value: "2000", label: "2000 kbps" },
  { value: "2500", label: "2500 kbps" },
  { value: "4000", label: "4000 kbps" },
  { value: "5000", label: "5000 kbps" },
  { value: "6000", label: "6000 kbps" },
  { value: "8000", label: "8000 kbps" },
  { value: "20000", label: "20000 kbps" },
];

export const VIDEO_QUALITIES: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "18", label: "超清 (CRF 18)" },
  { value: "23", label: "高清 (CRF 23)" },
  { value: "28", label: "标清 (CRF 28)" },
];

export const GOP_OPTIONS: SelectOption[] = [
  { value: "12", label: "12" },
  { value: "15", label: "15" },
  { value: "18", label: "18" },
  { value: "24", label: "24" },
  { value: "30", label: "30" },
  { value: "48", label: "48" },
  { value: "60", label: "60" },
  { value: "120", label: "120" },
  { value: "250", label: "250" },
];
export const COLOR_DEPTHS: SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "8", label: "8-bit" },
  { value: "10", label: "10-bit" },
  { value: "12", label: "12-bit" },
];

export const VIDEO_PRESETS: SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "ultrafast", label: "ultrafast" },
  { value: "fast", label: "fast" },
  { value: "medium", label: "medium" },
  { value: "slow", label: "slow" },
];
