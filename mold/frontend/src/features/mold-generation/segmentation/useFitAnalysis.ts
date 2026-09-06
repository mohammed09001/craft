import { useMemo } from "react";

import { useGroundedWorldBounds, useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolume, usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";
import {
  createAutomaticSegmentationMoldFrameBounds,
  type ReferenceMoldFrameBounds,
} from "@/features/mold-generation/reference-mold-definition";

import { evaluateFitAnalysis, sizeOfBounds, type FitAnalysisResult } from "./fitAnalysis";

function automaticSegmentationFrame(
  groundedWorldBounds: ReturnType<typeof useModelBoundsStore.getState>["groundedWorldBounds"],
  requestedClearanceMm: number,
): ReferenceMoldFrameBounds | null {
  return groundedWorldBounds === null
    ? null
    : createAutomaticSegmentationMoldFrameBounds(
        {
          min: groundedWorldBounds.min,
          max: groundedWorldBounds.max,
        },
        requestedClearanceMm,
      );
}

export function useAutomaticSegmentationMoldFrameBounds(): ReferenceMoldFrameBounds | null {
  const groundedWorldBounds = useGroundedWorldBounds();
  const requestedClearanceMm = useSplitFaceStore(
    (state) => state.clearanceMm,
  );
  return useMemo(
    () =>
      automaticSegmentationFrame(
        groundedWorldBounds,
        requestedClearanceMm,
      ),
    [groundedWorldBounds, requestedClearanceMm],
  );
}

/** Reactive fit-analysis result, recomputed whenever any authoritative input changes. */
export function useFitAnalysis(): FitAnalysisResult {
  const printerVolume = usePrinterBuildVolume();
  const groundedWorldBounds = useGroundedWorldBounds();
  const moldFrame = useAutomaticSegmentationMoldFrameBounds();

  return evaluateFitAnalysis({
    printerVolume,
    modelSize: sizeOfBounds(groundedWorldBounds),
    moldEnvelopeSize: sizeOfBounds(
      moldFrame?.referenceMoldBlockBounds ?? null,
    ),
  });
}

/** Non-reactive snapshot read, for use outside React (store subscriptions). */
export function readFitAnalysisFromStores(): FitAnalysisResult {
  const printerVolume = usePrinterBuildVolumeStore.getState().dimensions;
  const groundedWorldBounds = useModelBoundsStore.getState().groundedWorldBounds;
  const moldFrame = automaticSegmentationFrame(
    groundedWorldBounds,
    useSplitFaceStore.getState().clearanceMm,
  );

  return evaluateFitAnalysis({
    printerVolume,
    modelSize: sizeOfBounds(groundedWorldBounds),
    moldEnvelopeSize: sizeOfBounds(
      moldFrame?.referenceMoldBlockBounds ?? null,
    ),
  });
}
