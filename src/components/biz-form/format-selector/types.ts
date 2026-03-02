import { FormatGroup } from "@/types/options";
import { GlobalConverterConfig } from "@/pages/converter/videos/store";

export interface FormatSelectorValue {
  group: string;
  outputFormat: string;
  // Video fields
  videoEncoder?: string;
  resolution?: string;
  // Audio fields
  audioEncoder?: string;
  audioBitrate?: string;
  audioSampleRate?: string;
  audioChannels?: string;
  // Image fields
  quality?: string;
}

export interface FormatSelectorProps {
  config: Partial<GlobalConverterConfig>;
  onValueChange?: (config: Partial<GlobalConverterConfig>) => void;
  applyConfigToAllTasks?: (config: GlobalConverterConfig) => void;
  className?: string;
  recentKey: string;
  btnLabelKey?: string;
}

export interface FormatSelectorContentProps {
  config: Partial<GlobalConverterConfig>;
  formatRecents: FormatGroup[];
  addToRecents: (format: FormatGroup) => void;
  onValueChange: (config: Partial<GlobalConverterConfig>) => void;
  applyConfigToAllTasks: (config: GlobalConverterConfig) => void;
  onClose: () => void;
  btnLabelKey?: string;
}
