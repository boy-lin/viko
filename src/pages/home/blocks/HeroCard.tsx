import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ConverterLayer } from "@/components/icons/ConverterLayer";
import { DownloaderLayer } from "@/components/icons/DownloaderLayer";
import { CompressorLayer } from "@/components/icons/CompressorLayer";
import { useConverterStore } from "@/stores/converterStore";
import { useAnalytics } from "@/lib/analytics";
import { MenuItems } from "@/layout/sidebar/menu";
import { useTranslation } from "react-i18next";

type HeroCardAction = {
  label: string;
  icon: React.ReactNode;
};

type HeroCardItem = {
  id: "converter" | "downloader" | "compressor";
  title: string;
  description: string;
  action: HeroCardAction;
  gradient: string;
  hoverRotate: string;
  iconLayer: React.ReactNode;
};

const heroCards: HeroCardItem[] = [
  {
    id: "converter",
    title: "hero.converter.title",
    description: "hero.converter.desc",
    action: {
      label: "hero.converter.action",
      icon: <Plus className="w-4 h-4 mr-1" />,
    },
    gradient: "var(--gradient-converter)",
    hoverRotate: "-0.5deg",
    iconLayer: <ConverterLayer />,
  },
  {
    id: "downloader",
    title: "hero.downloader.title",
    description: "hero.downloader.desc",
    action: {
      label: "hero.downloader.action",
      icon: <ArrowRight className="w-4 h-4 mr-1" />,
    },
    gradient: "var(--gradient-downloader)",
    hoverRotate: "0.5deg",
    iconLayer: <DownloaderLayer />,
  },
  {
    id: "compressor",
    title: "hero.compressor.title",
    description: "hero.compressor.desc",
    action: {
      label: "hero.compressor.action",
      icon: <Plus className="w-4 h-4 mr-1" />,
    },
    gradient: "var(--gradient-compressor)",
    hoverRotate: "-0.5deg",
    iconLayer: <CompressorLayer />,
  }
];

const HeroCardItemView = ({
  item,
  t,
}: {
  item: HeroCardItem;
  t: ReturnType<typeof useTranslation>["t"];
}) => (
  <motion.div
    whileHover={{ scale: 0.98, rotate: item.hoverRotate }}
    className="group cursor-pointer relative min-h-[210px] overflow-hidden rounded-2xl bg-background p-5 shadow-md"
  >
    <div
      className="absolute right-2 -top-0 h-40 w-40 blur-3xl opacity-70"
      style={{ background: item.gradient }}
    ></div>
    <div className="relative flex flex-col h-full">
      <h2
        className="text-2xl font-bold text-foreground"
      >
        {t(item.title)}
      </h2>
      <p
        className="text-sm leading-[1.4] mb-5 line-clamp-3 break-all text-foreground/80"
      >
        {t(item.description)}
      </p>
      <Button
        className="w-fit text-background shadow-md border-none transition-all z-20 px-4 py-2 text-sm font-semibold cursor-pointer"
        style={{ backgroundImage: item.gradient }}
      >
        {item.action.icon}
        {t(item.action.label)}
      </Button>
    </div>
    {item.iconLayer}
  </motion.div>
);
export function HeroCard() {
  const addFiles = useConverterStore(state => state.addFiles);
  const navigate = useNavigate();

  const { track } = useAnalytics();
  const { t } = useTranslation("home");

  const handleAction = async (id: HeroCardItem["id"]) => {
    track('click_hero_card', { title: id });
    if (id === "converter") {
      const picked = await addFiles();
      if (picked && picked.length > 0) {
        navigate("/converter");
      }
    } else if (id === "compressor") {
      const picked = await addFiles();
      if (picked && picked.length > 0) {
        navigate(MenuItems.compressor);
      }
    } else if (id === "downloader") {
      navigate(MenuItems.home);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {heroCards.map((item) => (
        <div key={item.id} className="" onClick={() => handleAction(item.id)}>
          <HeroCardItemView item={item} t={t} />
        </div>
      ))}
    </div>
  );
}
