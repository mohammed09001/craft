import { create } from "zustand";

export type MoldAppearanceMode = "solid" | "glass";

interface MoldAppearanceState {
  readonly mode: MoldAppearanceMode;
  setMode(mode: MoldAppearanceMode): void;
  toggleGlassMode(): void;
  reset(): void;
}

const INITIAL_MODE: MoldAppearanceMode = "solid";

export const useMoldAppearanceStore = create<MoldAppearanceState>((set) => ({
  mode: INITIAL_MODE,

  setMode: (mode) => {
    set({ mode });
  },

  toggleGlassMode: () => {
    set((state) => ({
      mode: state.mode === "glass" ? "solid" : "glass",
    }));
  },

  reset: () => {
    set({ mode: INITIAL_MODE });
  },
}));
