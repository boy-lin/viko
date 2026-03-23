import type { ComponentType } from "react";
import ConversionAudioLinear from "@/components/icons/ConversionAudioLinear";
import ConversionVideoLinear from "@/components/icons/ConversionVideoLinear";
import SeityMetadata from "@/components/icons/SeityMetadata";
import CompressionImageLinear from "@/components/icons/CompressionImageLinear";
import HomeLinear from "@/components/icons/HomeLinear";
import FolderLinear from "@/components/icons/FolderLinear";
import AILinear from "@/components/icons/AILinear";
import { FileText, FileVideo, FolderOpen, Gauge, GlassWater, ListOrdered, Volume2 } from "lucide-react";

export const APP_PATHS = {
  home: "/",
  converter: "/converter",
  compressor: "/compressor",
  denoise: "/denoise",
  myFiles: "/my/files",
  tasks: "/tasks",
  metadata: "/metadata",
  watermark: "/watermark",
  forceUpdate: "/force-update",
} as const;

export type AppPathKey = keyof typeof APP_PATHS;

export type QuickAccessItem = {
  id: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  activeGradient?: string;
  href: string;
};

export type SidebarNavConfig = {
  id: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  disabled?: boolean;
};

export type HomeCommonFeature = {
  id: string;
  path: string;
  titleKey: string;
  descKey: string;
  icon: ComponentType<{ className?: string }>;
};

export type HomeNewFeature = {
  id: number;
  title: string;
  description: string;
  image: string;
  badge?: string;
  icon?: string;
  ai?: boolean;
  href?: string;
  disabled?: boolean;
  future?: boolean;
};

export type AppRouteConfig = {
  id: string;
  path: string;
  namespace?: string[];
  layout?: "root" | "standalone";
};

export const APP_ROUTE_CONFIGS: AppRouteConfig[] = [
  { id: "home", path: APP_PATHS.home, namespace: ["home"], layout: "root" },
  { id: "compressor", path: APP_PATHS.compressor, namespace: ["task"], layout: "root" },
  { id: "converter", path: APP_PATHS.converter, namespace: ["task"], layout: "root" },
  { id: "denoise", path: APP_PATHS.denoise, namespace: ["task"], layout: "root" },
  { id: "my-files", path: APP_PATHS.myFiles, layout: "root" },
  { id: "tasks", path: APP_PATHS.tasks, namespace: ["tasks"], layout: "root" },
  { id: "metadata", path: APP_PATHS.metadata, namespace: ["metadata"], layout: "root" },
  { id: "watermark", path: APP_PATHS.watermark, namespace: ["watermark"], layout: "root" },
  { id: "force-update", path: APP_PATHS.forceUpdate, namespace: ["common"], layout: "standalone" },
];

export const SIDEBAR_NAV_CONFIG: SidebarNavConfig[] = [
  { id: "home", labelKey: "nav.home", icon: HomeLinear, href: APP_PATHS.home },
  { id: "tasks", labelKey: "nav.tasks", icon: ListOrdered, href: APP_PATHS.tasks },
  { id: "my-files", labelKey: "nav.my_files", icon: FolderLinear, href: APP_PATHS.myFiles },
  { id: "ai-tools", labelKey: "nav.ai_tools", icon: AILinear, disabled: true },
];

export const QUICK_ACCESS_CONFIG: QuickAccessItem[] = [
  {
    id: "converter",
    labelKey: "quick.converter",
    icon: ConversionVideoLinear,
    color: "bg-indigo-50 text-indigo-600",
    activeGradient: "from-[#8B5CF6] to-[#6366F1]",
    href: APP_PATHS.converter,
  },
  {
    id: "denoise",
    labelKey: "quick.denoise",
    icon: ConversionAudioLinear,
    color: "bg-emerald-50 text-emerald-600",
    activeGradient: "from-[#10B981] to-[#059669]",
    href: APP_PATHS.denoise,
  },
  {
    id: "metadata",
    labelKey: "quick.metadata",
    icon: SeityMetadata,
    color: "bg-sky-50 text-sky-600",
    activeGradient: "from-[#06B6D4] to-[#3B82F6]",
    href: APP_PATHS.metadata,
  },
  {
    id: "compressor",
    labelKey: "quick.compressor",
    icon: CompressionImageLinear,
    color: "bg-rose-50 text-rose-600",
    activeGradient: "from-[#F43F5E] to-[#F97316]",
    href: APP_PATHS.compressor,
  },
  {
    id: "watermark",
    labelKey: "quick.watermark",
    icon: GlassWater,
    color: "bg-rose-50 text-rose-600",
    activeGradient: "from-[#F43F5E] to-[#F97316]",
    href: APP_PATHS.watermark,
  },
];

export const HOME_COMMON_FEATURES: HomeCommonFeature[] = [
  {
    id: "converter",
    path: APP_PATHS.converter,
    titleKey: "common.converter.title",
    descKey: "common.converter.desc",
    icon: FileVideo,
  },
  {
    id: "compressor",
    path: APP_PATHS.compressor,
    titleKey: "common.compressor.title",
    descKey: "common.compressor.desc",
    icon: Gauge,
  },
  {
    id: "watermark",
    path: APP_PATHS.watermark,
    titleKey: "common.watermark.title",
    descKey: "common.watermark.desc",
    icon: GlassWater,
  },
  {
    id: "denoise",
    path: APP_PATHS.denoise,
    titleKey: "common.denoise.title",
    descKey: "common.denoise.desc",
    icon: Volume2,
  },
  {
    id: "metadata",
    path: APP_PATHS.metadata,
    titleKey: "common.metadata.title",
    descKey: "common.metadata.desc",
    icon: FileText,
  },
  {
    id: "myfiles",
    path: APP_PATHS.myFiles,
    titleKey: "common.myfiles.title",
    descKey: "common.myfiles.desc",
    icon: FolderOpen,
  },
];

export const HOME_NEW_FEATURES: HomeNewFeature[] = [
  {
    id: 2,
    title: "newFeatures.videoMeta.title",
    description: "newFeatures.videoMeta.desc",
    image: "/cover/2.jpg",
    badge: "",
    icon: "Metadata",
    ai: false,
    href: APP_PATHS.metadata,
  },
  {
    id: 3,
    title: "newFeatures.audioMeta.title",
    description: "newFeatures.audioMeta.desc",
    image: "/cover/3.jpg",
    icon: "Metadata",
    ai: false,
    href: APP_PATHS.metadata,
  },
  {
    id: 4,
    title: "newFeatures.imageMeta.title",
    description: "newFeatures.imageMeta.desc",
    image: "/cover/1.jpg",
    icon: "Metadata",
    ai: false,
    disabled: true,
  },
  {
    id: 5,
    title: "newFeatures.merge.title",
    description: "newFeatures.merge.desc",
    image: "/cover/4.jpg",
    icon: "Merger",
    disabled: true,
    future: true,
  },
  {
    id: 6,
    title: "newFeatures.split.title",
    description: "newFeatures.split.desc",
    image: "/cover/5.jpg",
    icon: "Splitter",
    disabled: true,
    future: true,
  },
  {
    id: 7,
    title: "newFeatures.crop.title",
    description: "newFeatures.crop.desc",
    image: "/cover/6.jpg",
    icon: "Cropper",
    disabled: true,
    future: true,
  },
  {
    id: 8,
    title: "newFeatures.rotate.title",
    description: "newFeatures.rotate.desc",
    image: "/cover/7.jpg",
    icon: "Rotator",
    disabled: true,
    future: true,
  },
];
