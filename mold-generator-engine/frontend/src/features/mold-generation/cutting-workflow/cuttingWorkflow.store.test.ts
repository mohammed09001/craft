import { beforeEach, describe, expect, it } from "vitest";

import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";

import { useSegmentationModeStore } from "@/features/mold-generation/segmentation/segmentationMode.store";
import { readCurrentSegmentationSourceSnapshot } from "@/features/mold-generation/segmentation/application/segmentationSourceSnapshot";
import { useModelSelectionStore } from "@/features/viewport/modelSelection.store";

import {
  addSegmentationExtensionAxis,
  moveSegmentationExtensionAxis,
  regenerateSegmentationAfterScale,
  removeSegmentationExtensionAxis,
  useAutomaticDraftStore,
  useCuttingWorkflowStore,
  useManualDraftStore,
} from "./cuttingWorkflow.store";
import {
  canUseSingletonSplitFaceInteraction,
  getCuttingSessionInteractionOwner,
  isManualMoreMoldsInteractionOwner,
} from "./cuttingWorkflow.contracts";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const K1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

/** Flushes pending microtasks and at least one macrotask tick -- more robust than counting exact promise-chain hops for a fire-and-forget async action. */
function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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
    lastMoreMoldsProvenance: null,
    lastOneMoldProvenance: null,
    lastReopenBlockedReason: null,
    lastCommitBlockedReason: null,
  });
  useSegmentationModeStore.getState().resetStrategy();
  useAutomaticDraftStore.getState().resetStrategy();
  useManualDraftStore.getState().clearForModelReplacement();
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
    [{ kind: "idle" } as const, "singleton-split-face", true, false],
    [{ kind: "sessionOpen", activeTab: "cutByFace", moreMoldsActiveDraft: "automatic", commitPhase: "editing" } as const, "singleton-split-face", true, false],
    [{ kind: "sessionOpen", activeTab: "oneMold", moreMoldsActiveDraft: "automatic", commitPhase: "editing" } as const, "one-mold-segmentation", false, false],
    [{ kind: "sessionOpen", activeTab: "moreMolds", moreMoldsActiveDraft: "automatic", commitPhase: "editing" } as const, "automatic-more-molds-segmentation", false, false],
    [{ kind: "sessionOpen", activeTab: "moreMolds", moreMoldsActiveDraft: "manual", commitPhase: "editing" } as const, "manual-more-molds-split-face", false, true],
  ])(
    "maps %o to the single interaction owner",
    (state, owner, singletonAllowed, manualOwner) => {
      expect(getCuttingSessionInteractionOwner(state)).toBe(owner);
      expect(canUseSingletonSplitFaceInteraction(state)).toBe(singletonAllowed);
      expect(isManualMoreMoldsInteractionOwner(state)).toBe(manualOwner);
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
      moreMoldsActiveDraft: "automatic",
      commitPhase: "editing",
    });
    expect(useSplitFaceStore.getState().workflow).toBe("selectingFaces");
  });

  it("is a no-op to open a session that is already open", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    useCuttingWorkflowStore.getState().openSession();
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ activeTab: "oneMold" });
  });

  it("switches tabs, initializing each draft's own engine exactly once", async () => {
    useCuttingWorkflowStore.getState().openSession();

    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ activeTab: "oneMold" });
    expect(useSegmentationModeStore.getState().mode).toBe("make-as-one-mold");
    expect(useSegmentationModeStore.getState().plan?.requiredAxes).toEqual(["x"]);

    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    await flushAsync();
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({
      activeTab: "moreMolds",
      moreMoldsActiveDraft: "automatic",
    });
    expect(useAutomaticDraftStore.getState().mode).toBe("make-as-more-molds");

    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ activeTab: "cutByFace" });
    expect(useSplitFaceStore.getState().workflow).toBe("selectingFaces");
  });

  it("preserves an editable Cut by Face draft while its viewport interaction is suspended on another tab", () => {
    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().toggleFace("front");
    const planes = useSplitFaceStore.getState().cuttingPlanes;

    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(useSplitFaceStore.getState().workflow).toBe("planesReady");

    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");
    expect(useSplitFaceStore.getState().workflow).toBe("planesReady");
    expect(useSplitFaceStore.getState().cuttingPlanes).toEqual(planes);
  });

  it("preserves each tab's own draft state across switching away and back", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(addSegmentationExtensionAxis("y")).toBe(true);

    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    await flushAsync();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");

    // Re-visiting does not re-run requestMode (which would wipe the
    // extension boundary) -- ensureOneMoldTabInitialized only initializes
    // once per session, on first visit.
    expect(useSegmentationModeStore.getState().extensionBoundaries).toHaveLength(1);
  });

  it("resets the active viewport tool on every tab switch", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useViewportToolStore.getState().setActiveTool("eraser");

    useCuttingWorkflowStore.getState().setActiveTab("oneMold");

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

  it("clears stale More Molds provenance on a fresh Cut by Face commit -- it no longer describes the singleton's new content", async () => {
    useCuttingWorkflowStore.setState({
      lastMoreMoldsProvenance: {
        schemaVersion: 1,
        producedBy: "automatic",
        committedAt: new Date().toISOString(),
        modelGeometrySignature: "model",
        printerVolumeAtCommit: { x: 100, y: 100, z: 100 },
        automatic: { settingsSignature: "sig" },
        manual: null,
      },
    });

    useCuttingWorkflowStore.getState().openSession();
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");
    await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1);

    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance).toBeNull();
  });
});

describe("cuttingWorkflow.store Done -- One Mold tab", () => {
  beforeEach(resetAll);

  it("accepts and executes the real plan, promotes it into the singleton, and returns to idle", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(useSegmentationModeStore.getState().phase).toBe("preview");
    const source = readCurrentSegmentationSourceSnapshot();
    expect(source.status).toBe("ready");

    const committed = await useCuttingWorkflowStore
      .getState()
      .commitActiveTab("model-1", undefined, "sig");

    expect(committed).toBe(true);
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    expect(useSegmentationModeStore.getState().phase).toBe("valid");
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useSplitFaceStore.getState().definition?.moldBodiesPartitionReferenceBlock).toBe(false);
    if (source.status === "ready") {
      expect(useSplitFaceStore.getState().definition?.moldFrame).toEqual(source.definition.moldFrame);
      expect(useSplitFaceStore.getState().definition?.selectionBoxBounds).toEqual(source.definition.selectionBoxBounds);
      expect(useSplitFaceStore.getState().definition?.referenceMoldBlock).toEqual(source.definition.referenceMoldBlock);
    }
    const provenance = useCuttingWorkflowStore.getState().lastOneMoldProvenance;
    expect(provenance).not.toBeNull();
    expect(provenance?.modelGeometrySignature).toBe("sig");
    expect(provenance?.extensionBoundaries).toEqual([]);
    expect(provenance?.requiredAxes.length).toBeGreaterThan(0);
    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance).toBeNull();
  });

  it("clears a prior One Mold provenance when a different tab commits afterward", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    expect(useCuttingWorkflowStore.getState().lastOneMoldProvenance).not.toBeNull();

    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1),
    ).toBe(true);

    expect(useCuttingWorkflowStore.getState().lastOneMoldProvenance).toBeNull();
  });

  it("refuses to commit without a selected model", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab();

    expect(committed).toBe(false);
    expect(useSplitFaceStore.getState().workflow).not.toBe("partsReady");
  });

  it("retries the plan once printer dimensions are entered after the tab was already opened without them", () => {
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");

    const failedResult = useSegmentationModeStore.getState().result;
    expect(useSegmentationModeStore.getState().phase).toBe("failed");
    expect(failedResult?.status).toBe("failed");
    if (failedResult?.status === "failed") {
      expect(failedResult.reasonCode).toBe("invalid_printer_volume");
    }

    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });

    expect(useSegmentationModeStore.getState().phase).not.toBe("failed");
    expect(useSegmentationModeStore.getState().plan?.requiredAxes).toEqual(["x"]);
  });

  it("does not retry from the printer-volume subscription when Cut by Face is the active tab", () => {
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(useSegmentationModeStore.getState().phase).toBe("failed");
    useCuttingWorkflowStore.getState().setActiveTab("cutByFace");

    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });

    // Cut by Face owns the panel now -- One Mold's stale failed result must
    // not be silently resurrected just because dimensions arrived.
    expect(useSegmentationModeStore.getState().phase).toBe("failed");
  });
});

describe("cuttingWorkflow.store Done -- More Molds tab", () => {
  beforeEach(resetAll);

  function openMoreMolds() {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
  }

  it("starts planning on the Automatic draft by default", () => {
    openMoreMolds();
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({
      activeTab: "moreMolds",
      moreMoldsActiveDraft: "automatic",
    });
    expect(useAutomaticDraftStore.getState().mode).toBe("make-as-more-molds");
  });

  it("switches between Automatic and Manual without touching either draft's own state", () => {
    openMoreMolds();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");
    expect(useManualDraftStore.getState().cuttingPlanes.length).toBeGreaterThan(0);

    useCuttingWorkflowStore.getState().switchToManual();
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ moreMoldsActiveDraft: "manual" });
    expect(useManualDraftStore.getState().cuttingPlanes.length).toBeGreaterThan(0);

    useCuttingWorkflowStore.getState().switchToAutomatic();
    useCuttingWorkflowStore.getState().switchToManual();
    expect(useManualDraftStore.getState().cuttingPlanes.length).toBeGreaterThan(0);
  });

  it("commits the Automatic draft on Done, writes provenance, and resets Manual (the inactive draft) to idle", async () => {
    openMoreMolds();
    const source = readCurrentSegmentationSourceSnapshot();
    expect(source.status).toBe("ready");
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");
    await flushAsync();

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab();

    expect(committed).toBe(true);
    const after = useCuttingWorkflowStore.getState();
    expect(after.state).toEqual({ kind: "idle" });
    expect(after.lastMoreMoldsProvenance?.producedBy).toBe("automatic");
    expect(useAutomaticDraftStore.getState().phase).toBe("valid");
    expect(useManualDraftStore.getState().cuttingPlanes).toHaveLength(0);
    expect(useManualDraftStore.getState().workflow).toBe("modelReady");
    if (source.status === "ready") {
      expect(useSplitFaceStore.getState().definition?.moldFrame).toEqual(source.definition.moldFrame);
      expect(useSplitFaceStore.getState().definition?.selectionBoxBounds).toEqual(source.definition.selectionBoxBounds);
      expect(useSplitFaceStore.getState().definition?.referenceMoldBlock).toEqual(source.definition.referenceMoldBlock);
    }
  });

  it("commits the Manual draft on Done when Manual is active, and resets Automatic (the inactive draft)", async () => {
    openMoreMolds();
    useCuttingWorkflowStore.getState().switchToManual();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");
    await flushAsync();

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1);

    expect(committed).toBe(true);
    const after = useCuttingWorkflowStore.getState();
    expect(after.state).toEqual({ kind: "idle" });
    expect(after.lastMoreMoldsProvenance?.producedBy).toBe("manual");
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useAutomaticDraftStore.getState().phase).toBe("idle");
    expect(useAutomaticDraftStore.getState().mode).toBeNull();
  });

  it("refuses to commit Manual without modelId/k1, and stays in the editing session", async () => {
    openMoreMolds();
    useCuttingWorkflowStore.getState().switchToManual();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab();

    expect(committed).toBe(false);
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({
      activeTab: "moreMolds",
      moreMoldsActiveDraft: "manual",
      commitPhase: "editing",
    });
  });

  it("sets a concrete lastCommitBlockedReason when Automatic cannot commit, cleared on the next session entry", async () => {
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    openMoreMolds();
    expect(useAutomaticDraftStore.getState().phase).toBe("failed");

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab();

    expect(committed).toBe(false);
    expect(useCuttingWorkflowStore.getState().lastCommitBlockedReason).toMatch(/printer dimensions/i);

    useCuttingWorkflowStore.getState().cancelSession();
    openMoreMolds();
    expect(useCuttingWorkflowStore.getState().lastCommitBlockedReason).toBeNull();
  });

  it("sets a concrete lastCommitBlockedReason when Manual has no cutting planes to commit", async () => {
    openMoreMolds();
    useCuttingWorkflowStore.getState().switchToManual();

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1);

    expect(committed).toBe(false);
    expect(useCuttingWorkflowStore.getState().lastCommitBlockedReason).toMatch(
      /at least one cutting plane/i,
    );
  });

  it("retries Automatic's plan once printer dimensions are entered, but not while Manual is active", () => {
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    openMoreMolds();
    expect(useAutomaticDraftStore.getState().phase).toBe("failed");

    useCuttingWorkflowStore.getState().switchToManual();
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });
    expect(useAutomaticDraftStore.getState().phase).toBe("failed");

    useCuttingWorkflowStore.getState().switchToAutomatic();
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });
    expect(useAutomaticDraftStore.getState().phase).not.toBe("failed");
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

  it("One Mold: replans against the new K2 after Scale commit and re-adopts the same topology atomically, without a new history entry", async () => {
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
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(useSegmentationModeStore.getState().plan?.perAxisSegmentCount.x).toBe(2);

    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    const provenance = useCuttingWorkflowStore.getState().lastOneMoldProvenance;
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

  it("One Mold: falls back to the truthful whole-K2 base (never silently adopts a different topology) when Scale changes the required piece count", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    expect(useCuttingWorkflowStore.getState().lastOneMoldProvenance?.perAxisSegmentCount.x).toBe(2);

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
    // The draft's own state is the honest record of the new (differently-
    // shaped) plan -- inspectable if the user reopens One Mold manually.
    expect(useSegmentationModeStore.getState().plan?.perAxisSegmentCount.x).toBe(3);
  });

  it("One Mold: replays a committed user extension boundary after Mold Scale instead of permanently collapsing to the whole-K2 base", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    addSegmentationExtensionAxis("y");
    expect(useSegmentationModeStore.getState().extensionBoundaries.length).toBeGreaterThan(0);
    const committedExtensionBoundaries = useSegmentationModeStore.getState().extensionBoundaries;

    expect(
      await useCuttingWorkflowStore.getState().commitActiveTab("model-1", undefined, "sig"),
    ).toBe(true);
    expect(useCuttingWorkflowStore.getState().lastOneMoldProvenance?.extensionBoundaries).toEqual(
      committedExtensionBoundaries,
    );
    const preScaleBodyCount = useSplitFaceStore.getState().definition!.moldBodies!.length;
    expect(preScaleBodyCount).toBeGreaterThan(1);

    // Topology-preserving range (same as the plain One Mold Scale-recovery
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

  it("One Mold: falls back to the whole-K2 base when a committed extension boundary is no longer valid after Mold Scale", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    addSegmentationExtensionAxis("y");
    expect(useSegmentationModeStore.getState().extensionBoundaries.length).toBeGreaterThan(0);

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

  it("Automatic More Molds: replans from the current K2 and adopts a changed piece count", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    expect(await useCuttingWorkflowStore.getState().commitActiveTab()).toBe(true);
    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance?.producedBy).toBe("automatic");
    expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(2);

    // Pushes K2 x past 1200mm (840+2*210=1260), forcing a 3rd X segment --
    // Automatic must adapt, unlike One Mold.
    useSplitFaceStore.getState().setClearanceMm(210);
    expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(1);

    await regenerateSegmentationAfterScale();

    expect(useAutomaticDraftStore.getState().plan?.perAxisSegmentCount.x).toBe(3);
    expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(3);
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useSplitFaceStore.getState().lastCommittedResult).not.toBeNull();
  });

  it("discards a stale in-flight replan superseded by a second Scale gesture before the first's regeneration lands", async () => {
    // Explicit printer volume (independent of resetAll's default, scaled for
    // other tests in this describe block) so this small 140mm model still
    // requires One Mold Segmentation under the (currently 100mm)
    // automatic-Segmentation floor.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });
    setModelBounds({ x: 140, y: 50, z: 50 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
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
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
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
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
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

  it("control: Manual More Molds is unaffected -- its committed result never carries segmentationLineage, so Scale keeps using its own live cutting-plane rebuild", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    useCuttingWorkflowStore.getState().switchToManual();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");
    await flushAsync();
    expect(await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1)).toBe(true);
    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance?.producedBy).toBe("manual");
    expect(useSplitFaceStore.getState().definition?.segmentationLineage).toBeUndefined();

    useSplitFaceStore.getState().setClearanceMm(30);
    // Cut-by-Face-style live rebuild (real cutting planes), not the
    // whole-K2 segmentation fallback -- still has real partitioned bodies.
    const beforeRegen = useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id);
    expect(useSplitFaceStore.getState().definition?.moldBodiesPartitionReferenceBlock).not.toBe(false);

    await regenerateSegmentationAfterScale();

    expect(useSplitFaceStore.getState().definition!.moldBodies!.map((b) => b.id)).toEqual(beforeRegen);
  });

  it("survives 20 repeated One Mold Scale+regenerate cycles without topology collapse, duplicated bodies, or a null definition", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    setModelBounds({ x: 840, y: 120, z: 120 });
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
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

describe("cuttingWorkflow.store reopening a committed More Molds result", () => {
  beforeEach(() => {
    resetAll();
    useSplitFaceStore.getState().setCanonicalPartGeometrySignature("model-sig-1");
  });

  async function commitManual() {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    useCuttingWorkflowStore.getState().switchToManual();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");
    await flushAsync();
    const committed = await useCuttingWorkflowStore.getState().commitActiveTab("model-1", K1);
    expect(committed).toBe(true);
  }

  async function commitAutomatic() {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    await flushAsync();
    const committed = await useCuttingWorkflowStore.getState().commitActiveTab();
    expect(committed).toBe(true);
  }

  function openMoreMolds() {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
  }

  it("reopens a Manual-created result into Manual, resetting Automatic to a clean idle draft", async () => {
    await commitManual();

    openMoreMolds();
    // seedCuttingPlanesForReopen is synchronous but the createMoldParts
    // regeneration it triggers is async -- let it settle.
    await flushAsync();

    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ moreMoldsActiveDraft: "manual" });
    expect(useManualDraftStore.getState().workflow).toBe("partsReady");
    expect(useManualDraftStore.getState().cuttingPlanes.length).toBeGreaterThan(0);
    expect(useAutomaticDraftStore.getState().phase).toBe("idle");
    expect(useAutomaticDraftStore.getState().mode).toBeNull();
  });

  it("reopens an Automatic-created result into Automatic, resetting Manual to a clean idle draft", async () => {
    await commitAutomatic();

    openMoreMolds();

    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ moreMoldsActiveDraft: "automatic" });
    expect(useAutomaticDraftStore.getState().mode).toBe("make-as-more-molds");
    expect(useManualDraftStore.getState().workflow).toBe("modelReady");
    expect(useManualDraftStore.getState().cuttingPlanes).toHaveLength(0);
  });

  it("resets undo/redo history at the commit/reopen boundary", async () => {
    await commitManual();
    openMoreMolds();

    expect(useManualDraftStore.getState().undoStack).toHaveLength(0);
    expect(useManualDraftStore.getState().redoStack).toHaveLength(0);
    expect(useAutomaticDraftStore.getState().undoStack).toHaveLength(0);
    expect(useAutomaticDraftStore.getState().redoStack).toHaveLength(0);
  });

  it("blocks reopening with stale_model_geometry when the model has changed since commit, preserves the committed result, and still opens the tab fresh on Automatic", async () => {
    await commitManual();
    useSplitFaceStore.getState().setCanonicalPartGeometrySignature("model-sig-2");

    openMoreMolds();

    expect(useCuttingWorkflowStore.getState().lastReopenBlockedReason).toBe("stale_model_geometry");
    // Unlike the old top-level flyout (which refused entry entirely), the
    // panel always has somewhere to land -- refusing to reopen now means
    // "start this tab fresh," not "close the panel."
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({
      activeTab: "moreMolds",
      moreMoldsActiveDraft: "automatic",
    });
    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance).not.toBeNull();
  });

  it("blocks reopening with model_unavailable when no model geometry signature is currently available", async () => {
    await commitManual();
    useSplitFaceStore.getState().setCanonicalPartGeometrySignature(null);

    openMoreMolds();

    expect(useCuttingWorkflowStore.getState().lastReopenBlockedReason).toBe("model_unavailable");
  });

  it("blocks reopening with incompatible_printer_dimensions when the printer volume has changed since an Automatic commit", async () => {
    await commitAutomatic();
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 200, y: 200, z: 200 });

    openMoreMolds();

    expect(useCuttingWorkflowStore.getState().lastReopenBlockedReason).toBe(
      "incompatible_printer_dimensions",
    );
    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance).not.toBeNull();
  });

  it("blocks reopening with unsupported_schema_version for a legacy provenance record", () => {
    useCuttingWorkflowStore.setState({
      lastMoreMoldsProvenance: {
        // @ts-expect-error -- simulating a legacy/invalid record from an older schema
        schemaVersion: 0,
        producedBy: "manual",
        committedAt: new Date().toISOString(),
        modelGeometrySignature: "model-sig-1",
        printerVolumeAtCommit: null,
        automatic: null,
        manual: null,
      },
    });

    openMoreMolds();

    expect(useCuttingWorkflowStore.getState().lastReopenBlockedReason).toBe(
      "unsupported_schema_version",
    );
  });

  it("blocks reopening with missing_cutting_definitions when Manual provenance has no cutting planes", () => {
    useCuttingWorkflowStore.setState({
      lastMoreMoldsProvenance: {
        schemaVersion: 1,
        producedBy: "manual",
        committedAt: new Date().toISOString(),
        modelGeometrySignature: "model-sig-1",
        printerVolumeAtCommit: null,
        automatic: null,
        manual: { modelId: "model-1", selectionBoxBounds: K1, clearanceMm: 10, cuttingPlanes: [] },
      },
    });

    openMoreMolds();

    expect(useCuttingWorkflowStore.getState().lastReopenBlockedReason).toBe(
      "missing_cutting_definitions",
    );
  });

  it("clears a stale reopen-blocked reason on the next session entry", async () => {
    await commitManual();
    useSplitFaceStore.getState().setCanonicalPartGeometrySignature("model-sig-2");
    openMoreMolds();
    expect(useCuttingWorkflowStore.getState().lastReopenBlockedReason).not.toBeNull();

    useCuttingWorkflowStore.getState().cancelSession();
    useCuttingWorkflowStore.getState().openSession();

    expect(useCuttingWorkflowStore.getState().lastReopenBlockedReason).toBeNull();
  });
});

describe("cuttingWorkflow.store cancelSession", () => {
  beforeEach(() => {
    resetAll();
    useSplitFaceStore.getState().setCanonicalPartGeometrySignature("model-sig-1");
  });

  async function commitManual() {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    useCuttingWorkflowStore.getState().switchToManual();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");
    await flushAsync();
    const committed = await useCuttingWorkflowStore
      .getState()
      .commitActiveTab("model-1", K1);
    expect(committed).toBe(true);
  }

  it("returns to idle from any tab", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    useCuttingWorkflowStore.getState().cancelSession();
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
  });

  it("promotes nothing into the singleton and writes no provenance", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");

    useCuttingWorkflowStore.getState().cancelSession();

    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance).toBeNull();
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

  it("resets every draft to idle and clears their undo/redo history", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    useCuttingWorkflowStore.getState().switchToManual();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("front");
    await flushAsync();
    expect(useManualDraftStore.getState().cuttingPlanes.length).toBeGreaterThan(0);

    useCuttingWorkflowStore.getState().cancelSession();

    expect(useManualDraftStore.getState().workflow).toBe("modelReady");
    expect(useManualDraftStore.getState().cuttingPlanes).toHaveLength(0);
    expect(useAutomaticDraftStore.getState().mode).toBeNull();
    expect(useSegmentationModeStore.getState().mode).toBeNull();
  });

  it("clears session-local commit-blocked reasons", async () => {
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
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
    await commitManual();
    const committedResult = useSplitFaceStore.getState().lastCommittedResult;
    const provenance = useCuttingWorkflowStore.getState().lastMoreMoldsProvenance;

    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    useCuttingWorkflowStore.getState().switchToManual();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("top");
    useCuttingWorkflowStore.getState().cancelSession();

    expect(useSplitFaceStore.getState().lastCommittedResult).toBe(committedResult);
    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance).toBe(provenance);
  });

  it("restores the original committed result when cancelling a reopened Manual result", async () => {
    await commitManual();
    const preSessionWorkflow = useSplitFaceStore.getState().workflow;
    const preSessionPlanes = useSplitFaceStore.getState().cuttingPlanes;
    expect(preSessionWorkflow).toBe("partsReady");

    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    await flushAsync();
    useManualDraftStore.getState().enterSelection();
    useManualDraftStore.getState().toggleFace("top");

    useCuttingWorkflowStore.getState().cancelSession();

    expect(useSplitFaceStore.getState().workflow).toBe(preSessionWorkflow);
    expect(useSplitFaceStore.getState().cuttingPlanes).toEqual(preSessionPlanes);
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

  it("reports no active draft (empty ownership) outside an open session", () => {
    expect(addSegmentationExtensionAxis("y")).toBe(false);
  });

  it("reports no active draft on the Cut by Face tab", () => {
    useCuttingWorkflowStore.getState().openSession();
    expect(addSegmentationExtensionAxis("y")).toBe(false);
  });

  it("One Mold: adds an available axis to the singleton and rejects an already-used one", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    expect(useSegmentationModeStore.getState().plan?.requiredAxes).toEqual(["x"]);

    expect(addSegmentationExtensionAxis("x")).toBe(false);
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([]);

    expect(addSegmentationExtensionAxis("y")).toBe(true);
    expect(useSegmentationModeStore.getState().extensionBoundaries).toHaveLength(1);
    expect(useSegmentationModeStore.getState().extensionBoundaries[0]!.axis).toBe("y");

    expect(addSegmentationExtensionAxis("y")).toBe(false);
    expect(useSegmentationModeStore.getState().extensionBoundaries).toHaveLength(1);

    removeSegmentationExtensionAxis("y");
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([]);
  });

  it("regression: addSegmentationExtensionAxis converts the suggested position to an absolute mm coordinate, not a raw 0..1 fraction", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");

    expect(addSegmentationExtensionAxis("y")).toBe(true);
    const boundary = useSegmentationModeStore.getState().extensionBoundaries[0]!;
    expect(boundary.axis).toBe("y");

    const source = readCurrentSegmentationSourceSnapshot();
    expect(source.status).toBe("ready");
    if (source.status !== "ready") return;
    const bounds = source.snapshot.aggregateBounds;
    expect(boundary.coordinateMm).toBeGreaterThan(bounds.min.y + 1);
    expect(boundary.coordinateMm).toBeLessThan(bounds.max.y - 1);
  });

  it("More Molds Automatic: adds an available axis to the Automatic draft, not the singleton", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    await flushAsync();
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ moreMoldsActiveDraft: "automatic" });
    expect(useAutomaticDraftStore.getState().plan?.requiredAxes).toEqual(["x"]);

    expect(addSegmentationExtensionAxis("z")).toBe(true);
    expect(useAutomaticDraftStore.getState().extensionBoundaries).toHaveLength(1);
    expect(useAutomaticDraftStore.getState().extensionBoundaries[0]!.axis).toBe("z");
    expect(useSegmentationModeStore.getState().extensionBoundaries).toEqual([]);

    expect(addSegmentationExtensionAxis("x")).toBe(false);
  });

  it("More Molds Manual: has no algorithm plan to extend, so adding an axis is rejected", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    useCuttingWorkflowStore.getState().switchToManual();
    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ moreMoldsActiveDraft: "manual" });

    expect(addSegmentationExtensionAxis("y")).toBe(false);
  });

  it("creates a real, draggable CuttingPlaneRecord on the singleton splitFace store when adding a One Mold extension axis", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");

    expect(addSegmentationExtensionAxis("y")).toBe(true);

    const visualPlane = useSplitFaceStore.getState().cuttingPlanes.find((plane) => plane.axis === "y");
    expect(visualPlane).toBeDefined();
    expect(visualPlane!.provenance).toBe("segmentation-extension-suggested");
    expect(visualPlane!.enabled).toBe(true);
  });

  it("removes the visual CuttingPlaneRecord when removing an extension axis", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    addSegmentationExtensionAxis("y");
    expect(useSplitFaceStore.getState().cuttingPlanes.some((plane) => plane.axis === "y")).toBe(true);

    removeSegmentationExtensionAxis("y");
    expect(useSplitFaceStore.getState().cuttingPlanes.some((plane) => plane.axis === "y")).toBe(false);
  });

  it("moveSegmentationExtensionAxis forwards a drag's new world coordinate to the active draft", () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("oneMold");
    addSegmentationExtensionAxis("y");

    const moved = moveSegmentationExtensionAxis("y", 40);
    expect(moved).toBe(true);
    expect(useSegmentationModeStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);
  });

  it("moveSegmentationExtensionAxis routes to the Automatic draft (not the singleton) during the More Molds tab", async () => {
    useCuttingWorkflowStore.getState().openSession();
    useCuttingWorkflowStore.getState().setActiveTab("moreMolds");
    await flushAsync();
    addSegmentationExtensionAxis("y");

    moveSegmentationExtensionAxis("y", 40);
    expect(useAutomaticDraftStore.getState().extensionBoundaries[0]!.coordinateMm).toBe(40);
  });
});
