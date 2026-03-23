import ConversionAudioLinear from "@/components/icons/ConversionAudioLinear";
import ConversionVideoLinear from "@/components/icons/ConversionVideoLinear";
import ConversionImageLinear from "@/components/icons/ConversionImageLinear";

import SeityMetadata from "@/components/icons/SeityMetadata";
import CompressionVideoLinear from "@/components/icons/CompressionVideoLinear";
import CompressionAudioLinear from "@/components/icons/CompressionAudioLinear";
import CompressionImageLinear from "@/components/icons/CompressionImageLinear";
import { GlassWater } from "lucide-react";

export type QuickAccessItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeGradient?: string;
  href?: string;
};

export enum MenuItems {
  home = "/",
  aiTools = "",
  myFiles = "/my/files",

  converter = "/converter",
  denoise = "/denoise",
  compressor = "/compressor",

  metadata = "/metadata",
  watermark = "/watermark",

  tasks = "/tasks",

  batch = "/batch",
}

export const QUICK_ACCESS_CONFIG: QuickAccessItem[] = [
  {
    label: "quick.converter",
    icon: ConversionVideoLinear,
    color: "bg-indigo-50 text-indigo-600",
    activeGradient: "from-[#8B5CF6] to-[#6366F1]",
    href: MenuItems.converter,
  },
  {
    label: "quick.denoise",
    icon: ConversionAudioLinear,
    color: "bg-emerald-50 text-emerald-600",
    activeGradient: "from-[#10B981] to-[#059669]",
    href: MenuItems.denoise,
  },
  {
    label: "quick.metadata",
    icon: SeityMetadata,
    color: "bg-sky-50 text-sky-600",
    activeGradient: "from-[#06B6D4] to-[#3B82F6]",
    href: MenuItems.metadata,
  },
  {
    label: "quick.compressor",
    icon: CompressionImageLinear,
    color: "bg-rose-50 text-rose-600",
    activeGradient: "from-[#F43F5E] to-[#F97316]",
    href: MenuItems.compressor,
  },
  {
    label: "quick.watermark",
    icon: GlassWater,
    color: "bg-rose-50 text-rose-600",
    activeGradient: "from-[#F43F5E] to-[#F97316]",
    href: MenuItems.watermark,
  },
];
