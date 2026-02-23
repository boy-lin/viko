import { create } from "zustand";
import { downloadDir } from "@tauri-apps/api/path";

const STORAGE_PREFIX = "settings:";

const readSetting = <T>(key: string): T | undefined => {
  if (typeof localStorage === "undefined") return undefined;
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn("Failed to parse setting:", key, error);
    return undefined;
  }
};

const writeSetting = (key: string, value: unknown) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
};

interface SettingsState {
  outputPath: string;
  useHardwareAcceleration: boolean;
  useUltraFastSpeed: boolean;
  deleteOutputOnRemove: boolean;
  isLoading: boolean;
  init: () => Promise<void>;
  setOutputPath: (path: string) => Promise<void>;
  toggleHardwareAcceleration: (enabled: boolean) => Promise<void>;
  toggleUltraFastSpeed: (enabled: boolean) => Promise<void>;
  setDeleteOutputOnRemove: (enabled: boolean) => Promise<void>;
  getOutputDir: (path: string) => string;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  outputPath: "",
  useHardwareAcceleration: false,
  useUltraFastSpeed: false,
  deleteOutputOnRemove: false,
  isLoading: true,
  init: async () => {
    try {
      const useHardwareAcceleration = readSetting<boolean>(
        "use_hardware_acceleration"
      );
      const useUltraFastSpeed = readSetting<boolean>(
        "use_ultra_fast_speed"
      );
      const deleteOutputOnRemove = readSetting<boolean>(
        "delete_output_on_remove"
      );

      let outputPath = readSetting<string>("outputPath");
      if (!outputPath) {
        outputPath = await downloadDir();
        // Save default to DB immediately
        writeSetting("outputPath", outputPath);
      }

      set({
        outputPath,
        useHardwareAcceleration: !!useHardwareAcceleration,
        useUltraFastSpeed: !!useUltraFastSpeed,
        deleteOutputOnRemove: !!deleteOutputOnRemove,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
      set({ isLoading: false });
    }
  },
  setOutputPath: async (path) => {
    try {
      writeSetting("outputPath", path);
      set({ outputPath: path });
    } catch (error) {
      console.error("Failed to save output path:", error);
    }
  },
  toggleHardwareAcceleration: async (enabled) => {
    set({ useHardwareAcceleration: enabled });
    writeSetting("use_hardware_acceleration", enabled);
  },
  toggleUltraFastSpeed: async (enabled) => {
    set({ useUltraFastSpeed: enabled });
    writeSetting("use_ultra_fast_speed", enabled);
  },
  setDeleteOutputOnRemove: async (enabled) => {
    set({ deleteOutputOnRemove: enabled });
    writeSetting("delete_output_on_remove", enabled);
  },
  getOutputDir: (path) => {
    const relativePath = path.split("/").slice(0, -1).join("/");
    return get().outputPath.length > 0 ? get().outputPath : relativePath;
  },
}));
