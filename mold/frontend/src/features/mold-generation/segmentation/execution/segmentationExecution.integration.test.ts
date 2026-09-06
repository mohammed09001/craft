import { cubeMesh } from "../../cavity-generation/cavityGeneration.testFixtures";
import { unavailableRegistration } from "../../registration";
import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition/referenceMoldDefinition.contracts";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { useSplitFaceStore } from "../../split-face/splitFace.store";
import type { FinalMoldResult, MoldDocument, MoldEvaluationState } from "../../workflow";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";

import { useSegmentationModeStore } from "../segmentationMode.store";
import { executeSegmentationPlan } from "../application/segmentationApplication";
import { readCurrentSegmentationSourceSnapshot } from "../application/segmentationSourceSnapshot";
import { executePlaneSegmentation } from "./segmentationPlaneExecutor";

const bounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 12, y: 8, z: 8 },
} as const;

function commitFixture(
  fixtureBounds: Bounds3 = bounds,
  printerVolume = { x: 8, y: 8, z: 8 },
) {
  const volumeMm3 =
    (fixtureBounds.max.x - fixtureBounds.min.x) *
    (fixtureBounds.max.y - fixtureBounds.min.y) *
    (fixtureBounds.max.z - fixtureBounds.min.z);
  const body: MoldBodyData & { readonly geometryVersion: string } = {
    id: "committed-body",
    name: "Committed body",
    visible: true,
    bounds: fixtureBounds,
    triangleCount: 12,
    volumeMm3,
    watertight: true,
    mesh: cubeMesh(fixtureBounds),
    geometryVersion: "body:v1",
  };
  const definition: ReferenceMoldDefinition = {
    schemaVersion: 1,
    definitionId: "definition",
    modelId: "model",
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: fixtureBounds,
    referenceMoldBlock: { clearanceMm: 0, bounds: fixtureBounds },
    moldFrame: {
      frameId: "frame",
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
    revision: 3,
    fingerprint: "document:3",
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
    requestId: "mold-eval:3",
    sourceRevision: 3,
    sourceFingerprint: "document:3",
    stage: "validation",
    progress: 1,
    failure: null,
  };
  const lastCommittedResult: FinalMoldResult = {
    sourceRevision: 3,
    sourceFingerprint: "document:3",
    requestId: "mold-eval:3",
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
  useSplitFaceStore.setState({ document, evaluation, lastCommittedResult });
  usePrinterBuildVolumeStore.getState().setPrinterBuildVolume(printerVolume);
  return body;
}

beforeEach(() => {
  useSegmentationModeStore.getState().reset();
});

describe("segmentation execution lifecycle integration", () => {
  it("executes an accepted plan from the real committed source without replacing it", async () => {
    const sourceBody = commitFixture();
    const planned = useSegmentationModeStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    expect(useSegmentationModeStore.getState().acceptPlan()).toBe(true);

    const result = await useSegmentationModeStore.getState().executeAcceptedPlan();

    expect(result.status).toBe("executed");
    expect(useSegmentationModeStore.getState().phase).toBe("valid");
    expect(useSplitFaceStore.getState().lastCommittedResult?.bodies[0]).toBe(sourceBody);
  });

  it("executes the accepted live-equivalent Y/Z Segmentation plan through the store lifecycle", async () => {
    const sourceBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 24, z: 24 },
    } as const;
    const printerVolume = { x: 8.1, y: 8.1, z: 8.1 };
    commitFixture(sourceBounds, printerVolume);

    const planned = useSegmentationModeStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.plan.requiredAxes).toEqual(["y", "z"]);
    expect(planned.plan.segments).toHaveLength(9);
    expect(useSegmentationModeStore.getState().acceptPlan()).toBe(true);

    const result = await useSegmentationModeStore.getState().executeAcceptedPlan();

    expect(result.status).toBe("executed");
    if (result.status === "executed") expect(result.bodies).toHaveLength(9);
    expect(useSegmentationModeStore.getState().phase).toBe("valid");
  });

  it("derives committed Registration only from executed unkeyed Segmentation bodies", async () => {
    const sourceBody = commitFixture(
      {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 40, y: 40, z: 20 },
      },
      { x: 40, y: 40, z: 10 },
    );
    const planned = useSegmentationModeStore
      .getState()
      .requestPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(useSegmentationModeStore.getState().acceptPlan()).toBe(true);

    const result = await useSegmentationModeStore
      .getState()
      .executeAcceptedPlan();
    const state = useSegmentationModeStore.getState();

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(state.registration.status).toBe("generated");
    expect(state.registration.report!.features.length).toBeGreaterThan(0);
    expect(state.registration.bodies).not.toBe(result.bodies);
    expect(
      state.registration.bodies!.some((body) =>
        body.mesh.faceRuns?.some((run) => run.role === "registration-key"),
      ),
    ).toBe(true);
    expect(result.bodies.every((body) => body.id !== sourceBody.id)).toBe(true);
    expect(useSplitFaceStore.getState().lastCommittedResult?.bodies[0]).toBe(
      sourceBody,
    );
  });

  it("executes multiple X planes against the real committed source snapshot", async () => {
    const sourceBody = commitFixture();
    const planned = useSegmentationModeStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    const boundaryTemplate = planned.plan.boundaries[0]!;
    const segmentTemplate = planned.plan.segments[0]!;
    const boundaries = [4, 8].map((coordinateMm, index) => ({
      ...boundaryTemplate,
      id: `integration-boundary-${index + 1}`,
      coordinateMm,
      ordinal: index + 1,
    }));
    const plan = {
      ...planned.plan,
      boundaries,
      segments: Array.from({ length: 3 }, (_, index) => ({
        ...segmentTemplate,
        id: `integration-segment-${index + 1}`,
        ordinal: index + 1,
        boundaryIntentIds: boundaries.map((boundary) => boundary.id),
      })),
    };

    const result = await executeSegmentationPlan(plan, {
      readSource: readCurrentSegmentationSourceSnapshot,
      readPrinterVolume: () => ({ x: 8, y: 8, z: 8 }),
      runExecution: executePlaneSegmentation,
    });

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(3);
    expect(useSplitFaceStore.getState().lastCommittedResult?.bodies[0]).toBe(sourceBody);
  });

  it("executes multiple Y planes against the real committed source snapshot", async () => {
    const yBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 12, z: 8 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const sourceBody = commitFixture(yBounds, printerVolume);
    const planned = useSegmentationModeStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.plan.requiredAxes).toEqual(["y"]);
    const boundaryTemplate = planned.plan.boundaries[0]!;
    const segmentTemplate = planned.plan.segments[0]!;
    const boundaries = [8, 4].map((coordinateMm, index) => ({
      ...boundaryTemplate,
      id: `integration-y-boundary-${index + 1}`,
      axis: "y" as const,
      coordinateMm,
      ordinal: index + 1,
    }));
    const plan = {
      ...planned.plan,
      boundaries,
      segments: Array.from({ length: 3 }, (_, index) => ({
        ...segmentTemplate,
        id: `integration-y-segment-${index + 1}`,
        ordinal: index + 1,
        boundaryIntentIds: boundaries.map((boundary) => boundary.id),
      })),
    };

    const result = await executeSegmentationPlan(plan, {
      readSource: readCurrentSegmentationSourceSnapshot,
      readPrinterVolume: () => printerVolume,
      runExecution: executePlaneSegmentation,
    });

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.executionRequest.executionAxis).toBe("y");
    const yIntervals = result.bodies.map((body) => [
      body.bounds.min.y,
      body.bounds.max.y,
    ]);
    expect(yIntervals).toHaveLength(3);
    expect(yIntervals[0]![0]).toBeCloseTo(0);
    expect(yIntervals[0]![1]).toBeCloseTo(4);
    expect(yIntervals[1]![0]).toBeCloseTo(4);
    expect(yIntervals[1]![1]).toBeCloseTo(8);
    expect(yIntervals[2]![0]).toBeCloseTo(8);
    expect(yIntervals[2]![1]).toBeCloseTo(12);
    expect(useSplitFaceStore.getState().lastCommittedResult?.bodies[0]).toBe(sourceBody);
  });

  it("executes multiple Z planes against the real committed source snapshot", async () => {
    const zBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 8, z: 12 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const sourceBody = commitFixture(zBounds, printerVolume);
    const planned = useSegmentationModeStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.plan.requiredAxes).toEqual(["z"]);
    const boundaryTemplate = planned.plan.boundaries[0]!;
    const segmentTemplate = planned.plan.segments[0]!;
    const boundaries = [8, 4].map((coordinateMm, index) => ({
      ...boundaryTemplate,
      id: `integration-z-boundary-${index + 1}`,
      axis: "z" as const,
      coordinateMm,
      ordinal: index + 1,
    }));
    const plan = {
      ...planned.plan,
      boundaries,
      segments: Array.from({ length: 3 }, (_, index) => ({
        ...segmentTemplate,
        id: `integration-z-segment-${index + 1}`,
        ordinal: index + 1,
        boundaryIntentIds: boundaries.map((boundary) => boundary.id),
      })),
    };

    const result = await executeSegmentationPlan(plan, {
      readSource: readCurrentSegmentationSourceSnapshot,
      readPrinterVolume: () => printerVolume,
      runExecution: executePlaneSegmentation,
    });

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.executionRequest.executionAxis).toBe("z");
    const zIntervals = result.bodies.map((body) => [
      body.bounds.min.z,
      body.bounds.max.z,
    ]);
    expect(zIntervals).toHaveLength(3);
    expect(zIntervals[0]![0]).toBeCloseTo(0);
    expect(zIntervals[0]![1]).toBeCloseTo(4);
    expect(zIntervals[1]![0]).toBeCloseTo(4);
    expect(zIntervals[1]![1]).toBeCloseTo(8);
    expect(zIntervals[2]![0]).toBeCloseTo(8);
    expect(zIntervals[2]![1]).toBeCloseTo(12);
    expect(useSplitFaceStore.getState().lastCommittedResult?.bodies[0]).toBe(sourceBody);
  });

  it("rejects a Y execution result after printer-volume invalidation", async () => {
    const yBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 12, z: 8 },
    } as const;
    commitFixture(yBounds, { x: 8, y: 8, z: 8 });
    const planned = useSegmentationModeStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.plan.requiredAxes).toEqual(["y"]);
    let resolveExecution!: (value: Awaited<ReturnType<typeof executePlaneSegmentation>>) => void;
    let currentVolume = { x: 8, y: 8, z: 8 };
    let executionRequest: Parameters<typeof executePlaneSegmentation>[0] | null = null;
    const pending = executeSegmentationPlan(planned.plan, {
      readSource: readCurrentSegmentationSourceSnapshot,
      readPrinterVolume: () => currentVolume,
      runExecution: (request) => {
        executionRequest = request;
        return (
        new Promise((resolve) => {
          resolveExecution = resolve;
        })
        );
      },
    });
    currentVolume = { x: 8, y: 9, z: 8 };
    expect(executionRequest).not.toBeNull();
    resolveExecution(await executePlaneSegmentation(executionRequest!));

    const result = await pending;
    expect(result.status).toBe("stale");
  });

  it("rejects a Z execution result after printer-volume invalidation", async () => {
    const zBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 8, z: 12 },
    } as const;
    commitFixture(zBounds, { x: 8, y: 8, z: 8 });
    const planned = useSegmentationModeStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.plan.requiredAxes).toEqual(["z"]);
    let resolveExecution!: (value: Awaited<ReturnType<typeof executePlaneSegmentation>>) => void;
    let currentVolume = { x: 8, y: 8, z: 8 };
    let executionRequest: Parameters<typeof executePlaneSegmentation>[0] | null = null;
    const pending = executeSegmentationPlan(planned.plan, {
      readSource: readCurrentSegmentationSourceSnapshot,
      readPrinterVolume: () => currentVolume,
      runExecution: (request) => {
        executionRequest = request;
        return new Promise((resolve) => {
          resolveExecution = resolve;
        });
      },
    });
    currentVolume = { x: 8, y: 8, z: 9 };
    expect(executionRequest).not.toBeNull();
    resolveExecution(await executePlaneSegmentation(executionRequest!));

    const result = await pending;
    expect(result.status).toBe("stale");
  });

  it("rejects a stale authoritative source before worker dispatch", async () => {
    commitFixture();
    const planned = useSegmentationModeStore.getState().requestPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    const runExecution = vi.fn();
    const result = await executeSegmentationPlan(planned.plan, {
      readSource: () => ({
        status: "stale",
        reasonCode: "stale_source_revision",
        issues: [{
          severity: "blocker",
          reasonCode: "stale_source_revision",
          message: "Fixture source is stale.",
        }],
      }),
      readPrinterVolume: () => ({ x: 8, y: 8, z: 8 }),
      runExecution,
    });
    expect(result).toMatchObject({
      status: "stale",
      reasonCode: "stale_execution_source",
    });
    expect(runExecution).not.toHaveBeenCalled();
  });
});
