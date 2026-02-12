import { FormatOption } from "@/types/options";
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
  config: GlobalConverterConfig;
  onValueChange?: (config: GlobalConverterConfig) => void;
  className?: string;
  formatRecents: FormatOption[];
  addToRecents: (format: FormatOption) => void;
  applyConfigToAllTasks: (config: GlobalConverterConfig) => void;
}

export interface FormatSelectorContentProps {
  config: GlobalConverterConfig;
  formatRecents: FormatOption[];
  addToRecents: (format: FormatOption) => void;
  onValueChange: (config: GlobalConverterConfig) => void;
  applyConfigToAllTasks: (config: GlobalConverterConfig) => void;
  onClose: () => void;
}
