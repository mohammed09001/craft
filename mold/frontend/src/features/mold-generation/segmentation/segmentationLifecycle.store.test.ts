import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { useModelSelectionStore } from "@/features/viewport/modelSelection.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";

import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import { unavailableRegistration } from "../registration";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import type {
  FinalMoldResult,
  MoldDocument,
  MoldEvaluationState,
} from "../workflow";
import { useSegmentationStore } from "./segmentation.store";

const originalMoldState = useSplitFaceStore.getState();
const bounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 250, y: 50, z: 50 },
} as const;
const body: MoldBodyData = {
  id: "body-a",
  name: "Body A",
  visible: true,
  bounds,
  triangleCount: 1,
  volumeMm3: 625_000,
  watertight: true,
  mesh: {
    positions: [0, 0, 0, 250, 0, 0, 0, 50, 50],
    indices: [0, 1, 2],
  },
};
const definition: ReferenceMoldDefinition = {
  schemaVersion: 1,
  definitionId: "definition-a",
  modelId: "model-a",
  coordinateSystem: { units: "millimeters", upAxis: "Z" },
  selectionBoxBounds: bounds,
  referenceMoldBlock: { clearanceMm: 10, bounds },
  moldFrame: {
    frameId: "frame-a",
    version: 1,
    units: "millimeters",
    upAxis: "Z",
    partOffset: { x: 0, y: 0, z: 0 },
    semanticFaces: {
      front: { axis: "y", direction: 1 },
      back: { axis: "y", direction: -1 },
      left: { axis: "x", direction: -1 },
      right: { axis: "x", direction: 1 },
      top: { axis: "z", direction: 1 },
      bottom: { axis: "z", direction: -1 },
    },
  },
  usedFaces: ["front"],
  moldBodies: [body],
};
const document: MoldDocument = {
  schemaVersion: 1,
  revision: 4,
  fingerprint: "fingerprint-4",
  definition,
  cuttingPlanes: [],
  cavityEnabled: true,
  cavityClearanceMm: 0,
  sprues: [],
  registrationPolicyId: "default",
  manufacturingProfile: null,
};
const evaluation: MoldEvaluationState = {
  phase: "complete",
  requestId: "mold-eval:4",
  sourceRevision: 4,
  sourceFingerprint: "fingerprint-4",
  stage: "validation",
  progress: 1,
  failure: null,
};
const committed: FinalMoldResult = {
  sourceRevision: 4,
  sourceFingerprint: "fingerprint-4",
  requestId: "mold-eval:4",
  bodies: [body],
  keyed: false,
  stages: {
    baseBodies: [body],
    cavityResult: null,
    sprueBodies: [],
    resolvedSprues: [],
    registration: unavailableRegistration(),
  },
  warnings: [],
};

function installCommittedMold() {
  useSplitFaceStore.setState({
    document,
    definition,
    evaluation,
    lastCommittedResult: committed,
  });
  usePrinterBuildVolumeStore
    .getState()
    .setPrinterBuildVolume({ x: 100, y: 100, z: 100 });
}

const originalModelBoundsState = useModelBoundsStore.getState();
const originalSelectionState = useModelSelectionStore.getState();

afterEach(() => {
  useSplitFaceStore.setState(originalMoldState, true);
  useModelBoundsStore.setState(originalModelBoundsState, true);
  useModelSelectionStore.setState(originalSelectionState, true);
});

describe("segmentation lifecycle invalidation", () => {
  it("marks a preview stale after printer-volume changes", () => {
    installCommittedMold();
    const result = useSegmentationStore
      .getState()
      .requestPlan();
    expect(result.status).toBe("planned");
    expect(useSegmentationStore.getState().phase).toBe("preview");
    expect(useSegmentationStore.getState().preview).not.toBeNull();
    const authoritativeMoldState = useSplitFaceStore.getState();

    usePrinterBuildVolumeStore
      .getState()
      .setPrinterBuildVolume({ x: 120, y: 100, z: 100 });

    expect(useSegmentationStore.getState().phase).toBe("stale");
    expect(useSegmentationStore.getState().result).toMatchObject({
      status: "stale",
      reasonCode: "stale_source_revision",
    });
    expect(useSegmentationStore.getState().preview).toBeNull();
    expect(useSegmentationStore.getState().registration.status).toBe(
      "unavailable",
    );
    expect(useSplitFaceStore.getState()).toBe(authoritativeMoldState);
  });

  it("marks an accepted plan stale after the authoritative mold revision changes", () => {
    installCommittedMold();
    useSegmentationStore
      .getState()
      .requestPlan();
    expect(useSegmentationStore.getState().acceptPlan()).toBe(true);
    expect(useSegmentationStore.getState().phase).toBe("accepted");
    expect(useSegmentationStore.getState().preview).not.toBeNull();

    useSplitFaceStore.setState({
      document: { ...document, revision: 5, fingerprint: "fingerprint-5" },
    });

    expect(useSegmentationStore.getState().phase).toBe("stale");
    expect(useSegmentationStore.getState().preview).toBeNull();
  });

  it("fully resets segmentation state once the model stops being oversized", () => {
    installCommittedMold();
    useModelBoundsStore.setState({
      groundedWorldBounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 250, y: 50, z: 50 },
        size: { x: 250, y: 50, z: 50 },
      },
    });

    const planned = useSegmentationStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    expect(useSegmentationStore.getState().phase).toBe("preview");
    expect(useSegmentationStore.getState().plan).not.toBeNull();

    // The printer volume grows large enough that the model now fits on every
    // axis -- the oversized workflow is no longer authoritative, and the
    // plan computed while it was must not survive into the fitting-model
    // workflow (it was planned against an obsolete printer volume).
    // Automatic mold size = model + 300mm on every axis: 250+300=550,
    // 50+300=350 -- the bump must clear both to actually make it fit.
    usePrinterBuildVolumeStore
      .getState()
      .setPrinterBuildVolume({ x: 600, y: 400, z: 400 });

    expect(useSegmentationStore.getState().phase).toBe("idle");
    expect(useSegmentationStore.getState().plan).toBeNull();
    expect(useSegmentationStore.getState().result).toBeNull();
    expect(useSegmentationStore.getState().preview).toBeNull();
    expect(useSegmentationStore.getState().registration.status).toBe(
      "unavailable",
    );
  });

  it("removes preview Registration immediately on workflow reset and model replacement", () => {
    installCommittedMold();
    expect(
      useSegmentationStore.getState().requestPlan()
        .status,
    ).toBe("planned");
    expect(useSegmentationStore.getState().preview).not.toBeNull();

    useSegmentationStore.getState().reset();
    expect(useSegmentationStore.getState().preview).toBeNull();
    expect(useSegmentationStore.getState().registration.status).toBe(
      "unavailable",
    );

    expect(
      useSegmentationStore.getState().requestPlan()
        .status,
    ).toBe("planned");
    expect(useSegmentationStore.getState().preview).not.toBeNull();

    useSplitFaceStore.getState().clearForModelReplacement();
    expect(useSegmentationStore.getState().preview).toBeNull();
    expect(useSegmentationStore.getState().registration.status).toBe(
      "unavailable",
    );
  });
});

describe("segmentation planning for a model never manually split", () => {
  it("produces a real plan (not a missing_authoritative_geometry failure) for a model oversized on first import, before the model has even been clicked/selected", () => {
    useSplitFaceStore.getState().clearForModelReplacement();
    useModelSelectionStore.setState({ selection: { isModelSelected: false } });
    useModelBoundsStore.setState({
      groundedWorldBounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1100, y: 180, z: 150 },
        size: { x: 1100, y: 180, z: 150 },
      },
    });
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 200, y: 200, z: 200 });

    const result = useSegmentationStore.getState().requestPlan();

    expect(result.status).toBe("planned");
    expect(useSegmentationStore.getState().phase).toBe("preview");
    const plan = useSegmentationStore.getState().plan;
    expect(plan).not.toBeNull();
    // Oversized on X only (1100mm part vs 200mm printer, plus clearance) --
    // the engine's own planning must produce at least one X boundary; this
    // proves the Segmentation Engine's real planning ran, not a stub.
    expect(plan!.boundaries.some((boundary) => boundary.axis === "x")).toBe(true);
  });
});
