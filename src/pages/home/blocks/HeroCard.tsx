import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ConverterLayer } from "@/components/icons/ConverterLayer";
import { DownloaderLayer } from "@/components/icons/DownloaderLayer";
import { CompressorLayer } from "@/components/icons/CompressorLayer";
import { useAnalytics } from "@/lib/analytics";
import { MenuItems } from "@/layout/sidebar/menu";
import { useTranslation } from "react-i18next";
import { AUDIO_SUPPORT_FORMATS, VIDEO_SUPPORT_FORMATS, IMAGE_SUPPORT_FORMATS } from "@/data/formats";
import { bridge } from "@/lib/bridge";

type HeroCardAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

type HeroCardItem = {
  id: "converter" | "watermark" | "compressor";
  title: string;
  description: string;
  actions: HeroCardAction[]; // Changed from single action to array
  gradient: string;
  hoverRotate: string;
  iconLayer: React.ReactNode;
};

const heroCards: HeroCardItem[] = [
  {
    id: "converter",
    title: "hero.converter.title",
    description: "hero.converter.desc",
    actions: [
      {
        id: "converter-video",
        label: "hero.converter.videoAdd",
        icon: <Plus className="w-4 h-4 mr-1" />,
      },
      {
        id: "converter-audio",
        label: "hero.converter.audioAdd",
        icon: <Plus className="w-4 h-4 mr-1" />,
      },
      // {
      //   id: "converter-image",
      //   label: "hero.converter.imageAdd",
      //   icon: <Plus className="w-4 h-4 mr-1" />,
      // },
    ],
    gradient: "var(--gradient-converter)",
    hoverRotate: "-0.5deg",
    iconLayer: <ConverterLayer />,
  },
  {
    id: "watermark",
    title: "hero.watermark.title",
    description: "hero.watermark.desc",
    actions: [
      {
        id: "watermark-add",
        label: "hero.watermark.add",
        icon: <Plus className="w-4 h-4 mr-1" />,
      },
    ],
    gradient: "var(--gradient-downloader)",
    hoverRotate: "-0.5deg",
    iconLayer: <DownloaderLayer />,
  },
  {
    id: "compressor",
    title: "hero.compressor.title",
    description: "hero.compressor.desc",
    actions: [
      {
        id: "compressor-video-add",
        label: "hero.compressor.videoAdd",
        icon: <Plus className="w-4 h-4 mr-1" />,
      },
      {
        id: "compressor-audio-add",
        label: "hero.compressor.audioAdd",
        icon: <Plus className="w-4 h-4 mr-1" />,
      },
      {
        id: "compressor-image-add",
        label: "hero.compressor.imageAdd",
        icon: <Plus className="w-4 h-4 mr-1" />,
      },
    ],
    gradient: "var(--gradient-compressor)",
    hoverRotate: "-0.5deg",
    iconLayer: <CompressorLayer />,
  },
];

const HeroCardItemView = ({
  item,
  t,
  handleAction,
}: {
  item: HeroCardItem;
  t: ReturnType<typeof useTranslation>["t"];
  handleAction: (id: string) => void;
}) => (
  <motion.div
    whileHover={{ scale: 0.98, rotate: item.hoverRotate }}
    className="group relative min-h-[210px] overflow-hidden rounded-2xl bg-background p-5 shadow-md"
  >
    <div
      className="absolute right-2 -top-0 h-40 w-40 blur-3xl opacity-70"
      style={{ background: item.gradient }}
    ></div>
    <div className="relative flex flex-col h-full">
      <h2 className="text-2xl font-bold text-foreground">{t(item.title)}</h2>
      <p className="text-sm leading-[1.4] mb-5 line-clamp-3 break-all text-foreground/80">
        {t(item.description)}
      </p>
    </div>
    {item.iconLayer}
    <div className="group-hover:opacity-100 opacity-0 absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm z-10 gap-2 flex-wrap p-4">
      {item.actions.map((action) => (
        <Button
          key={action.id}
          className="w-fit text-background shadow-md border-none transition-all z-20 px-4 py-2 text-sm font-semibold cursor-pointer hover:scale-105"
          style={{ backgroundImage: item.gradient }}
          onClick={(e) => {
            e.stopPropagation();
            handleAction(action.id);
          }}
        >
          {action.icon}
          {t(action.label)}
        </Button>
      ))}
    </div>
  </motion.div>
);

export function HeroCard() {
  const navigate = useNavigate();

  const { track } = useAnalytics();
  const { t } = useTranslation("home");

  const handleAction = async (actionId: string) => {
    track("click_hero_card_action", { actionId });

    if (actionId === "converter-video") {
      const paths = await bridge.addFilesOrFolders({
        name: "Video",
        multiple: true,
        extensions: VIDEO_SUPPORT_FORMATS,

      })
      if (paths && paths.length > 0) {
        const { useConverterStore } = await import("@/pages/converter/videos/store")
        useConverterStore.getState().addTasksByPaths(paths)
        navigate(MenuItems.converterVideos);
      }
    } else if (actionId === "converter-audio") {
      const paths = await bridge.addFilesOrFolders({
        name: "Audio",
        multiple: true,
        extensions: AUDIO_SUPPORT_FORMATS,
      })
      if (paths && paths.length > 0) {
        const { useConverterStore } = await import("@/pages/converter/audios/store")
        useConverterStore.getState().addTasksByPaths(paths)
        navigate(MenuItems.converterAudios);
      }
    } else if (actionId === "converter-image") {
      const paths = await bridge.addFilesOrFolders({
        name: "Image",
        multiple: true,
        extensions: IMAGE_SUPPORT_FORMATS,

      });
      if (paths && paths.length > 0) {
        const { useConverterStore } = await import("@/pages/converter/images/store")
        useConverterStore.getState().addTasksByPaths(paths)
        navigate(MenuItems.converterImages);
      }
    } else if (actionId === "compressor-video-add") {
      const paths = await bridge.addFilesOrFolders({
        name: "Compressor",
        multiple: true,
        extensions: VIDEO_SUPPORT_FORMATS,

      });
      if (paths && paths.length > 0) {
        const { useCompressorStore } = await import("@/pages/compressor/videos/store")
        useCompressorStore.getState().addTasksByPaths(paths)
        navigate(MenuItems.compressorVideos);
      }
    } else if (actionId === "compressor-audio-add") {
      const paths = await bridge.addFilesOrFolders({
        name: "Compressor",
        multiple: true,
        extensions: AUDIO_SUPPORT_FORMATS,

      });
      if (paths && paths.length > 0) {
        const { useCompressorStore } = await import("@/pages/compressor/audios/store")
        useCompressorStore.getState().addTasksByPaths(paths)
        navigate(MenuItems.compressorAudios);
      }
    } else if (actionId === "compressor-image-add") {
      const paths = await bridge.addFilesOrFolders({
        name: "Compressor",
        multiple: true,
        extensions: IMAGE_SUPPORT_FORMATS,

      });
      if (paths && paths.length > 0) {
        const { useCompressorStore } = await import("@/pages/compressor/images/store")
        useCompressorStore.getState().addTasksByPaths(paths)
        navigate(MenuItems.compressorImages);
      }
    } else if (actionId === "watermark-add") {
      const videoAndImageFormats = [...VIDEO_SUPPORT_FORMATS, ...IMAGE_SUPPORT_FORMATS];
      const { useWatermarkStore } = await import("@/pages/watermark/store")
      const paths = await bridge.addFilesOrFolders({
        name: "Watermark",
        multiple: true,
        extensions: videoAndImageFormats,

      });
      if (paths && paths.length > 0) {
        useWatermarkStore.getState().addTasksByPaths(paths)
        navigate(MenuItems.watermark);
      }
    }
  };

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {heroCards.map((item) => (
        <div key={item.id} className="">
          <HeroCardItemView item={item} t={t} handleAction={handleAction} />
        </div>
      ))}
    </div>
  );
}
