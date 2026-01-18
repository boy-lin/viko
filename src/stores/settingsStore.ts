import { create } from "zustand";
import { downloadDir } from "@tauri-apps/api/path";
import { converterDB } from "../db/converterDB";

interface SettingsState {
  outputPath: string;
  useHardwareAcceleration: boolean;
  useUltraFastSpeed: boolean;
  isLoading: boolean;
  init: () => Promise<void>;
  setOutputPath: (path: string) => Promise<void>;
  toggleHardwareAcceleration: (enabled: boolean) => Promise<void>;
  toggleUltraFastSpeed: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  outputPath: "",
  useHardwareAcceleration: false,
  useUltraFastSpeed: false,
  isLoading: true,
  init: async () => {
    try {
      const useHardwareAcceleration = await converterDB.getSetting(
        "use_hardware_acceleration"
      );
      const useUltraFastSpeed = await converterDB.getSetting(
        "use_ultra_fast_speed"
      );

      let outputPath = await converterDB.getSetting("outputPath");
      if (!outputPath) {
        outputPath = await downloadDir();
        // Save default to DB immediately
        await converterDB.saveSetting("outputPath", outputPath);
      }

      set({
        outputPath,
        useHardwareAcceleration: !!useHardwareAcceleration,
        useUltraFastSpeed: !!useUltraFastSpeed,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load settings from DB:", error);
      set({ isLoading: false });
    }
  },
  setOutputPath: async (path: string) => {
    try {
      await converterDB.saveSetting("outputPath", path);
      set({ outputPath: path });
    } catch (error) {
      console.error("Failed to save output path:", error);
    }
  },
  toggleHardwareAcceleration: async (enabled: boolean) => {
    set({ useHardwareAcceleration: enabled });
    await converterDB.saveSetting("use_hardware_acceleration", enabled);
  },
  toggleUltraFastSpeed: async (enabled: boolean) => {
    set({ useUltraFastSpeed: enabled });
    await converterDB.saveSetting("use_ultra_fast_speed", enabled);
  },
}));
