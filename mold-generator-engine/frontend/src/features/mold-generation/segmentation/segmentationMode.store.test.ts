import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";

import {
  createSegmentationModeStoreCreator,
  useSegmentationModeStore,
} from "@/features/mold-generation/segmentation/segmentationMode.store";
import { readFitAnalysisFromStores } from "@/features/mold-generation/segmentation/useFitAnalysis";
import { create } from "zustand";
import { act } from "@testing-library/react";

function isSegmentationModeActive(): boolean {
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

describe("segmentation mode", () => {
  it("stays NOT_EVALUATED, and inactive, before printer volume and model bounds both exist", () => {
    expect(readFitAnalysisFromStores().overall).toBe("NOT_EVALUATED");
    expect(isSegmentationModeActive()).toBe(false);
  });

  it("activates automatically once fit analysis reports DOES_NOT_FIT", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });

    expect(readFitAnalysisFromStores().overall).toBe("DOES_NOT_FIT");
    expect(isSegmentationModeActive()).toBe(true);
  });

  it("lets the user record a strategy choice while active", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });

    useSegmentationModeStore.getState().setStrategy("one-mold");
    expect(useSegmentationModeStore.getState().strategy).toBe("one-mold");
  });

  it("automatically resets the strategy choice once a printer re-entry makes it fit again", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("more-molds");
    expect(useSegmentationModeStore.getState().strategy).toBe("more-molds");

    // Automatic mold size = model + 200mm on every axis: 900+200=1100,
    // 300+200=500. This bump must clear both to make it fit again.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 1500, y: 700, z: 700 });

    expect(isSegmentationModeActive()).toBe(false);
    expect(useSegmentationModeStore.getState().strategy).toBeNull();
  });

  it("does not reset an unset strategy when re-entering a printer volume that still does not fit", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");

    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 120, y: 100, z: 100 });

    expect(isSegmentationModeActive()).toBe(true);
    expect(useSegmentationModeStore.getState().strategy).toBe("one-mold");
  });

  it("undo restores the strategy/mode chosen before the most recent requestMode, and redo replays it", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });

    useSegmentationModeStore.getState().setStrategy("one-mold");
    expect(useSegmentationModeStore.getState().strategy).toBe("one-mold");

    useSegmentationModeStore.getState().setStrategy("more-molds");
    expect(useSegmentationModeStore.getState().strategy).toBe("more-molds");

    useSegmentationModeStore.getState().undo();
    expect(useSegmentationModeStore.getState().strategy).toBe("one-mold");

    useSegmentationModeStore.getState().redo();
    expect(useSegmentationModeStore.getState().strategy).toBe("more-molds");
  });
});

describe("segmentation mode store factory isolation", () => {
  it("gives two instances fully independent state and undo/redo histories", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });

    const useDraftA = create(createSegmentationModeStoreCreator());
    const useDraftB = create(createSegmentationModeStoreCreator());

    useDraftA.getState().setStrategy("one-mold");
    useDraftB.getState().setStrategy("more-molds");

    expect(useDraftA.getState().strategy).toBe("one-mold");
    expect(useDraftB.getState().strategy).toBe("more-molds");
    expect(useDraftA.getState().undoStack).toHaveLength(1);
    expect(useDraftB.getState().undoStack).toHaveLength(1);

    useDraftA.getState().undo();
    expect(useDraftA.getState().strategy).toBeNull();
    // Undoing draft A must not touch draft B's independent state or history.
    expect(useDraftB.getState().strategy).toBe("more-molds");
    expect(useDraftB.getState().undoStack).toHaveLength(1);
  });

  it("does not affect the singleton useSegmentationModeStore", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });

    const useDraft = create(createSegmentationModeStoreCreator());
    useDraft.getState().setStrategy("more-molds");

    expect(useDraft.getState().strategy).toBe("more-molds");
    expect(useSegmentationModeStore.getState().strategy).toBeNull();
  });
});

describe("segmentation mode store extension boundaries", () => {
  it("rejects an axis already required by the algorithm plan, leaving extensionBoundaries unchanged", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 }); // oversized only on X
    useSegmentationModeStore.getState().setStrategy("one-mold");
    expect(useSegmentationModeStore.getState().plan?.requiredAxes).toEqual(["x"]);

    const accepted = useSegmentationModeStore.getState().applyExtensionBoundary("x", 50);
    expect(accepted).toBe(false);
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([]);
  });

  it("accepts an axis the algorithm plan did not need, entering preview phase with the new boundary recorded", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");

    const accepted = useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);
    expect(accepted).toBe(true);
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([
      { axis: "y", coordinateMm: 25 },
    ]);
    expect(useSegmentationModeStore.getState().phase).toBe("preview");
  });

  it("rejects a second request on an axis that already has an extension boundary", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");
    useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);

    const accepted = useSegmentationModeStore.getState().applyExtensionBoundary("y", 10);
    expect(accepted).toBe(false);
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([
      { axis: "y", coordinateMm: 25 },
    ]);
  });

  it("removeExtensionBoundary removes a previously added axis", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");
    useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);

    useSegmentationModeStore.getState().removeExtensionBoundary("y");
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([]);
  });

  it("keeps `result` non-null across adding and removing an extension boundary (regression: applyExtensionBoundary must not null it out)", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");

    expect(useSegmentationModeStore.getState().result).not.toBeNull();

    act(() => {
      useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);
    });
    expect(useSegmentationModeStore.getState().result).not.toBeNull();

    act(() => {
      useSegmentationModeStore.getState().removeExtensionBoundary("y");
    });
    expect(useSegmentationModeStore.getState().result).not.toBeNull();
  });

  it("moveExtensionBoundary updates an existing extension's coordinate and returns to preview", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");
    useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);
    useSegmentationModeStore.getState().acceptPlan();
    expect(useSegmentationModeStore.getState().phase).toBe("accepted");

    const moved = useSegmentationModeStore.getState().moveExtensionBoundary("y", 40);
    expect(moved).toBe(true);
    expect(useSegmentationModeStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);
    // A move always requires re-acceptance -- a stale "accepted" phase must
    // never carry an outdated coordinate forward into execution.
    expect(useSegmentationModeStore.getState().phase).toBe("preview");
  });

  it("returns false when moving an axis that has no existing extension boundary yet", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");
    expect(useSegmentationModeStore.getState().moveExtensionBoundary("y", 40)).toBe(false);
  });

  it("an invalid move (degenerate coordinate) blocks acceptPlan without resetting the extension, and moving back restores it", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");
    useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);
    const validCoordinate = useSegmentationModeStore.getState().extensionBoundaries[0]!.coordinateMm;

    // An exact segment-edge coordinate is degenerate (not strictly interior)
    // -- derived from the real plan's own bounds rather than assumed.
    const plan = useSegmentationModeStore.getState().plan!;
    const degenerateCoordinate = plan.segments[0]!.predictedBounds.min.y;

    const moved = useSegmentationModeStore.getState().moveExtensionBoundary("y", degenerateCoordinate);
    expect(moved).toBe(true); // the move itself is never rejected...
    expect(useSegmentationModeStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(degenerateCoordinate);
    expect(useSegmentationModeStore.getState().acceptPlan()).toBe(false); // ...but commit is blocked
    // The user's chosen (invalid) position is preserved, not snapped back.
    expect(useSegmentationModeStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(degenerateCoordinate);
    expect(useSegmentationModeStore.getState().phase).toBe("preview");

    useSegmentationModeStore.getState().moveExtensionBoundary("y", validCoordinate);
    expect(useSegmentationModeStore.getState().acceptPlan()).toBe(true);
    expect(useSegmentationModeStore.getState().phase).toBe("accepted");
  });

  it("undo/redo restores the extension boundary's coordinate across a move", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");
    useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);
    useSegmentationModeStore.getState().moveExtensionBoundary("y", 40);
    expect(useSegmentationModeStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);

    useSegmentationModeStore.getState().undo();
    expect(useSegmentationModeStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(25);

    useSegmentationModeStore.getState().redo();
    expect(useSegmentationModeStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);
  });

  it("clears extension boundaries when the base plan is invalidated by a printer-volume change", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");
    useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);
    expect(useSegmentationModeStore.getState().extensionBoundaries).toHaveLength(1);

    // Still oversized on X, but a different printer volume -- invalidates
    // the base plan (markStale) without resetting the strategy entirely.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 90, y: 100, z: 100 });

    expect(useSegmentationModeStore.getState().phase).toBe("stale");
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([]);
  });

  it("undo/redo restores extensionBoundaries alongside the rest of the snapshot", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelSize({ x: 900, y: 300, z: 300 });
    useSegmentationModeStore.getState().setStrategy("one-mold");
    useSegmentationModeStore.getState().applyExtensionBoundary("y", 25);
    expect(useSegmentationModeStore.getState().extensionBoundaries).toHaveLength(1);

    useSegmentationModeStore.getState().undo();
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([]);

    useSegmentationModeStore.getState().redo();
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([
      { axis: "y", coordinateMm: 25 },
    ]);
  });
});
