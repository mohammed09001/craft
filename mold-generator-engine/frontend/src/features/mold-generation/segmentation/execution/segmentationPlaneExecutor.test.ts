import { canonicalCube, cubeMesh } from "../../cavity-generation/cavityGeneration.testFixtures";
import { assertCavityCoordinateAlignment } from "../../cavity-generation/cavityBody.generator";
import type { CavityGenerationInput, CavityToolData } from "../../cavity-generation/cavityGeneration.contracts";
import { buildCavityGenerationInput } from "../../cavity-generation/cavityGeneration.input";
import { createCavityTool } from "../../cavity-generation/manifold.engine";
import { validateAndPreparePartSolid } from "../../cavity-generation/partSolid.validator";
import { generateCavityBodies } from "../../cavity-generation/cavityBody.generator";
import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition/referenceMoldDefinition.contracts";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { createSegmentationRequest } from "../application/segmentationApplication";
import { resolveSegmentationModeStrategy } from "../application/segmentationModeStrategies";
import { baselineSegmentationAlgorithm } from "../domain/baselineSegmentationAlgorithm";
import { planSegmentation } from "../domain/planSegmentation";
import type {
  SegmentationMode,
  SegmentationPlan,
  SegmentationSourceSnapshot,
} from "../domain/segmentation.contracts";
import { deterministicSegmentationId } from "../domain/segmentationIdentity";
import { canCommitSegmentationExecution } from "./segmentationExecutionCommitGate";
import { createSegmentationExecutionRequest } from "./segmentationExecutionPreflight";
import { executePlaneSegmentation } from "./segmentationPlaneExecutor";
import type { Size3 } from "../fitAnalysis";

const bounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 12, y: 8, z: 8 },
} as const;

function fixture(
  mode: SegmentationMode = "make-as-one-mold",
  sourceBounds: Bounds3 = bounds,
  printerVolume: Size3 = { x: 8, y: 8, z: 8 },
  meshOverride?: { readonly mesh: ReturnType<typeof cubeMesh>; readonly volumeMm3: number },
) {
  const volumeMm3 =
    meshOverride?.volumeMm3 ??
    (sourceBounds.max.x - sourceBounds.min.x) *
      (sourceBounds.max.y - sourceBounds.min.y) *
      (sourceBounds.max.z - sourceBounds.min.z);
  const body: MoldBodyData & { readonly geometryVersion: string } = {
    id: "committed-body",
    name: "Committed body",
    visible: true,
    bounds: sourceBounds,
    triangleCount: 12,
    volumeMm3,
    watertight: true,
    mesh: meshOverride?.mesh ?? cubeMesh(sourceBounds),
    geometryVersion: "body:v1",
  };
  const source: SegmentationSourceSnapshot = {
    identity: {
      documentRevision: 3,
      documentFingerprint: "document:3",
      resultRequestId: "mold-eval:3",
      definitionId: "definition",
      modelId: "model",
      frameId: "frame",
      bodySignature: "body-signature",
      protectedRegionSignature: "protected-signature",
    },
    bodies: [body],
    aggregateBounds: sourceBounds,
    protectedRegions: [],
    protectedRegionEvidence: { status: "incomplete", reason: "Planning evidence only." },
    warnings: [],
    units: "millimeters",
    upAxis: "Z",
  };
  const strategy = resolveSegmentationModeStrategy(mode);
  const request = createSegmentationRequest({
    mode,
    source,
    printerVolume,
    strategy,
  });
  const result = planSegmentation({
    request,
    source,
    algorithm: baselineSegmentationAlgorithm,
    strategy,
  });
  expect(result.status).toBe("planned");
  if (result.status !== "planned") throw new Error("Expected a plan.");
  return { body, source, plan: result.plan };
}

function executionRequest(
  plan: SegmentationPlan,
  source: SegmentationSourceSnapshot,
  printerVolume: Size3 = { x: 8, y: 8, z: 8 },
) {
  const preflight = createSegmentationExecutionRequest({
    plan,
    source,
    printerVolume,
  });
  expect(preflight.ok).toBe(true);
  if (!preflight.ok) throw new Error("Expected supported execution.");
  return preflight.request;
}

function boundsFromPayloadPositions(
  positions: readonly number[],
): Bounds3 {
  const bounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
  for (let index = 0; index < positions.length; index += 3) {
    bounds.min.x = Math.min(bounds.min.x, positions[index]!);
    bounds.min.y = Math.min(bounds.min.y, positions[index + 1]!);
    bounds.min.z = Math.min(bounds.min.z, positions[index + 2]!);
    bounds.max.x = Math.max(bounds.max.x, positions[index]!);
    bounds.max.y = Math.max(bounds.max.y, positions[index + 1]!);
    bounds.max.z = Math.max(bounds.max.z, positions[index + 2]!);
  }
  return bounds;
}

function withXBoundaries(
  plan: SegmentationPlan,
  coordinates: readonly number[],
): SegmentationPlan {
  const boundaries = coordinates.map((coordinateMm, index) => ({
    ...plan.boundaries[0]!,
    id: deterministicSegmentationId("boundary", {
      planId: plan.id,
      coordinateMm,
    }),
    axis: "x" as const,
    coordinateMm,
    ordinal: index + 1,
  }));
  const template = plan.segments[0]!;
  const segments = Array.from(
    { length: coordinates.length + 1 },
    (_, index) => ({
      ...template,
      id: deterministicSegmentationId("segment", {
        planId: plan.id,
        index,
      }),
      ordinal: index + 1,
      boundaryIntentIds: boundaries.map((boundary) => boundary.id),
    }),
  );
  return { ...plan, boundaries, segments };
}

function withYBoundaries(
  plan: SegmentationPlan,
  coordinates: readonly number[],
): SegmentationPlan {
  const boundaries = coordinates.map((coordinateMm, index) => ({
    ...plan.boundaries[0]!,
    id: deterministicSegmentationId("boundary", {
      planId: plan.id,
      axis: "y",
      coordinateMm,
    }),
    axis: "y" as const,
    coordinateMm,
    ordinal: index + 1,
  }));
  const template = plan.segments[0]!;
  const segments = Array.from(
    { length: coordinates.length + 1 },
    (_, index) => ({
      ...template,
      id: deterministicSegmentationId("segment", {
        planId: plan.id,
        axis: "y",
        index,
      }),
      ordinal: index + 1,
      boundaryIntentIds: boundaries.map((boundary) => boundary.id),
    }),
  );
  return { ...plan, requiredAxes: ["y"], boundaries, segments };
}

function withZBoundaries(
  plan: SegmentationPlan,
  coordinates: readonly number[],
): SegmentationPlan {
  const boundaries = coordinates.map((coordinateMm, index) => ({
    ...plan.boundaries[0]!,
    id: deterministicSegmentationId("boundary", {
      planId: plan.id,
      axis: "z",
      coordinateMm,
    }),
    axis: "z" as const,
    coordinateMm,
    ordinal: index + 1,
  }));
  const template = plan.segments[0]!;
  const segments = Array.from(
    { length: coordinates.length + 1 },
    (_, index) => ({
      ...template,
      id: deterministicSegmentationId("segment", {
        planId: plan.id,
        axis: "z",
        index,
      }),
      ordinal: index + 1,
      boundaryIntentIds: boundaries.map((boundary) => boundary.id),
    }),
  );
  return { ...plan, requiredAxes: ["z"], boundaries, segments };
}

function withMixedBoundaries(
  plan: SegmentationPlan,
  entries: readonly { readonly axis: "x" | "y" | "z"; readonly coordinateMm: number }[],
): SegmentationPlan {
  const perAxisOrdinal: Partial<Record<"x" | "y" | "z", number>> = {};
  const boundaries = entries.map((entry, index) => {
    const ordinal = (perAxisOrdinal[entry.axis] = (perAxisOrdinal[entry.axis] ?? 0) + 1);
    return {
      ...plan.boundaries[0]!,
      id: deterministicSegmentationId("boundary", {
        planId: plan.id,
        axis: entry.axis,
        coordinateMm: entry.coordinateMm,
        sequenceIndex: index + 1,
      }),
      axis: entry.axis,
      coordinateMm: entry.coordinateMm,
      ordinal,
      sequenceIndex: index + 1,
    };
  });
  const requiredAxes = (["x", "y", "z"] as const).filter((axis) =>
    entries.some((entry) => entry.axis === axis),
  );
  const template = plan.segments[0]!;
  const segments = Array.from({ length: boundaries.length + 1 }, (_, index) => ({
    ...template,
    id: deterministicSegmentationId("segment", { planId: plan.id, mixed: true, index }),
    ordinal: index + 1,
    boundaryIntentIds: boundaries.map((boundary) => boundary.id),
  }));
  return { ...plan, requiredAxes, boundaries, segments };
}

type Axis3 = "x" | "y" | "z";

function axisPoint(u: number, v: number, w: number, uAxis: Axis3, vAxis: Axis3, wAxis: Axis3) {
  const point = { x: 0, y: 0, z: 0 };
  point[uAxis] = u;
  point[vAxis] = v;
  point[wAxis] = w;
  return point;
}

const CYCLIC_ROTATIONS: readonly (readonly [Axis3, Axis3, Axis3])[] = [
  ["x", "y", "z"],
  ["y", "z", "x"],
  ["z", "x", "y"],
];

function isEvenPermutation(uAxis: Axis3, vAxis: Axis3, wAxis: Axis3): boolean {
  return CYCLIC_ROTATIONS.some(
    (rotation) => rotation[0] === uAxis && rotation[1] === vAxis && rotation[2] === wAxis,
  );
}

// A single notch corner (u in [6,12], v in [4,8] removed from a 12x8
// rectangle) extruded along wAxis. Cutting along uAxis first, then vAxis,
// produces two fragments with genuinely different vAxis extents - unlike a
// plain box, where any second cut on a different axis is always ambiguous
// because both fragments still span the untouched axis identically.
const L_POLYGON: readonly (readonly [number, number])[] = [
  [0, 0],
  [12, 0],
  [12, 4],
  [6, 4],
  [6, 8],
  [0, 8],
];

function lShapedMesh(input: {
  readonly uAxis: Axis3;
  readonly vAxis: Axis3;
  readonly wAxis: Axis3;
  readonly wRange: readonly [number, number];
}): ReturnType<typeof cubeMesh> {
  const { uAxis, vAxis, wAxis, wRange } = input;
  const polygon = isEvenPermutation(uAxis, vAxis, wAxis)
    ? L_POLYGON
    : [...L_POLYGON].reverse();
  const n = polygon.length;
  const bottom = polygon.map(([u, v]) => axisPoint(u, v, wRange[0], uAxis, vAxis, wAxis));
  const top = polygon.map(([u, v]) => axisPoint(u, v, wRange[1], uAxis, vAxis, wAxis));
  const positions: number[] = [];
  for (const point of [...bottom, ...top]) positions.push(point.x, point.y, point.z);
  const B = (i: number) => i;
  const T = (i: number) => n + i;
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    indices.push(B(i), B(j), T(j), B(i), T(j), T(i));
  }
  for (let i = 1; i < n - 1; i += 1) indices.push(T(0), T(i), T(i + 1));
  for (let i = 1; i < n - 1; i += 1) indices.push(B(0), B(i + 1), B(i));
  return { positions, indices };
}

// L_POLYGON's area is 72 (a 12x8 rectangle minus a 6x4 notch corner).
const L_SHAPE_CROSS_SECTION_AREA = 72;

describe("segmentation plane executor", () => {
  it("splits one authoritative body into deterministic positive and negative solids without mutation", async () => {
    const { body, source, plan } = fixture();
    const asymmetricBoundary = {
      ...plan.boundaries[0]!,
      id: deterministicSegmentationId("boundary", { planId: plan.id, coordinateMm: 4 }),
      coordinateMm: 4,
    };
    const executablePlan = { ...plan, boundaries: [asymmetricBoundary] };
    const request = executionRequest(executablePlan, source);
    const before = structuredClone(body);

    const first = await executePlaneSegmentation(request);
    const second = await executePlaneSegmentation(request);

    expect(first.status).toBe("executed");
    expect(second.status).toBe("executed");
    if (first.status !== "executed" || second.status !== "executed") return;
    expect(first.bodies).toHaveLength(2);
    expect(first.bodies.map((output) => output.provenance.side)).toEqual([
      "negative",
      "positive",
    ]);
    expect(first.bodies.map((output) => output.id)).toEqual(
      second.bodies.map((output) => output.id),
    );
    expect(first.bodies[0]!.bounds.max.x).toBeCloseTo(4);
    expect(first.bodies[1]!.bounds.min.x).toBeCloseTo(4);
    expect(first.validation).toMatchObject({
      boundsPrintable: "verified",
      geometryExecuted: "verified",
      geometryValid: "verified",
      manufacturingSafety: "not-established",
    });
    expect(first.validation.volumeDeltaMm3).toBeLessThanOrEqual(
      first.validation.policy.volumeToleranceMm3,
    );
    expect(body).toEqual(before);
  });

  it("rejects unsupported plan shapes before geometry execution", () => {
    const { source, plan } = fixture();
    const preflight = createSegmentationExecutionRequest({
      plan: { ...plan, boundaries: [...plan.boundaries, plan.boundaries[0]!] },
      source,
      printerVolume: { x: 8, y: 8, z: 8 },
    });
    expect(preflight).toMatchObject({
      ok: false,
      result: { status: "unsupported", reasonCode: "unsupported_execution_shape" },
    });
  });

  it("executes the live-equivalent Y/Z Cartesian One Mold grid with the planned nine bodies", async () => {
    const sourceBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 24, z: 24 },
    } as const;
    const printerVolume = { x: 8.1, y: 8.1, z: 8.1 };
    const { body, source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
    );
    const before = structuredClone(body);

    expect(plan.requiredAxes).toEqual(["y", "z"]);
    expect(plan.perAxisSegmentCount).toEqual({ x: 1, y: 3, z: 3 });
    expect(plan.segments).toHaveLength(9);
    expect(plan.boundaries).toHaveLength(4);
    expect(plan.boundaries.filter((boundary) => boundary.axis === "y").every(
      (boundary) => boundary.executionTargeting === undefined,
    )).toBe(true);
    expect(plan.boundaries.filter((boundary) => boundary.axis === "z").every(
      (boundary) => boundary.executionTargeting === "all-straddling",
    )).toBe(true);

    const result = await executePlaneSegmentation(
      executionRequest(plan, source, printerVolume),
    );

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(9);
    expect(result.validation.volumeDeltaMm3).toBeLessThanOrEqual(
      result.validation.policy.volumeToleranceMm3,
    );
    expect(result.validation.overlapVolumeMm3).toBeLessThanOrEqual(
      result.validation.policy.overlapToleranceMm3,
    );
    expect(result.validation.geometryValid).toBe("verified");
    expect(body).toEqual(before);
  });

  it("keeps fractional translated Cartesian bodies aligned with their persisted mesh payload for Create Cavity", async () => {
    const sourceBounds = {
      min: { x: 10.123, y: 20.456, z: 30.789 },
      max: { x: 18.123, y: 44.456, z: 54.789 },
    } as const;
    const printerVolume = { x: 8.1, y: 8.1, z: 8.1 };
    const { source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
    );
    const result = await executePlaneSegmentation(
      executionRequest(plan, source, printerVolume),
    );

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    const partBounds = {
      min: { x: 11, y: 21, z: 31 },
      max: { x: 17, y: 27, z: 37 },
    };
    const input = {
      partBoundingBox: partBounds,
      referenceMoldBlockBounds: sourceBounds,
      moldBodies: result.bodies,
      geometryToleranceMm: Math.hypot(8, 24, 24) * 1e-8,
    } as unknown as CavityGenerationInput;
    const tool = {
      bounds: partBounds,
      mesh: cubeMesh(partBounds),
    } as CavityToolData;

    expect(() => assertCavityCoordinateAlignment(input, tool)).not.toThrow();
  });

  it("runs Create Cavity Boolean generation after fractional translated One Mold segmentation", async () => {
    const sourceBounds = {
      min: { x: 10, y: 20, z: 30 },
      max: { x: 18, y: 45, z: 55 },
    } as const;
    const printerVolume = { x: 8.4, y: 8.4, z: 8.4 };
    const { source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
    );
    const segmentation = await executePlaneSegmentation(
      executionRequest(plan, source, printerVolume),
    );
    expect(segmentation.status).toBe("executed");
    if (segmentation.status !== "executed") return;

    const partBounds = {
      min: { x: 11, y: 21, z: 31 },
      max: { x: 17, y: 27, z: 37 },
    };
    const definition: ReferenceMoldDefinition = {
      schemaVersion: 1,
      definitionId: "fractional-segmentation",
      modelId: "model",
      coordinateSystem: { units: "millimeters", upAxis: "Z" },
      selectionBoxBounds: partBounds,
      referenceMoldBlock: { clearanceMm: 0, bounds: sourceBounds },
      moldBodies: segmentation.bodies,
      moldBodiesPartitionReferenceBlock: false,
      usedFaces: [],
      moldFrame: {
        frameId: "fractional-frame",
        version: 1,
        units: "millimeters",
        upAxis: "Z",
        partOffset: { x: 0, y: 0, z: 0 },
        semanticFaces: {
          front: { axis: "y", direction: 1 }, back: { axis: "y", direction: -1 },
          left: { axis: "x", direction: -1 }, right: { axis: "x", direction: 1 },
          top: { axis: "z", direction: 1 }, bottom: { axis: "z", direction: -1 },
        },
      },
    };
    const input = buildCavityGenerationInput({
      sourcePartMesh: canonicalCube("model", partBounds),
      definition,
      cuttingPlanes: [],
      cavityClearanceMm: 0,
      qualityMode: "standard",
      generationVersion: 1,
    });
    const prepared = validateAndPreparePartSolid(input);
    expect(prepared.ok).toBe(true);
    const preparedSolid = prepared.prepared;
    if (!prepared.ok || preparedSolid === null) return;
    const tool = await createCavityTool(
      preparedSolid,
      0,
      "standard",
      input.tolerancePolicy.booleanToleranceMm,
    );
    const cavity = await generateCavityBodies(input, tool);

    expect(cavity.blockers).toHaveLength(0);
    expect(cavity.subtractionDiagnostics?.affectedBodyCount).toBeGreaterThan(0);
    expect(cavity.subtractionDiagnostics?.removedVolumeMm3).toBeGreaterThan(0);
  });

  it.each([
    ["2 pieces", { x: 16, y: 8, z: 8 }, 2],
    ["4 pieces", { x: 16, y: 16, z: 8 }, 4],
    ["2x2x2", { x: 16, y: 16, z: 16 }, 8],
    ["3x3", { x: 8, y: 25, z: 25 }, 9],
    ["2x5", { x: 16, y: 40, z: 8 }, 10],
    ["20 pieces", { x: 8, y: 40, z: 32 }, 20],
    ["2x5x2 at negative coordinates", { x: 16, y: 40, z: 16 }, 20],
  ])("keeps every persisted body bounds-aligned for adaptive %s segmentation", async (
    _label,
    size,
    expectedBodyCount,
  ) => {
    const origin = _label.includes("negative")
      ? { x: -10, y: -20, z: -30 }
      : { x: 10, y: 20, z: 30 };
    const sourceBounds = {
      min: origin,
      max: {
        x: origin.x + size.x,
        y: origin.y + size.y,
        z: origin.z + size.z,
      },
    };
    const printerVolume = { x: 8.4, y: 8.4, z: 8.4 };
    const { source, plan } = fixture("make-as-one-mold", sourceBounds, printerVolume);
    expect(plan.segments).toHaveLength(expectedBodyCount);

    const result = await executePlaneSegmentation(
      executionRequest(plan, source, printerVolume),
    );

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(expectedBodyCount);
    expect(new Set(result.bodies.map((body) => body.id)).size).toBe(expectedBodyCount);
    expect(result.validation.geometryValid).toBe("verified");
    expect(result.validation.overlapVolumeMm3).toBeLessThanOrEqual(
      result.validation.policy.overlapToleranceMm3,
    );
    expect(result.validation.volumeDeltaMm3).toBeLessThanOrEqual(
      result.validation.policy.volumeToleranceMm3 * result.validation.cuts.length,
    );
    for (const body of result.bodies) {
      expect(body.bounds).toEqual(boundsFromPayloadPositions(body.mesh.positions));
    }
  });

  it("uses the same Cartesian targeting contract for Automatic More Molds", async () => {
    const sourceBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 24, z: 24 },
    } as const;
    const printerVolume = { x: 8.1, y: 8.1, z: 8.1 };
    const { source, plan } = fixture(
      "make-as-more-molds",
      sourceBounds,
      printerVolume,
    );

    expect(plan.requiredAxes).toEqual(["y", "z"]);
    expect(plan.segments).toHaveLength(9);
    const result = await executePlaneSegmentation(
      executionRequest(plan, source, printerVolume),
    );

    expect(result.status).toBe("executed");
    if (result.status === "executed") expect(result.bodies).toHaveLength(9);
  });

  it("executes a three-axis Cartesian grid to its planned body count", async () => {
    const sourceBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 16, y: 16, z: 16 },
    } as const;
    const printerVolume = { x: 8.1, y: 8.1, z: 8.1 };
    const { source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
    );

    expect(plan.requiredAxes).toEqual(["x", "y", "z"]);
    expect(plan.perAxisSegmentCount).toEqual({ x: 2, y: 2, z: 2 });
    expect(plan.segments).toHaveLength(8);
    expect(plan.boundaries.filter((boundary) => boundary.axis === "x").every(
      (boundary) => boundary.executionTargeting === undefined,
    )).toBe(true);
    expect(plan.boundaries.filter((boundary) => boundary.axis !== "x").every(
      (boundary) => boundary.executionTargeting === "all-straddling",
    )).toBe(true);

    const result = await executePlaneSegmentation(
      executionRequest(plan, source, printerVolume),
    );

    expect(result.status).toBe("executed");
    if (result.status === "executed") {
      expect(result.bodies).toHaveLength(plan.segments.length);
      expect(result.validation.volumeDeltaMm3).toBeLessThanOrEqual(
        result.validation.policy.volumeToleranceMm3,
      );
      expect(result.validation.overlapVolumeMm3).toBeLessThanOrEqual(
        result.validation.policy.overlapToleranceMm3,
      );
    }
  });

  it("executes multiple accepted X planes through deterministic sequential replacement", async () => {
    const { body, source, plan } = fixture();
    const executablePlan = withXBoundaries(plan, [4, 8]);
    const request = executionRequest(executablePlan, source);
    const before = structuredClone(body);

    const result = await executePlaneSegmentation(request);

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(3);
    const intervals = result.bodies.map((output) => [
      output.bounds.min.x,
      output.bounds.max.x,
    ]);
    expect(intervals).toHaveLength(3);
    expect(intervals[0]![0]).toBeCloseTo(0);
    expect(intervals[0]![1]).toBeCloseTo(4);
    expect(intervals[1]![0]).toBeCloseTo(4);
    expect(intervals[1]![1]).toBeCloseTo(8);
    expect(intervals[2]![0]).toBeCloseTo(8);
    expect(intervals[2]![1]).toBeCloseTo(12);
    expect(result.validation.cuts).toHaveLength(2);
    expect(result.validation.cuts[1]!.inputBodyId).toBe(
      result.validation.cuts[0]!.outputBodyIds[1],
    );
    expect(result.bodies[1]!.provenance.parentBodyId).toBe(
      result.validation.cuts[0]!.outputBodyIds[1],
    );
    expect(result.bodies[1]!.provenance.boundaryLineage).toEqual(
      request.planes.map((plane) => plane.boundaryId),
    );
    expect(result.validation.bodies.every(
      (validation) => validation.printableByBounds === true,
    )).toBe(true);
    expect(body).toEqual(before);
  });

  it("supports three X planes and defers only a uniquely scheduled intermediate fit", async () => {
    const { source, plan } = fixture();
    const request = executionRequest(
      withXBoundaries(plan, [3, 6, 9]),
      source,
    );
    const result = await executePlaneSegmentation({
      ...request,
      printerVolume: { x: 3.1, y: 8, z: 8 },
    });

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(4);
    expect(result.validation.cuts[0]!.bodies).toContainEqual(
      expect.objectContaining({ printableByBounds: "deferred" }),
    );
    expect(result.validation.cuts[1]!.bodies).toContainEqual(
      expect.objectContaining({ printableByBounds: "deferred" }),
    );
    expect(result.validation.bodies.every(
      (validation) => validation.printableByBounds === true,
    )).toBe(true);
  });

  it("normalizes canonical plane and final-body order reproducibly", async () => {
    const { source, plan } = fixture();
    const orderedPlan = withXBoundaries(plan, [4, 8]);
    const reversedPlan = {
      ...orderedPlan,
      boundaries: [...orderedPlan.boundaries].reverse(),
    };
    const orderedRequest = executionRequest(orderedPlan, source);
    const reversedRequest = executionRequest(reversedPlan, source);

    expect(reversedRequest.planes.map((plane) => plane.coordinateMm)).toEqual([4, 8]);
    expect(reversedRequest.planeSequenceSignature).toBe(
      orderedRequest.planeSequenceSignature,
    );
    expect(reversedRequest.id).toBe(orderedRequest.id);

    const first = await executePlaneSegmentation(orderedRequest);
    const second = await executePlaneSegmentation(reversedRequest);
    expect(first.status).toBe("executed");
    expect(second.status).toBe("executed");
    if (first.status !== "executed" || second.status !== "executed") return;

    expect(second.bodies.map((body) => ({
      id: body.id,
      geometryVersion: body.geometryVersion,
      provenance: body.provenance,
      bounds: body.bounds,
      mesh: body.mesh,
    }))).toEqual(first.bodies.map((body) => ({
      id: body.id,
      geometryVersion: body.geometryVersion,
      provenance: body.provenance,
      bounds: body.bounds,
      mesh: body.mesh,
    })));
  });

  it("rejects coincident accepted X planes within execution tolerance", () => {
    const { source, plan } = fixture();
    const preflight = createSegmentationExecutionRequest({
      plan: withXBoundaries(plan, [4, 4]),
      source,
      printerVolume: { x: 8, y: 8, z: 8 },
    });
    expect(preflight).toMatchObject({
      ok: false,
      result: { status: "failed", reasonCode: "duplicate_cut_plane" },
    });
  });

  it("executes ordered Y planes with deterministic continuation, ordering, identity, and provenance", async () => {
    const yBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 12, z: 8 },
    } as const;
    const printerVolume = { x: 8, y: 4.1, z: 8 };
    const { body, source, plan } = fixture(
      "make-as-one-mold",
      yBounds,
      printerVolume,
    );
    const yPlan = withYBoundaries(plan, [8, 4]);
    const planBeforePreflight = structuredClone(yPlan);
    const request = executionRequest(yPlan, source, printerVolume);
    const before = structuredClone(body);

    expect(request.executionAxis).toBe("y");
    expect(yPlan).toEqual(planBeforePreflight);
    expect(request.planes.map((plane) => plane.coordinateMm)).toEqual([4, 8]);
    expect(request.planes.every((plane) =>
      plane.axis === "y" &&
      plane.normal[0] === 0 &&
      plane.normal[1] === 1 &&
      plane.normal[2] === 0
    )).toBe(true);

    const first = await executePlaneSegmentation(request);
    const second = await executePlaneSegmentation(request);
    expect(first.status).toBe("executed");
    expect(second.status).toBe("executed");
    if (first.status !== "executed" || second.status !== "executed") return;

    expect(first.bodies).toHaveLength(3);
    const yIntervals = first.bodies.map((output) => [
      output.bounds.min.y,
      output.bounds.max.y,
    ]);
    expect(yIntervals).toHaveLength(3);
    expect(yIntervals[0]![0]).toBeCloseTo(0);
    expect(yIntervals[0]![1]).toBeCloseTo(4);
    expect(yIntervals[1]![0]).toBeCloseTo(4);
    expect(yIntervals[1]![1]).toBeCloseTo(8);
    expect(yIntervals[2]![0]).toBeCloseTo(8);
    expect(yIntervals[2]![1]).toBeCloseTo(12);
    expect(first.validation.cuts.map((cut) => cut.axis)).toEqual(["y", "y"]);
    expect(first.validation.cuts[1]!.inputBodyId).toBe(
      first.validation.cuts[0]!.outputBodyIds[1],
    );
    expect(first.bodies[1]!.provenance).toMatchObject({
      axis: "y",
      parentBodyId: first.validation.cuts[0]!.outputBodyIds[1],
      boundaryLineage: request.planes.map((plane) => plane.boundaryId),
    });
    expect(first.bodies.map((output) => ({
      id: output.id,
      geometryVersion: output.geometryVersion,
      provenance: output.provenance,
      bounds: output.bounds,
      mesh: output.mesh,
    }))).toEqual(second.bodies.map((output) => ({
      id: output.id,
      geometryVersion: output.geometryVersion,
      provenance: output.provenance,
      bounds: output.bounds,
      mesh: output.mesh,
    })));
    expect(body).toEqual(before);
  });

  it("supports three Y planes and defers fit only for a future Y target", async () => {
    const yBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 12, z: 8 },
    } as const;
    const printerVolume = { x: 8, y: 3.1, z: 8 };
    const { source, plan } = fixture(
      "make-as-more-molds",
      yBounds,
      printerVolume,
    );
    const request = executionRequest(
      withYBoundaries(plan, [9, 3, 6]),
      source,
      printerVolume,
    );
    const result = await executePlaneSegmentation(request);

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(4);
    expect(result.validation.cuts[0]!.bodies).toContainEqual(
      expect.objectContaining({ printableByBounds: "deferred" }),
    );
    expect(result.validation.cuts[1]!.bodies).toContainEqual(
      expect.objectContaining({ printableByBounds: "deferred" }),
    );
    expect(result.validation.bodies.every(
      (validation) => validation.printableByBounds === true,
    )).toBe(true);
  });

  it("supports one Y plane through the same executor", async () => {
    const yBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 12, z: 8 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const { source, plan } = fixture(
      "make-as-one-mold",
      yBounds,
      printerVolume,
    );
    const result = await executePlaneSegmentation(executionRequest(
      withYBoundaries(plan, [6]),
      source,
      printerVolume,
    ));
    expect(result).toMatchObject({
      status: "executed",
      executionRequest: { executionAxis: "y" },
      validation: { cuts: [{ axis: "y" }] },
    });
    if (result.status === "executed") expect(result.bodies).toHaveLength(2);
  });

  it("executes ordered Z planes with deterministic continuation, ordering, identity, and provenance", async () => {
    const zBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 8, z: 12 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 4.1 };
    const { body, source, plan } = fixture(
      "make-as-one-mold",
      zBounds,
      printerVolume,
    );
    const zPlan = withZBoundaries(plan, [8, 4]);
    const planBeforePreflight = structuredClone(zPlan);
    const request = executionRequest(zPlan, source, printerVolume);
    const before = structuredClone(body);

    expect(request.executionAxis).toBe("z");
    expect(zPlan).toEqual(planBeforePreflight);
    expect(request.planes.map((plane) => plane.coordinateMm)).toEqual([4, 8]);
    expect(request.planes.every((plane) =>
      plane.axis === "z" &&
      plane.normal[0] === 0 &&
      plane.normal[1] === 0 &&
      plane.normal[2] === 1
    )).toBe(true);

    const first = await executePlaneSegmentation(request);
    const second = await executePlaneSegmentation(request);
    expect(first.status).toBe("executed");
    expect(second.status).toBe("executed");
    if (first.status !== "executed" || second.status !== "executed") return;

    expect(first.bodies).toHaveLength(3);
    const zIntervals = first.bodies.map((output) => [
      output.bounds.min.z,
      output.bounds.max.z,
    ]);
    expect(zIntervals).toHaveLength(3);
    expect(zIntervals[0]![0]).toBeCloseTo(0);
    expect(zIntervals[0]![1]).toBeCloseTo(4);
    expect(zIntervals[1]![0]).toBeCloseTo(4);
    expect(zIntervals[1]![1]).toBeCloseTo(8);
    expect(zIntervals[2]![0]).toBeCloseTo(8);
    expect(zIntervals[2]![1]).toBeCloseTo(12);
    expect(first.validation.cuts.map((cut) => cut.axis)).toEqual(["z", "z"]);
    expect(first.validation.cuts[1]!.inputBodyId).toBe(
      first.validation.cuts[0]!.outputBodyIds[1],
    );
    expect(first.bodies[1]!.provenance).toMatchObject({
      axis: "z",
      parentBodyId: first.validation.cuts[0]!.outputBodyIds[1],
      boundaryLineage: request.planes.map((plane) => plane.boundaryId),
    });
    expect(first.bodies.map((output) => ({
      id: output.id,
      geometryVersion: output.geometryVersion,
      provenance: output.provenance,
      bounds: output.bounds,
      mesh: output.mesh,
    }))).toEqual(second.bodies.map((output) => ({
      id: output.id,
      geometryVersion: output.geometryVersion,
      provenance: output.provenance,
      bounds: output.bounds,
      mesh: output.mesh,
    })));
    expect(body).toEqual(before);
  });

  it("supports three Z planes and defers fit only for a future Z target", async () => {
    const zBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 8, z: 12 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 3.1 };
    const { source, plan } = fixture(
      "make-as-more-molds",
      zBounds,
      printerVolume,
    );
    const request = executionRequest(
      withZBoundaries(plan, [9, 3, 6]),
      source,
      printerVolume,
    );
    const result = await executePlaneSegmentation(request);

    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(4);
    expect(result.validation.cuts[0]!.bodies).toContainEqual(
      expect.objectContaining({ printableByBounds: "deferred" }),
    );
    expect(result.validation.cuts[1]!.bodies).toContainEqual(
      expect.objectContaining({ printableByBounds: "deferred" }),
    );
    expect(result.validation.bodies.every(
      (validation) => validation.printableByBounds === true,
    )).toBe(true);
  });

  it("supports one Z plane through the same executor", async () => {
    const zBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 8, z: 12 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const { source, plan } = fixture(
      "make-as-one-mold",
      zBounds,
      printerVolume,
    );
    const result = await executePlaneSegmentation(executionRequest(
      withZBoundaries(plan, [6]),
      source,
      printerVolume,
    ));
    expect(result).toMatchObject({
      status: "executed",
      executionRequest: { executionAxis: "z" },
      validation: { cuts: [{ axis: "z" }] },
    });
    if (result.status === "executed") expect(result.bodies).toHaveLength(2);
  });

  it("includes the active axis in deterministic execution identities", () => {
    const { source, plan } = fixture();
    const xRequest = executionRequest(withXBoundaries(plan, [4]), source);
    expect(xRequest.id).toBe(deterministicSegmentationId(
      "segmentation-execution",
      {
        segmentationRequestId: xRequest.segmentationRequestId,
        acceptedPlanId: xRequest.acceptedPlanId,
        source: xRequest.acceptedPlan.request.source,
        bodyId: xRequest.sourceBody.bodyId,
        geometryVersion: xRequest.sourceBody.geometryVersion,
        printerVolumeSignature: xRequest.printerVolumeSignature,
        planeSequenceSignature: xRequest.planeSequenceSignature,
        policyId: xRequest.policy.id,
        policyVersion: xRequest.policy.version,
      },
    ));
    const yPlan = withYBoundaries(plan, [4]);
    const yRequest = executionRequest(
      yPlan,
      source,
      { x: 12, y: 8, z: 8 },
    );
    expect(yRequest.acceptedPlanId).toBe(xRequest.acceptedPlanId);
    expect(yRequest.sourceBody.bodyId).toBe(xRequest.sourceBody.bodyId);
    expect(yRequest.planeSequenceSignature).not.toBe(
      xRequest.planeSequenceSignature,
    );
    expect(yRequest.id).not.toBe(xRequest.id);
    const zRequest = executionRequest(
      withZBoundaries(plan, [4]),
      source,
      { x: 12, y: 8, z: 8 },
    );
    expect(zRequest.acceptedPlanId).toBe(xRequest.acceptedPlanId);
    expect(zRequest.sourceBody.bodyId).toBe(xRequest.sourceBody.bodyId);
    expect(new Set([
      xRequest.planeSequenceSignature,
      yRequest.planeSequenceSignature,
      zRequest.planeSequenceSignature,
    ]).size).toBe(3);
    expect(new Set([xRequest.id, yRequest.id, zRequest.id]).size).toBe(3);
  });

  it("rejects a boundary whose axis is not declared in the plan's required axes", () => {
    const { source, plan } = fixture();
    const conflictingBoundary = createSegmentationExecutionRequest({
      plan: {
        ...plan,
        boundaries: plan.boundaries.map((boundary) => ({
          ...boundary,
          axis: "y",
        })),
      },
      source,
      printerVolume: { x: 8, y: 8, z: 8 },
    });
    expect(conflictingBoundary).toMatchObject({
      ok: false,
      result: { status: "unsupported", reasonCode: "unsupported_boundary_intent" },
    });
  });

  it("executes a genuine X-then-Y mixed-axis sequence targeting different fragments", async () => {
    const sourceBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 8, z: 8 } } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const mesh = lShapedMesh({ uAxis: "x", vAxis: "y", wAxis: "z", wRange: [0, 8] });
    const { body, source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
      { mesh, volumeMm3: L_SHAPE_CROSS_SECTION_AREA * 8 },
    );
    const mixedPlan = withMixedBoundaries(plan, [
      // Offset slightly from the notch's exact corner coordinate (6) to
      // avoid an exact-vertex-coincident Boolean cut, which this Manifold
      // build resolves inconsistently across axes even though it reports
      // a valid single-component split (confirmed via a throwaway probe).
      { axis: "x", coordinateMm: 6.001 },
      { axis: "y", coordinateMm: 6 },
    ]);
    const request = executionRequest(mixedPlan, source, printerVolume);
    const before = structuredClone(body);
    expect(request.executionAxis).toBe("x");
    expect(request.planes.map((planeIntent) => planeIntent.axis)).toEqual(["x", "y"]);

    const first = await executePlaneSegmentation(request);
    const second = await executePlaneSegmentation(request);
    expect(first.status).toBe("executed");
    expect(second.status).toBe("executed");
    if (first.status !== "executed" || second.status !== "executed") return;

    expect(first.bodies).toHaveLength(3);
    const byVolume = [...first.bodies].sort((left, right) => left.volumeMm3 - right.volumeMm3);
    expect(byVolume.map((output) => Math.round(output.volumeMm3))).toEqual([96, 192, 288]);
    expect(first.validation.cuts.map((cut) => cut.axis)).toEqual(["x", "y"]);
    // leftLower/leftUpper share the same X-cut parent; rightPiece was never
    // touched by the Y cut and remains a direct child of the source body.
    const leftLower = first.bodies.find((output) => Math.round(output.volumeMm3) === 288)!;
    const leftUpper = first.bodies.find((output) => Math.round(output.volumeMm3) === 96)!;
    const rightPiece = first.bodies.find((output) => Math.round(output.volumeMm3) === 192)!;
    expect(leftLower.provenance.parentBodyId).toBe(leftUpper.provenance.parentBodyId);
    expect(leftLower.provenance.boundaryLineage).toHaveLength(2);
    expect(rightPiece.provenance.parentBodyId).toBe(request.sourceBody.bodyId);
    expect(rightPiece.provenance.boundaryLineage).toHaveLength(1);
    expect(first.validation.volumeDeltaMm3).toBeLessThanOrEqual(
      first.validation.policy.volumeToleranceMm3 * request.planes.length,
    );
    expect(first.validation.overlapVolumeMm3).toBeLessThanOrEqual(
      first.validation.policy.overlapToleranceMm3,
    );
    expect(first.bodies.map((output) => output.id)).toEqual(
      second.bodies.map((output) => output.id),
    );
    expect(body).toEqual(before);
  });

  it("executes a genuine Y-then-Z mixed-axis sequence", async () => {
    const sourceBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 12, z: 8 } } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const mesh = lShapedMesh({ uAxis: "y", vAxis: "z", wAxis: "x", wRange: [0, 8] });
    const { source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
      { mesh, volumeMm3: L_SHAPE_CROSS_SECTION_AREA * 8 },
    );
    const mixedPlan = withMixedBoundaries(plan, [
      { axis: "y", coordinateMm: 6.001 },
      { axis: "z", coordinateMm: 6 },
    ]);
    const request = executionRequest(mixedPlan, source, printerVolume);
    const result = await executePlaneSegmentation(request);
    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(3);
    const byVolume = [...result.bodies].sort((left, right) => left.volumeMm3 - right.volumeMm3);
    expect(byVolume.map((output) => Math.round(output.volumeMm3))).toEqual([96, 192, 288]);
    expect(result.validation.cuts.map((cut) => cut.axis)).toEqual(["y", "z"]);
  });

  it("executes a genuine X-then-Z mixed-axis sequence", async () => {
    const sourceBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 8, z: 8 } } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const mesh = lShapedMesh({ uAxis: "x", vAxis: "z", wAxis: "y", wRange: [0, 8] });
    const { source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
      { mesh, volumeMm3: L_SHAPE_CROSS_SECTION_AREA * 8 },
    );
    const mixedPlan = withMixedBoundaries(plan, [
      { axis: "x", coordinateMm: 6.001 },
      { axis: "z", coordinateMm: 6 },
    ]);
    const request = executionRequest(mixedPlan, source, printerVolume);
    const result = await executePlaneSegmentation(request);
    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(3);
    const byVolume = [...result.bodies].sort((left, right) => left.volumeMm3 - right.volumeMm3);
    expect(byVolume.map((output) => Math.round(output.volumeMm3))).toEqual([96, 192, 288]);
    expect(result.validation.cuts.map((cut) => cut.axis)).toEqual(["x", "z"]);
  });

  it("executes a repeated-axis X-then-Y-then-X sequence", async () => {
    const sourceBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 8, z: 8 } } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const mesh = lShapedMesh({ uAxis: "x", vAxis: "y", wAxis: "z", wRange: [0, 8] });
    const { body, source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
      { mesh, volumeMm3: L_SHAPE_CROSS_SECTION_AREA * 8 },
    );
    const mixedPlan = withMixedBoundaries(plan, [
      // Offset slightly from the notch's exact corner coordinate (6) to
      // avoid an exact-vertex-coincident Boolean cut, which this Manifold
      // build resolves inconsistently across axes even though it reports
      // a valid single-component split (confirmed via a throwaway probe).
      { axis: "x", coordinateMm: 6.001 },
      { axis: "y", coordinateMm: 6 },
      { axis: "x", coordinateMm: 9 },
    ]);
    const request = executionRequest(mixedPlan, source, printerVolume);
    const before = structuredClone(body);
    expect(request.planes.map((planeIntent) => planeIntent.axis)).toEqual(["x", "y", "x"]);

    const result = await executePlaneSegmentation(request);
    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(4);
    const byVolume = [...result.bodies].sort((left, right) => left.volumeMm3 - right.volumeMm3);
    expect(byVolume.map((output) => Math.round(output.volumeMm3))).toEqual([96, 96, 96, 288]);
    expect(result.validation.cuts.map((cut) => cut.axis)).toEqual(["x", "y", "x"]);
    const rightFragments = result.bodies.filter(
      (output) => Math.round(output.volumeMm3) === 96 && output.provenance.axis === "x",
    );
    // The two rightmost fragments' last cut was the repeated (third, X)
    // plane - distinguishing them from leftUpper, which is also 96mm3 but
    // whose last cut was the intervening Y plane.
    expect(rightFragments).toHaveLength(2);
    expect(
      rightFragments.every((fragment) => fragment.provenance.boundaryLineage.length === 2),
    ).toBe(true);
    expect(await executePlaneSegmentation(request)).toMatchObject({ status: "executed" });
    expect(body).toEqual(before);
  });

  it("rejects a mixed-axis plane that straddles multiple current bodies", async () => {
    const { source, plan } = fixture();
    const mixedPlan = withMixedBoundaries(plan, [
      { axis: "x", coordinateMm: 6 },
      { axis: "y", coordinateMm: 4 },
    ]);
    const request = executionRequest(mixedPlan, source);
    const result = await executePlaneSegmentation(request);
    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "ambiguous_cut_target",
    });
    expect("bodies" in result).toBe(false);
  });

  it("rejects a mixed-axis plane that straddles no current body", async () => {
    const { source, plan } = fixture();
    const mixedPlan = withMixedBoundaries(plan, [
      { axis: "x", coordinateMm: 6 },
      { axis: "y", coordinateMm: 4 },
    ]);
    const request = executionRequest(mixedPlan, source);
    // Reuse the already-cut X coordinate for the second plane instead of the
    // accepted Y boundary: after cut 0, no current body straddles x=6.
    const result = await executePlaneSegmentation({
      ...request,
      planes: [request.planes[0]!, {
        ...request.planes[1]!,
        axis: "x",
        coordinateMm: 6,
        originOffset: 6,
        normal: request.planes[0]!.normal,
      }],
    });
    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "missing_cut_target",
    });
    expect("bodies" in result).toBe(false);
  });

  it("orders a three-axis mixed plan by sequenceIndex regardless of input order", () => {
    const { source, plan } = fixture();
    const orderedPlan = withMixedBoundaries(plan, [
      { axis: "x", coordinateMm: 4 },
      { axis: "y", coordinateMm: 3 },
      { axis: "z", coordinateMm: 2 },
    ]);
    const shuffledPlan = {
      ...orderedPlan,
      boundaries: [...orderedPlan.boundaries].reverse(),
    };
    const orderedRequest = executionRequest(orderedPlan, source);
    const shuffledRequest = executionRequest(shuffledPlan, source);

    expect(orderedRequest.planes.map((planeIntent) => planeIntent.axis)).toEqual(["x", "y", "z"]);
    expect(orderedRequest.planes.map((planeIntent) => planeIntent.coordinateMm)).toEqual([4, 3, 2]);
    expect(shuffledRequest.planeSequenceSignature).toBe(orderedRequest.planeSequenceSignature);
    expect(shuffledRequest.id).toBe(orderedRequest.id);

    // A plain box makes the second (Y) cut ambiguous - both X fragments
    // still span the full Y range - so this must fail safely rather than
    // silently produce an incorrect three-axis result.
    return executePlaneSegmentation(orderedRequest).then((result) => {
      expect(result).toMatchObject({
        status: "failed",
        reasonCode: "ambiguous_cut_target",
      });
      expect("bodies" in result).toBe(false);
    });
  });

  it("honors request-scoped cancellation between cuts in a mixed-axis sequence", async () => {
    const sourceBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 8, z: 8 } } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const mesh = lShapedMesh({ uAxis: "x", vAxis: "y", wAxis: "z", wRange: [0, 8] });
    const { source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
      { mesh, volumeMm3: L_SHAPE_CROSS_SECTION_AREA * 8 },
    );
    const mixedPlan = withMixedBoundaries(plan, [
      // Offset slightly from the notch's exact corner coordinate (6) to
      // avoid an exact-vertex-coincident Boolean cut, which this Manifold
      // build resolves inconsistently across axes even though it reports
      // a valid single-component split (confirmed via a throwaway probe).
      { axis: "x", coordinateMm: 6.001 },
      { axis: "y", coordinateMm: 6 },
    ]);
    const request = executionRequest(mixedPlan, source, printerVolume);
    let cancelled = false;
    const result = await executePlaneSegmentation(request, {
      isCancelled: () => cancelled,
      yieldBetweenCuts: async () => {
        cancelled = true;
      },
    });
    expect(result).toMatchObject({
      status: "cancelled",
      reasonCode: "execution_cancelled",
    });
    expect("bodies" in result).toBe(false);
    await expect(executePlaneSegmentation(request)).resolves.toMatchObject({
      status: "executed",
    });
  });

  it("commits a fresh mixed-axis request and rejects mixed-axis plane-sequence drift", () => {
    const sourceBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 8, z: 8 } } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const mesh = lShapedMesh({ uAxis: "x", vAxis: "y", wAxis: "z", wRange: [0, 8] });
    const { source, plan } = fixture(
      "make-as-one-mold",
      sourceBounds,
      printerVolume,
      { mesh, volumeMm3: L_SHAPE_CROSS_SECTION_AREA * 8 },
    );
    const mixedPlan = withMixedBoundaries(plan, [
      // Offset slightly from the notch's exact corner coordinate (6) to
      // avoid an exact-vertex-coincident Boolean cut, which this Manifold
      // build resolves inconsistently across axes even though it reports
      // a valid single-component split (confirmed via a throwaway probe).
      { axis: "x", coordinateMm: 6.001 },
      { axis: "y", coordinateMm: 6 },
    ]);
    const request = executionRequest(mixedPlan, source, printerVolume);
    const base = {
      phase: "executing" as const,
      activeRequest: mixedPlan.request,
      acceptedPlan: mixedPlan,
      executionRequest: request,
      currentSource: source,
      currentPrinterVolume: printerVolume,
    };
    expect(canCommitSegmentationExecution(base)).toBe(true);
    expect(canCommitSegmentationExecution({
      ...base,
      acceptedPlan: {
        ...mixedPlan,
        boundaries: mixedPlan.boundaries.map((boundary) => ({
          ...boundary,
          coordinateMm: boundary.coordinateMm + 0.5,
        })),
      },
    })).toBe(false);
  });

  it("returns no partial bodies when a later cut cannot find its target", async () => {
    const { source, plan } = fixture();
    const request = executionRequest(withXBoundaries(plan, [4, 8]), source);
    const result = await executePlaneSegmentation({
      ...request,
      planes: [request.planes[0]!, {
        ...request.planes[1]!,
        coordinateMm: 4,
        originOffset: 4,
      }],
    });
    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "missing_cut_target",
    });
    expect("bodies" in result).toBe(false);
  });

  it("returns no partial bodies when a later Z cut cannot find its target", async () => {
    const zBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 8, z: 12 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const { source, plan } = fixture(
      "make-as-one-mold",
      zBounds,
      printerVolume,
    );
    const request = executionRequest(
      withZBoundaries(plan, [4, 8]),
      source,
      printerVolume,
    );
    const result = await executePlaneSegmentation({
      ...request,
      planes: [request.planes[0]!, {
        ...request.planes[1]!,
        coordinateMm: 4,
        originOffset: 4,
      }],
    });
    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "missing_cut_target",
      executionRequest: { executionAxis: "z" },
    });
    expect("bodies" in result).toBe(false);
  });

  it("honors request-scoped cancellation between cuts without partial output", async () => {
    const { source, plan } = fixture();
    const request = executionRequest(withXBoundaries(plan, [4, 8]), source);
    let cancelled = false;
    const result = await executePlaneSegmentation(request, {
      isCancelled: () => cancelled,
      yieldBetweenCuts: async () => {
        cancelled = true;
      },
    });
    expect(result).toMatchObject({
      status: "cancelled",
      reasonCode: "execution_cancelled",
    });
    expect("bodies" in result).toBe(false);
    await expect(executePlaneSegmentation(request)).resolves.toMatchObject({
      status: "executed",
    });
  });

  it("uses the same request-scoped cancellation path for Y cuts", async () => {
    const yBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 12, z: 8 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const { source, plan } = fixture(
      "make-as-more-molds",
      yBounds,
      printerVolume,
    );
    const request = executionRequest(
      withYBoundaries(plan, [4, 8]),
      source,
      printerVolume,
    );
    let cancelled = false;
    const result = await executePlaneSegmentation(request, {
      isCancelled: () => cancelled,
      yieldBetweenCuts: async () => {
        cancelled = true;
      },
    });
    expect(result).toMatchObject({
      status: "cancelled",
      reasonCode: "execution_cancelled",
      executionRequest: { executionAxis: "y" },
    });
    expect("bodies" in result).toBe(false);
  });

  it("uses the same request-scoped cancellation path for Z cuts", async () => {
    const zBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 8, z: 12 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const { source, plan } = fixture(
      "make-as-more-molds",
      zBounds,
      printerVolume,
    );
    const request = executionRequest(
      withZBoundaries(plan, [4, 8]),
      source,
      printerVolume,
    );
    let cancelled = false;
    const result = await executePlaneSegmentation(request, {
      isCancelled: () => cancelled,
      yieldBetweenCuts: async () => {
        cancelled = true;
      },
    });
    expect(result).toMatchObject({
      status: "cancelled",
      reasonCode: "execution_cancelled",
      executionRequest: { executionAxis: "z" },
    });
    expect("bodies" in result).toBe(false);
  });

  it("requires an authoritative source geometry version", () => {
    const { source, plan } = fixture();
    const bodyWithoutVersion = { ...source.bodies[0] } as MoldBodyData;
    delete (bodyWithoutVersion as { geometryVersion?: string }).geometryVersion;
    const preflight = createSegmentationExecutionRequest({
      plan,
      source: { ...source, bodies: [bodyWithoutVersion] },
      printerVolume: { x: 8, y: 8, z: 8 },
    });
    expect(preflight).toMatchObject({
      ok: false,
      result: { status: "failed", reasonCode: "invalid_source_body" },
    });
  });

  it("rejects detached output fragments instead of silently discarding them", async () => {
    const { source, plan } = fixture();
    const lower = cubeMesh({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 12, y: 3, z: 8 },
    });
    const upper = cubeMesh({
      min: { x: 0, y: 5, z: 0 },
      max: { x: 12, y: 8, z: 8 },
    });
    const vertexOffset = lower.positions.length / 3;
    const detachedBody = {
      ...source.bodies[0]!,
      volumeMm3: 576,
      geometryVersion: "body:detached",
      mesh: {
        positions: [...lower.positions, ...upper.positions],
        indices: [
          ...lower.indices,
          ...upper.indices.map((index) => index + vertexOffset),
        ],
      },
    };
    const detachedSource = { ...source, bodies: [detachedBody] };
    const request = executionRequest(plan, detachedSource);
    const result = await executePlaneSegmentation(request);
    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "detached_fragment_detected",
    });
  });

  it("maps an invalid Manifold source to a structured Boolean failure", async () => {
    const { source, plan } = fixture();
    const request = executionRequest(plan, source);
    const invalidRequest = {
      ...request,
      sourceBody: {
        ...request.sourceBody,
        body: {
          ...request.sourceBody.body,
          mesh: {
            positions: [0, 0, 0, 12, 0, 0, 0, 8, 8],
            indices: [0, 1, 2],
          },
        },
      },
    };
    await expect(executePlaneSegmentation(invalidRequest)).resolves.toMatchObject({
      status: "failed",
      reasonCode: "split_operation_failed",
    });
  });

  it("rejects executed bodies that do not fit the captured printer volume", async () => {
    const { source, plan } = fixture();
    const request = executionRequest(plan, source);
    await expect(
      executePlaneSegmentation({
        ...request,
        printerVolume: { x: 3, y: 8, z: 8 },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      reasonCode: "printer_fit_failed",
    });
  });

  it("checks active request, plan, source, printer, and execution identities at commit", () => {
    const { source, plan } = fixture();
    const request = executionRequest(plan, source);
    const base = {
      phase: "executing" as const,
      activeRequest: plan.request,
      acceptedPlan: plan,
      executionRequest: request,
      currentSource: source,
      currentPrinterVolume: { x: 8, y: 8, z: 8 },
    };
    expect(canCommitSegmentationExecution(base)).toBe(true);
    expect(
      canCommitSegmentationExecution({
        ...base,
        acceptedPlan: { ...plan, id: "newer-plan" },
      }),
    ).toBe(false);
    expect(
      canCommitSegmentationExecution({
        ...base,
        currentSource: {
          ...source,
          identity: { ...source.identity, documentFingerprint: "newer" },
        },
      }),
    ).toBe(false);
    expect(
      canCommitSegmentationExecution({
        ...base,
        acceptedPlan: {
          ...plan,
          boundaries: plan.boundaries.map((boundary) => ({
            ...boundary,
            coordinateMm: boundary.coordinateMm + 0.5,
          })),
        },
      }),
    ).toBe(false);
    expect(
      canCommitSegmentationExecution({
        ...base,
        executionRequest: {
          ...request,
          executionAxis: "y",
        },
      }),
    ).toBe(false);
  });

  it("commits a fresh Z request and rejects Z plane-sequence drift", () => {
    const zBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8, y: 8, z: 12 },
    } as const;
    const printerVolume = { x: 8, y: 8, z: 8 };
    const { source, plan } = fixture(
      "make-as-one-mold",
      zBounds,
      printerVolume,
    );
    const zPlan = withZBoundaries(plan, [6]);
    const request = executionRequest(zPlan, source, printerVolume);
    const base = {
      phase: "executing" as const,
      activeRequest: zPlan.request,
      acceptedPlan: zPlan,
      executionRequest: request,
      currentSource: source,
      currentPrinterVolume: printerVolume,
    };
    expect(canCommitSegmentationExecution(base)).toBe(true);
    expect(canCommitSegmentationExecution({
      ...base,
      acceptedPlan: {
        ...zPlan,
        boundaries: zPlan.boundaries.map((boundary) => ({
          ...boundary,
          coordinateMm: boundary.coordinateMm + 0.5,
        })),
      },
    })).toBe(false);
  });

  it("uses the same mode-neutral executor request for both product modes", () => {
    const one = fixture("make-as-one-mold");
    const more = fixture("make-as-more-molds");
    const oneRequest = executionRequest(one.plan, one.source);
    const moreRequest = executionRequest(more.plan, more.source);
    expect({
      axis: oneRequest.planes[0]!.axis,
      coordinateMm: oneRequest.planes[0]!.coordinateMm,
      normal: oneRequest.planes[0]!.normal,
      originOffset: oneRequest.planes[0]!.originOffset,
    }).toEqual({
      axis: moreRequest.planes[0]!.axis,
      coordinateMm: moreRequest.planes[0]!.coordinateMm,
      normal: moreRequest.planes[0]!.normal,
      originOffset: moreRequest.planes[0]!.originOffset,
    });
    expect("mode" in oneRequest).toBe(false);
    expect("mode" in moreRequest).toBe(false);
  });
});
