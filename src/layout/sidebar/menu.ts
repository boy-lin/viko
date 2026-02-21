import ConversionLinear from "@/components/icons/ConversionLinear";
import SeityMetadata from "@/components/icons/SeityMetadata";
import CompressionLinear from "@/components/icons/CompressionLinear";
import PinLinear from "@/components/icons/PinLinear";

export type QuickAccessItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeGradient?: string;
  href?: string;
};

export enum MenuItems {
  home = '/',
  aiTools = '',
  myFiles = '/my/files',

  converterVideos = '/converter/videos',
  converterAudios = '/converter/audios',
  converterImages = '/converter/images',
  compressorVideos = '/compressor/videos',
  compressorAudios = '/compressor/audios',
  compressorImages = '/compressor/images',

  metadata = '/metadata',
  watermark = '/watermark',

  tasks = '/tasks',

  batch = '/batch',
}


export const QUICK_ACCESS_CONFIG: QuickAccessItem[] = [
  {
    label: "quick.converter_videos",
    icon: ConversionLinear,
    color: "bg-indigo-50 text-indigo-600",
    activeGradient: "from-[#8B5CF6] to-[#6366F1]",
    href: MenuItems.converterVideos,
  },
  {
    label: "quick.converter_audios",
    icon: ConversionLinear,
    color: "bg-indigo-50 text-indigo-600",
    activeGradient: "from-[#8B5CF6] to-[#6366F1]",
    href: MenuItems.converterAudios,
  },
  {
    label: "quick.converter_images",
    icon: ConversionLinear,
    color: "bg-indigo-50 text-indigo-600",
    activeGradient: "from-[#8B5CF6] to-[#6366F1]",
    href: MenuItems.converterImages,
  },
  {
    label: "quick.metadata",
    icon: SeityMetadata,
    color: "bg-sky-50 text-sky-600",
    activeGradient: "from-[#06B6D4] to-[#3B82F6]",
    href: MenuItems.metadata,
  },
  {
    label: "quick.compressor_videos",
    icon: CompressionLinear,
    color: "bg-rose-50 text-rose-600",
    activeGradient: "from-[#F43F5E] to-[#F97316]",
    href: MenuItems.compressorVideos,
  },
  {
    label: "quick.compressor_audios",
    icon: CompressionLinear,
    color: "bg-rose-50 text-rose-600",
    activeGradient: "from-[#F43F5E] to-[#F97316]",
    href: MenuItems.compressorAudios,
  },
  {
    label: "quick.compressor_images",
    icon: CompressionLinear,
    color: "bg-rose-50 text-rose-600",
    activeGradient: "from-[#F43F5E] to-[#F97316]",
    href: MenuItems.compressorImages,
  },
  {
    label: "quick.watermark",
    icon: PinLinear,
    color: "bg-rose-50 text-rose-600",
    activeGradient: "from-[#F43F5E] to-[#F97316]",
    href: MenuItems.watermark,
  }
];