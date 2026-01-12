import { ColorSpaceOption } from "@/types/options";
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
    supportedEncoders: [EncoderEnum.H264, EncoderEnum.H265, EncoderEnum.H264_HARDWARE, EncoderEnum.HEVC_HARDWARE],
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

