import { FormatGroup } from "@/types/options";

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
  config: any;
  onValueChange?: (config: any) => void;
  applyConfigToAllTasks?: (config: any) => void;
  className?: string;
  recentKey: string;
  btnLabel?: string;
}

export interface FormatSelectorContentProps {
  config: any;
  formatRecents: FormatGroup[];
  addToRecents: (format: FormatGroup) => void;
  onValueChange: (config: any) => void;
  applyConfigToAllTasks: (config: any) => void;
  onClose: () => void;
  btnLabel?: string;
}
