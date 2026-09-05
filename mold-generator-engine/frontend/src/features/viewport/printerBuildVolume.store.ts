import { create } from "zustand";

export type PrinterBuildVolume = {
  x: number;
  y: number;
  z: number;
};

export type PrinterBuildVolumeDraft = {
  x: string;
  y: string;
  z: string;
};

type PrinterBuildVolumeStore = {
  dimensions: PrinterBuildVolume | null;
  resetPrinterBuildVolume: () => void;
  setPrinterBuildVolume: (dimensions: PrinterBuildVolume) => void;
};

type PrinterBuildVolumeParseResult =
  | { ok: true; dimensions: PrinterBuildVolume }
  | { ok: false };

export function parsePrinterBuildVolume(
  draft: PrinterBuildVolumeDraft,
): PrinterBuildVolumeParseResult {
  const x = Number(draft.x);
  const y = Number(draft.y);
  const z = Number(draft.z);

  if (
    draft.x.trim() === "" ||
    draft.y.trim() === "" ||
    draft.z.trim() === "" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    x <= 0 ||
    y <= 0 ||
    z <= 0
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    dimensions: { x, y, z },
  };
}

export const usePrinterBuildVolumeStore =
  create<PrinterBuildVolumeStore>()((set) => ({
    dimensions: null,
    resetPrinterBuildVolume: () => set({ dimensions: null }),
    setPrinterBuildVolume: (dimensions) => set({ dimensions }),
  }));

export const usePrinterBuildVolume = () =>
  usePrinterBuildVolumeStore((state) => state.dimensions);

