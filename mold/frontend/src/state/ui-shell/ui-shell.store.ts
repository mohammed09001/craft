import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ThemeMode } from "@/contracts/theme.contract";
import type { ViewportStatus } from "@/features/viewport";

export type UiShellState = {
  themeMode: ThemeMode;
  isNavigationCollapsed: boolean;
  isMobileNavigationOpen: boolean;
  viewportStatus: ViewportStatus;
};

export type UiShellActions = {
  setThemeMode: (themeMode: ThemeMode) => void;
  toggleTheme: () => void;
  toggleNavigation: () => void;
  setNavigationCollapsed: (isNavigationCollapsed: boolean) => void;
  openMobileNavigation: () => void;
  closeMobileNavigation: () => void;
  setViewportStatus: (viewportStatus: ViewportStatus) => void;
  resetShellPreferences: () => void;
};

export type UiShellStore = UiShellState & UiShellActions;

export const UI_SHELL_STORAGE_KEY = "mold-generator-ui-shell";
export const UI_SHELL_STORAGE_VERSION = 1;

const initialState: UiShellState = {
  themeMode: "dark",
  isNavigationCollapsed: false,
  isMobileNavigationOpen: false,
  viewportStatus: {
    phase: "initializing",
  },
};

export const useUiShellStore = create<UiShellStore>()(
  persist(
    (set) => ({
      ...initialState,
      setThemeMode: (themeMode) => set({ themeMode }),
      toggleTheme: () =>
        set((state) => ({
          themeMode: state.themeMode === "dark" ? "light" : "dark",
        })),
      toggleNavigation: () =>
        set((state) => ({
          isNavigationCollapsed: !state.isNavigationCollapsed,
        })),
      setNavigationCollapsed: (isNavigationCollapsed) =>
        set({ isNavigationCollapsed }),
      openMobileNavigation: () => set({ isMobileNavigationOpen: true }),
      closeMobileNavigation: () => set({ isMobileNavigationOpen: false }),
      setViewportStatus: (viewportStatus) => set({ viewportStatus }),
      resetShellPreferences: () => set(initialState),
    }),
    {
      name: UI_SHELL_STORAGE_KEY,
      version: UI_SHELL_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        isNavigationCollapsed: state.isNavigationCollapsed,
      }),
    },
  ),
);
