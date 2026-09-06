import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";

import {
  createSegmentationStoreCreator,
  useSegmentationStore,
} from "@/features/mold-generation/segmentation/segmentation.store";
import { readFitAnalysisFromStores } from "@/features/mold-generation/segmentation/useFitAnalysis";
import { create } from "zustand";
import { act } from "@testing-library/react";

function isSegmentationActive(): boolean {
  return readFitAnalysisFromStores().overall === "DOES_NOT_FIT";
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// Scaled 6x from the pre-150mm-floor fixture (printer 100mm / model
// 150x50x50) so "oversized only on X" survives
// AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM (currently 100) -- see the
// identical scaling in cuttingWorkflow.store.test.ts's resetAll().
function setModelSize(size: { x: number; y: number; z: number }) {
  const geometry: CanonicalPartGeometry = {
    modelId: "model",
    geometryVersion: "v1",
    units: "millimeters",
    upAxis: "Z",
    positions: [],
    indices: [],
    transform: IDENTITY,
    localBounds: { min: { x: 0, y: 0, z: 0 }, max: size },
    winding: "source",
    validationStatus: "captured",
    sourceSignature: "sig",
  };
  useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry(geometry);
}

describe("automatic segmentation activation", () => {
  it("stays NOT_EVALUATED, and inactive, before printer volume and model bounds both exist", () => {
    expect(readFitAnalysisFromStores().overall).toBe("NOT_EVALUATED");
    expect(isSegmentationActive()).toBe(false);
  });

  it("activates automatically once fit analysis reports DOES_NOT_FIT", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });

    expect(readFitAnalysisFromStores().overall).toBe("DOES_NOT_FIT");
    expect(isSegmentationActive()).toBe(true);
  });
});

describe("segmentation store factory isolation", () => {
  it("gives two instances fully independent state and undo/redo histories", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });

    const useDraftA = create(createSegmentationStoreCreator());
    const useDraftB = create(createSegmentationStoreCreator());

    useDraftA.getState().requestPlan();
    useDraftB.getState().requestPlan();

    expect(useDraftA.getState().phase).toBe("preview");
    expect(useDraftB.getState().phase).toBe("preview");
    expect(useDraftA.getState().undoStack).toHaveLength(1);
    expect(useDraftB.getState().undoStack).toHaveLength(1);

    useDraftA.getState().undo();
    expect(useDraftA.getState().phase).toBe("idle");
    // Undoing draft A must not touch draft B's independent state or history.
    expect(useDraftB.getState().phase).toBe("preview");
    expect(useDraftB.getState().undoStack).toHaveLength(1);
  });

  it("does not affect the singleton useSegmentationStore", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });

    const useDraft = create(createSegmentationStoreCreator());
    useDraft.getState().requestPlan();

    expect(useDraft.getState().phase).toBe("preview");
    expect(useSegmentationStore.getState().phase).toBe("idle");
  });
});

describe("segmentation store extension boundaries", () => {
  it("rejects an axis already required by the algorithm plan, leaving extensionBoundaries unchanged", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 }); // oversized only on X
    useSegmentationStore.getState().requestPlan();
    expect(useSegmentationStore.getState().plan?.requiredAxes).toEqual(["x"]);

    const accepted = useSegmentationStore.getState().applyExtensionBoundary("x", 50);
    expect(accepted).toBe(false);
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([]);
  });

  it("accepts an axis the algorithm plan did not need, entering preview phase with the new boundary recorded", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();

    const accepted = useSegmentationStore.getState().applyExtensionBoundary("y", 25);
    expect(accepted).toBe(true);
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([
      { axis: "y", coordinateMm: 25 },
    ]);
    expect(useSegmentationStore.getState().phase).toBe("preview");
  });

  it("rejects a second request on an axis that already has an extension boundary", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();
    useSegmentationStore.getState().applyExtensionBoundary("y", 25);

    const accepted = useSegmentationStore.getState().applyExtensionBoundary("y", 10);
    expect(accepted).toBe(false);
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([
      { axis: "y", coordinateMm: 25 },
    ]);
  });

  it("removeExtensionBoundary removes a previously added axis", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();
    useSegmentationStore.getState().applyExtensionBoundary("y", 25);

    useSegmentationStore.getState().removeExtensionBoundary("y");
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([]);
  });

  it("keeps `result` non-null across adding and removing an extension boundary (regression: applyExtensionBoundary must not null it out)", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();

    expect(useSegmentationStore.getState().result).not.toBeNull();

    act(() => {
      useSegmentationStore.getState().applyExtensionBoundary("y", 25);
    });
    expect(useSegmentationStore.getState().result).not.toBeNull();

    act(() => {
      useSegmentationStore.getState().removeExtensionBoundary("y");
    });
    expect(useSegmentationStore.getState().result).not.toBeNull();
  });

  it("moveExtensionBoundary updates an existing extension's coordinate and returns to preview", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();
    useSegmentationStore.getState().applyExtensionBoundary("y", 25);
    useSegmentationStore.getState().acceptPlan();
    expect(useSegmentationStore.getState().phase).toBe("accepted");

    const moved = useSegmentationStore.getState().moveExtensionBoundary("y", 40);
    expect(moved).toBe(true);
    expect(useSegmentationStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);
    // A move always requires re-acceptance -- a stale "accepted" phase must
    // never carry an outdated coordinate forward into execution.
    expect(useSegmentationStore.getState().phase).toBe("preview");
  });

  it("returns false when moving an axis that has no existing extension boundary yet", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();
    expect(useSegmentationStore.getState().moveExtensionBoundary("y", 40)).toBe(false);
  });

  it("an invalid move (degenerate coordinate) blocks acceptPlan without resetting the extension, and moving back restores it", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();
    useSegmentationStore.getState().applyExtensionBoundary("y", 25);
    const validCoordinate = useSegmentationStore.getState().extensionBoundaries[0]!.coordinateMm;

    // An exact segment-edge coordinate is degenerate (not strictly interior)
    // -- derived from the real plan's own bounds rather than assumed.
    const plan = useSegmentationStore.getState().plan!;
    const degenerateCoordinate = plan.segments[0]!.predictedBounds.min.y;

    const moved = useSegmentationStore.getState().moveExtensionBoundary("y", degenerateCoordinate);
    expect(moved).toBe(true); // the move itself is never rejected...
    expect(useSegmentationStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(degenerateCoordinate);
    expect(useSegmentationStore.getState().acceptPlan()).toBe(false); // ...but commit is blocked
    // The user's chosen (invalid) position is preserved, not snapped back.
    expect(useSegmentationStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(degenerateCoordinate);
    expect(useSegmentationStore.getState().phase).toBe("preview");

    useSegmentationStore.getState().moveExtensionBoundary("y", validCoordinate);
    expect(useSegmentationStore.getState().acceptPlan()).toBe(true);
    expect(useSegmentationStore.getState().phase).toBe("accepted");
  });

  it("undo/redo restores the extension boundary's coordinate across a move", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();
    useSegmentationStore.getState().applyExtensionBoundary("y", 25);
    useSegmentationStore.getState().moveExtensionBoundary("y", 40);
    expect(useSegmentationStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);

    useSegmentationStore.getState().undo();
    expect(useSegmentationStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(25);

    useSegmentationStore.getState().redo();
    expect(useSegmentationStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);
  });

  it("clears extension boundaries when the base plan is invalidated by a printer-volume change", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();
    useSegmentationStore.getState().applyExtensionBoundary("y", 25);
    expect(useSegmentationStore.getState().extensionBoundaries).toHaveLength(1);

    // Still oversized on X, but a different printer volume -- invalidates
    // the base plan (markStale) without resetting the engine entirely.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 90, y: 100, z: 100 });

    expect(useSegmentationStore.getState().phase).toBe("stale");
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([]);
  });

  it("undo/redo restores extensionBoundaries alongside the rest of the snapshot", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationStore.getState().requestPlan();
    useSegmentationStore.getState().applyExtensionBoundary("y", 25);
    expect(useSegmentationStore.getState().extensionBoundaries).toHaveLength(1);

    useSegmentationStore.getState().undo();
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([]);

    useSegmentationStore.getState().redo();
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([
      { axis: "y", coordinateMm: 25 },
    ]);
  });
});
