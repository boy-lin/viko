import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import { ConverterLayer } from "@/components/icons/ConverterLayer";
import { DownloaderLayer } from "@/components/icons/DownloaderLayer";
import { CompressorLayer } from "@/components/icons/CompressorLayer";
import { useConverterStore } from "@/stores/converterStore";
import { useAnalytics } from "@/lib/analytics";

type HeroCardAction = {
  label: string;
  icon: React.ReactNode;
};

type HeroCardItem = {
  title: string;
  description: string;
  action: HeroCardAction;
  lightBg: string;
  darkBg: string;
  hoverRotate: string;
  iconLayer: React.ReactNode;
};

const heroCards: HeroCardItem[] = [
  {
    title: "Converter",
    description:
      "Batch convert video, audio, and image files, supporting over 1,000 formats.",
    action: {
      label: "Add File(s)",
      icon: <Plus className="w-4 h-4 mr-1" />,
    },
    lightBg: "bg-gradient-to-br from-purple-100 to-blue-100",
    darkBg: "bg-[#2a2a2a]",
    hoverRotate: "-0.5deg",
    iconLayer: <ConverterLayer />,
  },
  {
    title: "Downloader",
    description:
      "Batch download video and audio files from 10,000+ video sites.",
    action: {
      label: "Start Now",
      icon: <ArrowRight className="w-4 h-4 mr-1" />,
    },
    lightBg: "bg-gradient-to-br from-orange-50 to-amber-50",
    darkBg: "bg-[#2a2a2a]",
    hoverRotate: "0.5deg",
    iconLayer: <DownloaderLayer />,
  },
  {
    title: "Compressor",
    description:
      "Automatically compress audio and video files to reduce file size.",
    action: {
      label: "Add File(s)",
      icon: <Plus className="w-4 h-4 mr-1" />,
    },
    lightBg: "bg-gradient-to-br from-purple-100 to-fuchsia-100",
    darkBg: "bg-[#2a2a2a]",
    hoverRotate: "-0.5deg",
    iconLayer: <CompressorLayer />,
  },
  {
    title: "Metadata Editor",
    description:
      "Edit metadata tags for audio and video files without re-encoding.",
    action: {
      label: "Edit Tags",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg>,
    },
    lightBg: "bg-gradient-to-br from-green-100 to-emerald-100",
    darkBg: "bg-[#2a2a2a]",
    hoverRotate: "0.5deg",
    iconLayer: <svg xmlns="http://www.w3.org/2000/svg" className="absolute -right-8 -bottom-8 w-32 h-32 text-green-500/10 rotate-12" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" /></svg>,
  },
];

const HeroCardItemView = ({
  item,
  isDark,
}: {
  item: HeroCardItem;
  isDark: boolean;
}) => (
  <motion.div
    whileHover={{ scale: 0.98, rotate: item.hoverRotate }}
    className={`group relative min-h-[200px] overflow-hidden rounded-2xl ${isDark ? item.darkBg : item.lightBg
      } p-4`}
  >
    <div className="relative flex flex-col h-full cursor-default">
      <h2
        className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"
          }`}
      >
        {item.title}
      </h2>
      <p
        className={`text-sm leading-[1.4] mb-4 ${isDark ? "text-gray-400" : "text-gray-600"
          }`}
      >
        {item.description}
      </p>
      <Button className="cursor-pointer w-fit bg-white/20 backdrop-blur-md hover:bg-white/30 text-white shadow-lg border border-white/30 transition-all z-20">
        {item.action.icon}
        {item.action.label}
      </Button>
    </div>
    {item.iconLayer}
  </motion.div>
);
export function HeroCard() {
  const { theme } = useTheme();
  const { addFiles } = useConverterStore();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const { track } = useAnalytics();

  const handleAction = async (title: string) => {
    track('click_hero_card', { title });
    if (title === "Converter") {
      await addFiles();
      navigate("/converter");
    } else if (title === "Metadata Editor") {
      navigate("/metadata");
    }
  };

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {heroCards.map((item) => (
        <div key={item.title} onClick={() => handleAction(item.title)}>
          <HeroCardItemView item={item} isDark={isDark} />
        </div>
      ))}
    </div>
  );
}
