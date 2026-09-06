import { beforeEach, describe, expect, it } from "vitest";

import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";

import { useSegmentationStore } from "@/features/mold-generation/segmentation/segmentation.store";
import { readCurrentSegmentationSourceSnapshot } from "@/features/mold-generation/segmentation/application/segmentationSourceSnapshot";
import { useModelSelectionStore } from "@/features/viewport/modelSelection.store";

import {
  addSegmentationExtensionAxis,
  moveSegmentationExtensionAxis,
  regenerateSegmentationAfterScale,
  removeSegmentationExtensionAxis,
  useCuttingWorkflowStore,
} from "./cuttingWorkflow.store";
import {
  canUseSingletonSplitFaceInteraction,
  getCuttingSessionInteractionOwner,
} from "./cuttingWorkflow.contracts";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const K1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

function setModelBounds(size: { x: number; y: number; z: number }) {
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

function resetAll() {
  useCuttingWorkflowStore.setState({
    state: { kind: "idle" },
    lastSegmentationProvenance: null,
    lastCommitBlockedReason: null,
  });
  useSegmentationStore.getState().reset();
  useSplitFaceStore.getState().clearForModelReplacement();
  // Scaled 6x from the pre-150mm-floor fixture (was printer 100mm / model
  // 150x50x50) so "oversized only on X" survives
  // AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM (currently 100): automatic
  // mold size is model size + 200mm on every axis (x: 900+200=1100 > printer
  // 600; y/z: 300+200=500 < printer 600, comfortably fits -- no longer sits
  // exactly on the boundary the way the old 150mm floor's 300mm-per-axis
  // expansion did).
  usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
  setModelBounds({ x: 900, y: 300, z: 300 }); // oversized only on X
  useModelSelectionStore.getState().setModelSelectionStatus({
    isModelSelected: true,
    selectedModelId: "model-1",
    selectionBoxBounds: K1,
  });
}

describe("cutting-session interaction ownership contract", () => {
  it.each([
    [{ kind: "idle" } as const, "singleton-split-face", true],
    [{ kind: "sessionOpen", activeTab: "cutByFace", commitPhase: "editing" } as const, "singleton-split-face", true],
    [{ kind: "sessionOpen", activeTab: "segmentation", commitPhase: "editing" } as const, "segmentation", false],
  ])(
    "maps %o to the single interaction owner",
    (state, owner, singletonAllowed) => {
      expect(getCuttingSessionInteractionOwner(state)).toBe(owner);
      expect(canUseSingletonSplitFaceInteraction(state)).toBe(singletonAllowed);
    },
  );
});

describe("cuttingWorkflow.store session lifecycle", () => {
  beforeEach(resetAll);

  it("starts idle", () => {
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
  });

  it("opens the panel defaulting to the Cut by Face tab", () => {
    useCuttingWorkflowStore.getState().openSession();
    expect(useCuttingWorkflowStore.getState().state).toEqual({
      kind: "sessionOpen",
      activeTab: "cutByFace",
      commitPhase: "editing",
    });
    expect(useSplitFaceStore.getState().workflow).toBe("selectingFaces");
  });

  it("is a no-op to open a session that is already open", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    useCuttingWorkflowStore.getState().openSession();
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ activeTab: "segmentation" });
  });

  it("switches tabs, initializing the Segmentation engine exactly once", async () => {
    useCuttingWorkflowStore.getState().openSession();

    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ activeTab: "segmentation" });
    expect(useSegmentationStore.getState().plan).not.toBeNull();
    expect(useSegmentationStore.getState().plan?.requiredAxes).toEqual(["x"]);

    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ activeTab: "cutByFace" });
    expect(useSplitFaceStore.getState().workflow).toBe("selectingFaces");
  });

  it("preserves an editable Cut by Face draft while its viewport interaction is suspended on another tab", () => {
    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().toggleFace("front");
    const planes = useSplitFaceStore.getState().cuttingPlanes;

    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(useSplitFaceStore.getState().workflow).toBe("planesReady");

    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");
    expect(useSplitFaceStore.getState().workflow).toBe("planesReady");
    expect(useSplitFaceStore.getState().cuttingPlanes).toEqual(planes);
  });

  it("preserves the Segmentation tab's own state across switching away and back", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(addSegmentationExtensionAxis("y")).toBe(true);

    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");

    // Re-visiting does not re-run requestPlan (which would wipe the
    // extension boundary) -- ensureSegmentationTabInitialized only
    // initializes once per session, on first visit.
    expect(useSegmentationStore.getState().extensionBoundaries).toHaveLength(1);
  });

  it("resets the active viewport tool on every tab switch", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useViewportToolStore.getState().setActiveTool("eraser");

    useCuttingWorkflowStore.getState().setActiveTab("segmentation");

    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
  });
});

describe("cuttingWorkflow.store Done -- Cut by Face tab", () => {
  beforeEach(resetAll);

  it("commits Cut by Face's own singleton edits and returns to idle", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().toggleFace("front");

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1);

    expect(committed).toBe(true);
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  });

  it("reopens the committed Cut by Face draft without duplicating planes and Cancel restores partsReady", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().toggleFace("front");
    await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1);
    const planes = useSplitFaceStore.getState().cuttingPlanes;

    useCuttingWorkflowStore.getState().openSession();
    expect(useSplitFaceStore.getState().workflow).toBe("planesReady");
    expect(useSplitFaceStore.getState().cuttingPlanes).toEqual(planes);

    useCuttingWorkflowStore.getState().cancelSession();
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useSplitFaceStore.getState().cuttingPlanes).toEqual(planes);
  });

  it("reopening the panel with zero edits does not clear a committed Cavity/Registration, and Cancel leaves them untouched", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().toggleFace("front");
    expect(await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1)).toBe(true);

    // Marks Cavity/Registration as committed without running the real
    // (Worker-based) cavity-generation pipeline -- irrelevant to this
    // lifecycle contract and unrelated to the fix under test. Only their
    // `status` distinguishes "committed" from "unavailable" here.
    useSplitFaceStore.setState((s) => ({
      cavity: { ...s.cavity, status: "complete" },
      registration: { status: "generated", revision: "test-marker-revision", bodies: null, report: null },
    }));
    expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
    expect(useSplitFaceStore.getState().registration.status).toBe("generated");
    const committedDefinition = useSplitFaceStore.getState().definition;

    // Opening the panel (default Cut by Face tab) with zero edits must not
    // mutate committed project geometry -- regression for enterSelection()
    // unconditionally nulling definition/cavity/registration on activation.
    useCuttingWorkflowStore.getState().openSession();
    expect(useSplitFaceStore.getState().definition).toBe(committedDefinition);
    expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
    expect(useSplitFaceStore.getState().registration.status).toBe("generated");

    useCuttingWorkflowStore.getState().cancelSession();
    expect(useSplitFaceStore.getState().definition).toBe(committedDefinition);
    expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
    expect(useSplitFaceStore.getState().registration.status).toBe("generated");
  });

  it("refuses to commit with no cutting planes, and stays open on the same tab", async () => {
    useCuttingWorkflowStore.getState().openSession();

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1);

    expect(committed).toBe(false);
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({
      kind: "sessionOpen",
      activeTab: "cutByFace",
      commitPhase: "editing",
    });
    expect(useCuttingWorkflowStore.getState().lastCommitBlockedReason).toMatch(
      /at least one cutting plane/i,
    );
  });

  it("refuses to commit without a selected model", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab();

    expect(committed).toBe(false);
    expect(useCuttingWorkflowStore.getState().lastCommitBlockedReason).toMatch(
      /no model is selected/i,
    );
  });
});

describe("cuttingWorkflow.store Done -- Segmentation tab", () => {
  beforeEach(resetAll);

  it("accepts and executes the real plan, promotes it into the singleton, and returns to idle", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(useSegmentationStore.getState().phase).toBe("preview");
    const source = readCurrentSegmentationSourceSnapshot();
    expect(source.status).toBe("ready");

    const committed = await useCuttingWorkflowStore
      .getState()
      .commitActiveTab("model-1", undefined, "sig");

    expect(committed).toBe(true);
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    expect(useSegmentationStore.getState().phase).toBe("valid");
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useSplitFaceStore.getState().definition?.moldBodiesPartitionReferenceBlock).toBe(false);
    if (source.status === "ready") {
      expect(useSplitFaceStore.getState().definition?.moldFrame).toEqual(source.definition.moldFrame);
      expect(useSplitFaceStore.getState().definition?.selectionBoxBounds).toEqual(source.definition.selectionBoxBounds);
      expect(useSplitFaceStore.getState().definition?.referenceMoldBlock).toEqual(source.definition.referenceMoldBlock);
    }
    const provenance = useCuttingWorkflowStore.getState().lastSegmentationProvenance;
    expect(provenance).not.toBeNull();
    expect(provenance?.modelGeometrySignature).toBe("sig");
    expect(provenance?.extensionBoundaries).toEqual([]);
    expect(provenance?.requiredAxes.length).toBeGreaterThan(0);
  });

  it("clears a prior Segmentation provenance when a Cut by Face commit supersedes it", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    expect(useCuttingWorkflowStore.getState().lastSegmentationProvenance).not.toBeNull();

    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1),
    ).toBe(true);

    expect(useCuttingWorkflowStore.getState().lastSegmentationProvenance).toBeNull();
  });

  it("refuses to commit without a selected model", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab();

    expect(committed).toBe(false);
    expect(useSplitFaceStore.getState().workflow).not.toBe("partsReady");
  });

  it("retries the plan once printer dimensions are entered after the tab was already opened without them", () => {
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");

    const failedResult = useSegmentationStore.getState().result;
    expect(useSegmentationStore.getState().phase).toBe("failed");
    expect(failedResult?.status).toBe("failed");
    if (failedResult?.status === "failed") {
      expect(failedResult.reasonCode).toBe("invalid_printer_volume");
    }

    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });

    expect(useSegmentationStore.getState().phase).not.toBe("failed");
    expect(useSegmentationStore.getState().plan?.requiredAxes).toEqual(["x"]);
  });

  it("does not retry from the printer-volume subscription when Cut by Face is the active tab", () => {
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(useSegmentationStore.getState().phase).toBe("failed");
    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");

    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });

    // Cut by Face owns the panel now -- the stale failed result must not be
    // silently resurrected just because dimensions arrived.
    expect(useSegmentationStore.getState().phase).toBe("failed");
  });
});

describe("regenerateSegmentationAfterScale", () => {
  beforeEach(resetAll);

  it("is a no-op when the current mold has no Segmentation lineage (Cut by Face)", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");
    expect(await useSplitFaceStore.getState().createMoldParts("model-1", K1)).toBe(true);
    const before = useSplitFaceStore.getState().definition;

    await regenerateSegmentationAfterScale();

    expect(useSplitFaceStore.getState().definition).toBe(before);
  });

  it("is a no-op when nothing has been committed yet", async () => {
    await regenerateSegmentationAfterScale();
    expect(useSplitFaceStore.getState().definition).toBeNull();
  });

  it("Segmentation: replans against the new K2 after Scale commit and re-adopts the same topology atomically, without a new history entry", async () => {
    // Scaled 6x from the pre-150mm-floor fixture (was 140mm/100mm printer/
    // 25-30mm range) so the topology-preserving window survives
    // AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM (currently 100, previously
    // 150) and stays under MAX_REFERENCE_MOLD_CLEARANCE_MM=225 (retained,
    // not tightened, when the floor dropped -- see its doc comment): 840mm
    // on X against a 600mm printer needs exactly 2 X segments across a real
    // clearance range (150mm through 180mm raw, both comfortably above the
    // 100mm floor so neither collapses to it) -- not merely two raw values
    // that collapse to the same floored clearance. y/z are kept small
    // (120mm) so their own K2 extent (size + 2*clearance) never approaches
    // the 600mm printer volume across the clearances used below -- only X's
    // segment count is exercised by this scenario.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(useSegmentationStore.getState().plan?.perAxisSegmentCount.x).toBe(2);

    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    const provenance = useCuttingWorkflowStore.getState().lastSegmentationProvenance;
    expect(provenance?.perAxisSegmentCount.x).toBe(2);
    const preScaleBodyIds = useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id);
    const undoStackBefore = useSplitFaceStore.getState().undoStack.length;

    // Scale commit: whole-K2 base becomes current first (one history entry).
    useSplitFaceStore.getState().setClearanceMm(180);
    expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(1);
    expect(useSplitFaceStore.getState().undoStack).toHaveLength(undoStackBefore + 1);

    await regenerateSegmentationAfterScale();

    const after = useSplitFaceStore.getState().definition!;
    expect(after.moldBodies!.length).toBe(2);
    expect(after.moldBodiesPartitionReferenceBlock).toBe(false);
    expect(after.segmentationLineage).toBe(true);
    expect(after.moldBodies!.map((b) => b.id)).not.toEqual(preScaleBodyIds);
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useSplitFaceStore.getState().lastCommittedResult).not.toBeNull();
    // Still exactly one history entry for this whole Scale gesture -- the
    // async replan promotion did not push a second one.
    expect(useSplitFaceStore.getState().undoStack).toHaveLength(undoStackBefore + 1);

    useSplitFaceStore.getState().undo();
    expect(useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id)).toEqual(preScaleBodyIds);
  });

  it("Segmentation: falls back to the truthful whole-K2 base (never silently adopts a different topology) when Scale changes the required piece count", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    expect(useCuttingWorkflowStore.getState().lastSegmentationProvenance?.perAxisSegmentCount.x).toBe(2);

    // Pushes K2 x past 1200mm (840+2*210=1260), forcing a 3rd X segment -- a
    // genuinely different topology than the committed one. y/z (120+2*210=540)
    // stay under the 600mm printer volume throughout.
    useSplitFaceStore.getState().setClearanceMm(210);
    const wholeBaseBodyIds = useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id);
    expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(1);

    await regenerateSegmentationAfterScale();

    // Unchanged: still the truthful whole-K2 base, not a 3-piece result
    // silently substituted for the committed 2-piece intent.
    expect(useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id)).toEqual(wholeBaseBodyIds);
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    // The engine's own state is the honest record of the new (differently-
    // shaped) plan -- inspectable if the user reopens Segmentation manually.
    expect(useSegmentationStore.getState().plan?.perAxisSegmentCount.x).toBe(3);
  });

  it("Segmentation: replays a committed user extension boundary after Mold Scale instead of permanently collapsing to the whole-K2 base", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    addSegmentationExtensionAxis("y");
    expect(useSegmentationStore.getState().extensionBoundaries.length).toBeGreaterThan(0);
    const committedExtensionBoundaries = useSegmentationStore.getState().extensionBoundaries;

    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    expect(useCuttingWorkflowStore.getState().lastSegmentationProvenance?.extensionBoundaries).toEqual(
      committedExtensionBoundaries,
    );
    const preScaleBodyCount = useSplitFaceStore.getState().definition!.moldBodies!.length;
    expect(preScaleBodyCount).toBeGreaterThan(1);

    // Topology-preserving range (same as the plain Segmentation Scale-recovery
    // test above): the extension axis ("y") is not one of the algorithm's
    // own requiredAxes, so this clearance change does not alter requiredAxes
    // / perAxisSegmentCount either.
    useSplitFaceStore.getState().setClearanceMm(180);
    expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(1);

    await regenerateSegmentationAfterScale();

    const after = useSplitFaceStore.getState().definition!;
    // The mold must remain segmented -- not permanently collapsed to the
    // single whole-K2 body -- and Body Browser/Create Cavity must see a
    // truthful, current, multi-body result, not the temporary base.
    expect(after.moldBodies!.length).toBeGreaterThan(1);
    expect(after.moldBodies!.length).toBe(preScaleBodyCount);
    expect(after.segmentationLineage).toBe(true);
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useSplitFaceStore.getState().lastCommittedResult).not.toBeNull();
    expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBe(0);
  });

  it("Segmentation: falls back to the whole-K2 base when a committed extension boundary is no longer valid after Mold Scale", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    addSegmentationExtensionAxis("y");
    expect(useSegmentationStore.getState().extensionBoundaries.length).toBeGreaterThan(0);

    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);

    // Forces a required-axis-count change (same clearance used by the plain
    // topology-mismatch control test above) so replay is correctly declined
    // by the existing topology check, not by a defect in the new replay path.
    useSplitFaceStore.getState().setClearanceMm(210);
    const wholeBaseBodyIds = useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id);
    expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(1);

    await regenerateSegmentationAfterScale();

    expect(useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id)).toEqual(wholeBaseBodyIds);
  });

  it("discards a stale in-flight replan superseded by a second Scale gesture before the first's regeneration lands", async () => {
    // Explicit printer volume (independent of resetAll's default, scaled for
    // other tests in this describe block) so this small 140mm model still
    // requires Segmentation under the (currently 100mm)
    // automatic-Segmentation floor.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });
    setModelBounds({ x: 140, y: 50, z: 50 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);

    useSplitFaceStore.getState().setClearanceMm(180);
    const firstRegeneration = regenerateSegmentationAfterScale();
    // A second Scale gesture completes (synchronously) before the first
    // regeneration's async execution settles.
    useSplitFaceStore.getState().setClearanceMm(168);
    const supersededWholeBaseIds = useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id);

    await firstRegeneration;

    // The first (now-stale) regeneration must not have overwritten the
    // second gesture's own current state.
    expect(useSplitFaceStore.getState().definition!.referenceMoldBlock.clearanceMm).toBe(168);
    expect(useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id)).toEqual(
      supersededWholeBaseIds,
    );
  });

  it("marks segmentation regeneration pending for the whole async duration and blocks Create Cavity's domain guard until it clears", async () => {
    // Topology-preserving range (see "replans...atomically" above): a
    // 150-180mm clearance keeps X at exactly 2 required segments, so this
    // reaches the real async executeAcceptedPlan() instead of bailing out
    // early on a topology mismatch (which resolves synchronously).
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBe(0);

    useSplitFaceStore.getState().setClearanceMm(180);
    const regeneration = regenerateSegmentationAfterScale();

    // Still synchronously observable before the async tail (executeAcceptedPlan) settles.
    expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBeGreaterThan(0);

    const partMesh: CanonicalPartGeometry = {
      modelId: "model-1", geometryVersion: "v1", units: "millimeters", upAxis: "Z",
      positions: [], indices: [], transform: IDENTITY,
      localBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 840, y: 120, z: 120 } },
      winding: "source", validationStatus: "captured", sourceSignature: "sig",
    };
    // Domain guard rejects Create Cavity outright while the definition may
    // still be the temporary whole-K2 base -- independent of any UI disabled
    // state, matching createCavity's own doc comment.
    expect(await useSplitFaceStore.getState().createCavity(partMesh)).toBe(false);

    await regeneration;
    expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBe(0);
  });

  it("keeps the pending count above zero until every overlapping regeneration (not just the first) finishes", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);

    useSplitFaceStore.getState().setClearanceMm(180);
    const first = regenerateSegmentationAfterScale();
    expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBe(1);

    // A second Scale gesture starts its own overlapping regeneration before
    // the first has settled, staying within the same topology-preserving
    // 150-180mm range so both calls reach the real async work.
    useSplitFaceStore.getState().setClearanceMm(150);
    const second = regenerateSegmentationAfterScale();
    expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBe(2);

    await first;
    // The first call's own finally only releases its own increment -- the
    // second's is still outstanding, so Create Cavity must stay blocked.
    expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBe(1);

    await second;
    expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBe(0);
  });

  it("survives 20 repeated Segmentation Scale+regenerate cycles without topology collapse, duplicated bodies, or a null definition", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(2);

    const seenDefinitionIds = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      // Alternates within the topology-preserving 150-180mm range (see the
      // dedicated "replans...atomically" test above for why this range
      // keeps X at exactly 2 required segments).
      const clearanceMm = i % 2 === 0 ? 150 : 180;
      useSplitFaceStore.getState().setClearanceMm(clearanceMm);
      await regenerateSegmentationAfterScale();

      const definition = useSplitFaceStore.getState().definition;
      expect(definition).not.toBeNull();
      expect(definition!.moldBodies).toHaveLength(2);
      expect(definition!.moldBodiesPartitionReferenceBlock).toBe(false);
      expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
      expect(useSplitFaceStore.getState().lastCommittedResult).not.toBeNull();
      seenDefinitionIds.add(definition!.definitionId);
    }
    // Deterministic: only two distinct clearances were used, so only two
    // distinct definitions should ever have been produced -- no drift.
    expect(seenDefinitionIds.size).toBe(2);
  });
});

describe("cuttingWorkflow.store cancelSession", () => {
  beforeEach(() => {
    resetAll();
    useSplitFaceStore.getState().setCanonicalPartGeometrySignature("model-sig-1");
  });

  async function commitSegmentation() {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    const committed = await useCuttingWorkflowStore
      .getState()
      .commitActiveTab("model-1", undefined, "sig");
    expect(committed).toBe(true);
  }

  it("returns to idle from any tab", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    useCuttingWorkflowStore.getState().cancelSession();
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
  });

  it("promotes nothing into the singleton and writes no provenance", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");

    useCuttingWorkflowStore.getState().cancelSession();

    expect(useCuttingWorkflowStore.getState().lastSegmentationProvenance).toBeNull();
    expect(useSplitFaceStore.getState().lastCommittedResult).toBeNull();
  });

  it("discards uncommitted Cut by Face edits, restoring the pre-session singleton", () => {
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");
    expect(useSplitFaceStore.getState().cuttingPlanes.length).toBeGreaterThan(0);
    const preSessionPlanes = useSplitFaceStore.getState().cuttingPlanes;

    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().toggleFace("right");
    expect(useSplitFaceStore.getState().cuttingPlanes.length).toBeGreaterThan(
      preSessionPlanes.length,
    );

    useCuttingWorkflowStore.getState().cancelSession();

    expect(useSplitFaceStore.getState().cuttingPlanes).toEqual(preSessionPlanes);
  });

  it("resets the Segmentation engine to idle and clears its state", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(useSegmentationStore.getState().plan).not.toBeNull();

    useCuttingWorkflowStore.getState().cancelSession();

    expect(useSegmentationStore.getState().plan).toBeNull();
    expect(useSegmentationStore.getState().plan).toBeNull();
  });

  it("clears session-local commit-blocked reasons", async () => {
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    await useCuttingWorkflowStore.getState().commitActiveTab();
    expect(useCuttingWorkflowStore.getState().lastCommitBlockedReason).not.toBeNull();

    useCuttingWorkflowStore.getState().cancelSession();

    expect(useCuttingWorkflowStore.getState().lastCommitBlockedReason).toBeNull();
  });

  it("resets the active viewport tool to pointer", () => {
    useCuttingWorkflowStore.getState().openSession();
    useViewportToolStore.getState().setActiveTool("eraser");

    useCuttingWorkflowStore.getState().cancelSession();

    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
  });

  it("leaves a previously committed singleton result untouched by a fresh cancelled session", async () => {
    await commitSegmentation();
    const committedResult = useSplitFaceStore.getState().lastCommittedResult;
    const provenance = useCuttingWorkflowStore.getState().lastSegmentationProvenance;

    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(addSegmentationExtensionAxis("y")).toBe(true);
    useCuttingWorkflowStore.getState().cancelSession();

    expect(useSplitFaceStore.getState().lastCommittedResult).toBe(committedResult);
    expect(useCuttingWorkflowStore.getState().lastSegmentationProvenance).toBe(provenance);
  });

  it("is idempotent under a double-cancel and does not cancel mid-commit", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().cancelSession();
    useCuttingWorkflowStore.getState().cancelSession();
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });

    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");
    const commitPromise = useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1);
    // commitPhase flips to "committing" synchronously before the async work
    // -- a Cancel that races it must be a no-op.
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ commitPhase: "committing" });
    useCuttingWorkflowStore.getState().cancelSession();
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ commitPhase: "committing" });
    await commitPromise;
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
  });
});

describe("cuttingWorkflow.store segmentation extension axes", () => {
  beforeEach(resetAll);

  it("reports no active engine (empty ownership) outside an open session", () => {
    expect(addSegmentationExtensionAxis("y")).toBe(false);
  });

  it("reports no active engine on the Cut by Face tab", () => {
    useCuttingWorkflowStore.getState().openSession();
    expect(addSegmentationExtensionAxis("y")).toBe(false);
  });

  it("adds an available axis to the singleton and rejects an already-used one", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    expect(useSegmentationStore.getState().plan?.requiredAxes).toEqual(["x"]);

    expect(addSegmentationExtensionAxis("x")).toBe(false);
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([]);

    expect(addSegmentationExtensionAxis("y")).toBe(true);
    expect(useSegmentationStore.getState().extensionBoundaries).toHaveLength(1);
    expect(useSegmentationStore.getState().extensionBoundaries[0]!.axis).toBe("y");

    expect(addSegmentationExtensionAxis("y")).toBe(false);
    expect(useSegmentationStore.getState().extensionBoundaries).toHaveLength(1);

    removeSegmentationExtensionAxis("y");
    expect(useSegmentationStore.getState().extensionBoundaries).toEqual([]);
  });

  it("regression: addSegmentationExtensionAxis converts the suggested position to an absolute mm coordinate, not a raw 0..1 fraction", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");

    expect(addSegmentationExtensionAxis("y")).toBe(true);
    const boundary = useSegmentationStore.getState().extensionBoundaries[0]!;
    expect(boundary.axis).toBe("y");

    const source = readCurrentSegmentationSourceSnapshot();
    expect(source.status).toBe("ready");
    if (source.status !== "ready") return;
    const bounds = source.snapshot.aggregateBounds;
    expect(boundary.coordinateMm).toBeGreaterThan(bounds.min.y + 1);
    expect(boundary.coordinateMm).toBeLessThan(bounds.max.y - 1);
  });

  it("creates a real, draggable CuttingPlaneRecord on the singleton splitFace store when adding an extension axis", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");

    expect(addSegmentationExtensionAxis("y")).toBe(true);

    const visualPlane = useSplitFaceStore.getState().cuttingPlanes.find((plane) => plane.axis === "y");
    expect(visualPlane).toBeDefined();
    expect(visualPlane!.provenance).toBe("segmentation-extension-suggested");
    expect(visualPlane!.enabled).toBe(true);
  });

  it("removes the visual CuttingPlaneRecord when removing an extension axis", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    addSegmentationExtensionAxis("y");
    expect(useSplitFaceStore.getState().cuttingPlanes.some((plane) => plane.axis === "y")).toBe(true);

    removeSegmentationExtensionAxis("y");
    expect(useSplitFaceStore.getState().cuttingPlanes.some((plane) => plane.axis === "y")).toBe(false);
  });

  it("moveSegmentationExtensionAxis forwards a drag's new world coordinate to the active engine", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("segmentation");
    addSegmentationExtensionAxis("y");

    const moved = moveSegmentationExtensionAxis("y", 40);
    expect(moved).toBe(true);
    expect(useSegmentationStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);
  });
});
