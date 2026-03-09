import { Card, CardContent } from "@/components/ui/card";
import { MenuItems } from "@/layout/sidebar/menu";
import { useAppStore } from "@/stores/app";
import { useTranslation } from "react-i18next";
import {
  FileVideo,
  FileAudio,
  ImageIcon,
  Gauge,
  FileText,
  FolderOpen,
  Volume2,
} from "lucide-react";
import { Link } from "react-router-dom";

type FeatureItem = {
  id: string;
  path: string;
  titleKey: string;
  descKey: string;
  icon: React.ComponentType<{ className?: string }>;
};

const FEATURE_MAP: FeatureItem[] = [
  {
    id: "converter",
    path: MenuItems.converterVideos,
    titleKey: "common.converter.title",
    descKey: "common.converter.desc",
    icon: FileVideo,
  },
  {
    id: "audio",
    titleKey: "common.audio.title",
    descKey: "common.audio.desc",
    icon: FileAudio,
    path: MenuItems.converterAudios,
  },
  {
    id: "image",
    titleKey: "common.image.title",
    descKey: "common.image.desc",
    icon: ImageIcon,
    path: MenuItems.converterImages,
  },
  {
    id: "compressor",
    titleKey: "common.compressor.title",
    descKey: "common.compressor.desc",
    icon: Gauge,
    path: MenuItems.compressorVideos,
  },
  {
    id: "denoise",
    titleKey: "common.denoise.title",
    descKey: "common.denoise.desc",
    icon: Volume2,
    path: MenuItems.denoise,
  },
  {
    id: "metadata",
    titleKey: "common.metadata.title",
    descKey: "common.metadata.desc",
    icon: FileText,
    path: MenuItems.metadata,
  },
  {
    id: "myfiles",
    titleKey: "common.myfiles.title",
    descKey: "common.myfiles.desc",
    icon: FolderOpen,
    path: MenuItems.myFiles,
  },
];

export const CommonFeatures = () => {
  const { t } = useTranslation("home");
  const usageCounts = useAppStore((s) => s.usageCounts);

  const orderedByUsage = Object.entries(usageCounts || {})
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .map((u) => FEATURE_MAP.find((f) => f.path === u.path))
    .filter(Boolean) as FeatureItem[];

  const remaining = FEATURE_MAP.filter(
    (f) => !orderedByUsage.some((u) => u.id === f.id)
  );

  const finalList = [...orderedByUsage, ...remaining];

  return (
    <div className="grid grid-cols-3 gap-4 lg:grid-cols-4">
      {finalList.map((feature) => {
        const Icon = feature.icon;
        return (
          <Link key={feature.id} to={feature.path} className="block">
            <Card className="group h-full border-border bg-card transition-shadow hover:shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-muted p-2 text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      {t(feature.titleKey)}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {t(feature.descKey)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
};
