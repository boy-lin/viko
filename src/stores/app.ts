import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AppState = {
  pinnedPaths: string[];
  recentPaths: string[];
  usageCounts: Record<string, number>;
  unreadFinishedCount: number;
  pinQuickAccess: (path: string) => void;
  unpinQuickAccess: (path: string) => void;
  togglePinQuickAccess: (path: string) => void;
  recordRecentQuickAccess: (path: string) => void;
  getSortedUsage: () => { path: string; count: number }[];
  incrementUnreadFinishedCount: () => void;
  resetUnreadFinishedCount: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      pinnedPaths: [],
      recentPaths: [],
      usageCounts: {},
      unreadFinishedCount: 0,
      pinQuickAccess: (path: string) => {
        if (!path) return;
        set((state) => {
          const without = state.pinnedPaths.filter((p) => p !== path);
          const next = [...without, path]
          return { pinnedPaths: next };
        });
      },
      unpinQuickAccess: (path: string) => {
        if (!path) return;
        set((state) => ({
          pinnedPaths: state.pinnedPaths.filter((p) => p !== path),
        }));
      },
      togglePinQuickAccess: (path: string) => {
        if (!path) return;
        const { pinnedPaths } = get();
        if (pinnedPaths.includes(path)) {
          get().unpinQuickAccess(path);
        } else {
          get().pinQuickAccess(path);
        }
      },
      recordRecentQuickAccess: (path: string) => {
        if (!path) return;
        set((state) => {
          const next = [path, ...state.recentPaths.filter((p) => p !== path)];
          const usage = {
            ...state.usageCounts,
            [path]: (state.usageCounts[path] || 0) + 1,
          };
          return { recentPaths: next.slice(0, 10), usageCounts: usage };
        });
      },
      getSortedUsage: () => {
        const usage = get().usageCounts || {};
        return Object.entries(usage)
          .map(([path, count]) => ({ path, count }))
          .sort((a, b) => b.count - a.count);
      },
      incrementUnreadFinishedCount: () =>
        set((state) => ({ unreadFinishedCount: state.unreadFinishedCount + 1 })),
      resetUnreadFinishedCount: () => set({ unreadFinishedCount: 0 }),
    }),
    {
      name: "app_store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
