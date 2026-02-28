import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FormatGroup } from "@/types/options";

interface FormatSelectorStore {
  recentsByKey: Record<string, FormatGroup[]>;
  addToRecents: (key: string, format: FormatGroup) => void;
  clearRecents: (key: string) => void;
}

export const useFormatSelectorStore = create<FormatSelectorStore>()(
  persist(
    (set) => ({
      recentsByKey: {},
      addToRecents: (key, format) => {
        set((state) => {
          const prev = state.recentsByKey[key] ?? [];
          const next = [
            format,
            ...prev.filter((item) => item.id !== format.id),
          ].slice(0, 10);

          return {
            recentsByKey: {
              ...state.recentsByKey,
              [key]: next,
            },
          };
        });
      },
      clearRecents: (key) => {
        set((state) => ({
          recentsByKey: {
            ...state.recentsByKey,
            [key]: [],
          },
        }));
      },
    }),
    {
      name: "format-selector-recents",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
