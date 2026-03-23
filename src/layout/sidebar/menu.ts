import { APP_PATHS, QUICK_ACCESS_CONFIG } from "@/config/navigation";

export type { QuickAccessItem } from "@/config/navigation";

export const MenuItems = {
  home: APP_PATHS.home,
  aiTools: "",
  myFiles: APP_PATHS.myFiles,
  converter: APP_PATHS.converter,
  denoise: APP_PATHS.denoise,
  compressor: APP_PATHS.compressor,
  metadata: APP_PATHS.metadata,
  watermark: APP_PATHS.watermark,
  tasks: APP_PATHS.tasks,
  batch: "/batch",
} as const;

export type MenuItemPath = (typeof MenuItems)[keyof typeof MenuItems];

export { QUICK_ACCESS_CONFIG };
