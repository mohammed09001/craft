import "@testing-library/jest-dom/vitest";

import { useDistanceMeasurementStore } from "@/features/viewport/modelMeasurement.store";
import { useModelImportStore } from "@/features/viewport/modelImport.store";
import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { useModelSelectionStore } from "@/features/viewport/modelSelection.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useSegmentationModeStore } from "@/features/mold-generation/segmentation/segmentationMode.store";
import { useUiShellStore } from "@/state/ui-shell";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "dark";
  useModelImportStore.getState().resetModelImportStatus();
  useDistanceMeasurementStore.getState().resetMeasurementAfterReplacement();
  useModelSelectionStore.getState().resetSelectionAfterReplacement();
  usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
  useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry(null);
  useSegmentationModeStore.getState().reset();
  useUiShellStore.getState().resetShellPreferences();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => null),
  });
});
