import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { useModelSelectionStore } from "@/features/viewport/modelSelection.store";

import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition/referenceMoldDefinition.contracts";
import type {
  FinalMoldResult,
  MoldDocument,
  MoldEvaluationState,
} from "../../workflow";
import { unavailableRegistration } from "../../registration";
import { useSplitFaceStore } from "../../split-face/splitFace.store";
import {
  captureSegmentationSourceSnapshot,
  readCurrentSegmentationSourceSnapshot,
} from "./segmentationSourceSnapshot";

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

describe("authoritative segmentation source snapshot", () => {
  it("requires committed final mold geometry", () => {
    expect(
      captureSegmentationSourceSnapshot({
        document,
        evaluation,
        lastCommittedResult: null,
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "missing_authoritative_geometry",
    });
  });

  it("rejects a result from an older mold revision", () => {
    expect(
      captureSegmentationSourceSnapshot({
        document: { ...document, revision: 5, fingerprint: "fingerprint-5" },
        evaluation,
        lastCommittedResult: committed,
      }),
    ).toMatchObject({
      status: "stale",
      reasonCode: "stale_source_revision",
    });
  });

  it("captures readonly committed bodies and their document identity", () => {
    const result = captureSegmentationSourceSnapshot({
      document,
      evaluation,
      lastCommittedResult: committed,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.snapshot.bodies[0]).toBe(body);
    expect(result.snapshot.aggregateBounds).toEqual(bounds);
    expect(result.snapshot.identity).toMatchObject({
      documentRevision: 4,
      documentFingerprint: "fingerprint-4",
      resultRequestId: "mold-eval:4",
      definitionId: "definition-a",
    });
    expect(result.snapshot.protectedRegionEvidence.status).toBe("incomplete");
    expect(result.snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reasonCode: "protected_region_evidence_incomplete",
        }),
      ]),
    );
  });
});

describe("readCurrentSegmentationSourceSnapshot -- synthetic whole-block fallback", () => {
  const originalSplitFaceState = useSplitFaceStore.getState();
  const originalSelectionState = useModelSelectionStore.getState();
  const originalModelBoundsState = useModelBoundsStore.getState();

  afterEach(() => {
    useSplitFaceStore.setState(originalSplitFaceState, true);
    useModelSelectionStore.setState(originalSelectionState, true);
    useModelBoundsStore.setState(originalModelBoundsState, true);
  });

  it("falls back to a synthetic whole-K2-block body derived from groundedWorldBounds when no model has ever been split (e.g. oversized on import), even before the model is clicked/selected", () => {
    useSplitFaceStore.getState().clearForModelReplacement();
    useModelSelectionStore.setState({ selection: { isModelSelected: false } });
    useModelBoundsStore.setState({
      groundedWorldBounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1100, y: 180, z: 150 },
        size: { x: 1100, y: 180, z: 150 },
      },
    });

    const result = readCurrentSegmentationSourceSnapshot();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.snapshot.bodies).toHaveLength(1);
    const body = result.snapshot.bodies[0]!;
    expect(body.watertight).toBe(true);
    expect(body.mesh.positions).toHaveLength(24);
    expect(body.mesh.indices).toHaveLength(36);
    expect(body.triangleCount).toBe(12);

    const clearanceMm = 100;
    expect(result.snapshot.aggregateBounds).toEqual({
      min: { x: -clearanceMm, y: -clearanceMm, z: 0 },
      max: {
        x: 1100 + clearanceMm,
        y: 180 + clearanceMm,
        z: 150 + clearanceMm * 2,
      },
    });
    expect(result.definition.moldFrame?.partOffset.z).toBe(clearanceMm);
  });

  it("does not fall back when no model has been imported at all", () => {
    useSplitFaceStore.getState().clearForModelReplacement();
    useModelBoundsStore.setState({ groundedWorldBounds: null });

    expect(readCurrentSegmentationSourceSnapshot()).toMatchObject({
      status: "failed",
      reasonCode: "missing_authoritative_geometry",
    });
  });

  it("uses the automatic 100 mm-minimum envelope instead of a smaller committed normal-workflow mold", () => {
    useSplitFaceStore.setState({
      document,
      definition,
      evaluation,
      lastCommittedResult: committed,
    });
    useModelBoundsStore.setState({
      groundedWorldBounds: { min: bounds.min, max: bounds.max, size: { x: 250, y: 50, z: 50 } },
    });

    const result = readCurrentSegmentationSourceSnapshot();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.snapshot.bodies[0]).not.toBe(body);
    expect(result.definition.referenceMoldBlock.clearanceMm).toBe(100);
    expect(result.snapshot.aggregateBounds).toEqual({
      min: { x: -100, y: -100, z: 0 },
      max: { x: 350, y: 150, z: 250 },
    });
  });

  it("does not silently replace a stale committed result with the synthetic fallback", () => {
    useSplitFaceStore.setState({
      document: { ...document, revision: 5, fingerprint: "fingerprint-5" },
      definition,
      evaluation,
      lastCommittedResult: committed,
    });
    useModelBoundsStore.setState({
      groundedWorldBounds: { min: bounds.min, max: bounds.max, size: { x: 250, y: 50, z: 50 } },
    });

    expect(readCurrentSegmentationSourceSnapshot()).toMatchObject({
      status: "stale",
      reasonCode: "stale_source_revision",
    });
  });

  it("does not silently replace a structurally invalid committed result with the synthetic fallback", () => {
    useSplitFaceStore.setState({
      document,
      definition,
      evaluation,
      lastCommittedResult: { ...committed, bodies: [] },
    });
    useModelBoundsStore.setState({
      groundedWorldBounds: { min: bounds.min, max: bounds.max, size: { x: 250, y: 50, z: 50 } },
    });

    expect(readCurrentSegmentationSourceSnapshot()).toMatchObject({
      status: "failed",
      reasonCode: "invalid_authoritative_geometry",
    });
  });
});
