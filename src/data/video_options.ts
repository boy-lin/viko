import { ColorSpaceOption, SelectOption } from "@/types/options";
import { EncoderEnum } from "@/types/options";

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
    supportedEncoders: [EncoderEnum.H264, EncoderEnum.H265],
  },
  {
    value: "rec2100hlg",
    label: "HDR-Rec.2100HLG",
    description: "High Dynamic Range (Rec. 2100 HLG)",
    supportedEncoders: [EncoderEnum.H264, EncoderEnum.H265],
  },
  {
    value: "rec2100pq",
    label: "HDR-Rec.2100PQ",
    description: "High Dynamic Range (Rec. 2100 PQ)",
    supportedEncoders: [EncoderEnum.H264, EncoderEnum.H265],
  },
];

export const VIDEO_BITRATES: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "5000", label: "5000 kbps" },
  { value: "2000", label: "2000 kbps" },
  { value: "1000", label: "1000 kbps" },
];

export const VIDEO_QUALITIES: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "18", label: "超清 (CRF 18)" },
  { value: "23", label: "高清 (CRF 23)" },
  { value: "28", label: "标清 (CRF 28)" },
];


