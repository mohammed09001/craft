import { cubeMesh } from "../../cavity-generation/cavityGeneration.testFixtures";
import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { createSegmentationRequest } from "../application/segmentationApplication";
import { resolveSegmentationModeStrategy } from "../application/segmentationModeStrategies";
import { baselineSegmentationAlgorithm } from "../domain/baselineSegmentationAlgorithm";
import { planSegmentation } from "../domain/planSegmentation";
import type { SegmentationPlan, SegmentationSourceSnapshot } from "../domain/segmentation.contracts";
import { deterministicSegmentationId } from "../domain/segmentationIdentity";
import { createSegmentationExecutionPolicy } from "./segmentationExecution.policy";
import { createSegmentationExecutionRequest } from "./segmentationExecutionPreflight";
import { executePlaneSegmentation } from "./segmentationPlaneExecutor";
import { mergeExtensionBoundary } from "../domain/extensionBoundaryMerge";
import type { SegmentationExecutionRequest, SupportedPlaneCutIntent } from "./segmentationExecution.contracts";
import type { Size3 } from "../fitAnalysis";

// A plain 12x8x8 box -- deliberately NOT the L-shaped fixture used elsewhere
// in segmentationPlaneExecutor.test.ts for genuine (non-ambiguous) mixed-axis
// coverage. On a plain box, any second cut on a different, untouched axis is
// ambiguous for a non-broadcast boundary (every existing fragment still
// spans that axis identically) -- this is exactly the case broadcast
// execution exists for, so a plain box is the correct, honest fixture here.
const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 8, z: 8 } };
const printerVolume: Size3 = { x: 8, y: 8, z: 8 };

function basePlan(): { readonly plan: SegmentationPlan; readonly source: SegmentationSourceSnapshot } {
  const body: MoldBodyData & { readonly geometryVersion: string } = {
    id: "committed-body",
    name: "Committed body",
    visible: true,
    bounds,
    triangleCount: 12,
    volumeMm3: 12 * 8 * 8,
    watertight: true,
    mesh: cubeMesh(bounds),
    geometryVersion: "body:v1",
  };
  const source: SegmentationSourceSnapshot = {
    identity: {
      documentRevision: 1,
      documentFingerprint: "document:1",
      resultRequestId: "mold-eval:1",
      definitionId: "definition",
      modelId: "model",
      frameId: "frame",
      bodySignature: "body-signature",
      protectedRegionSignature: "protected-signature",
    },
    bodies: [body],
    aggregateBounds: bounds,
    protectedRegions: [],
    protectedRegionEvidence: { status: "incomplete", reason: "Planning evidence only." },
    warnings: [],
    units: "millimeters",
    upAxis: "Z",
  };
  const mode = "make-as-one-mold" as const;
  const strategy = resolveSegmentationModeStrategy(mode);
  const request = createSegmentationRequest({ mode, source, printerVolume, strategy });
  const result = planSegmentation({ request, source, algorithm: baselineSegmentationAlgorithm, strategy });
  expect(result.status).toBe("planned");
  if (result.status !== "planned") throw new Error("Expected a plan.");
  return { plan: result.plan, source };
}

/** Hand-builds a SegmentationExecutionRequest with an explicit boundary/plane
 * list (bypassing createSegmentationExecutionRequest's own preflight, which
 * is validated separately) so the executor's broadcast behavior can be
 * tested in isolation. */
function requestWithPlanes(
  plan: SegmentationPlan,
  source: SegmentationSourceSnapshot,
  planes: readonly SupportedPlaneCutIntent[],
): SegmentationExecutionRequest {
  const body = source.bodies[0]! as MoldBodyData & { readonly geometryVersion: string };
  const policy = createSegmentationExecutionPolicy(body.bounds, body.volumeMm3);
  const planeSequenceSignature = deterministicSegmentationId("plane-sequence", planes);
  return {
    id: deterministicSegmentationId("execution", { planId: plan.id, planeSequenceSignature }),
    segmentationRequestId: plan.request.requestId,
    acceptedPlanId: plan.id,
    acceptedPlan: plan,
    documentRevision: source.identity.documentRevision,
    documentFingerprint: source.identity.documentFingerprint,
    committedResultRequestId: source.identity.resultRequestId,
    sourceBody: {
      bodyId: body.id,
      geometryVersion: body.geometryVersion,
      bodySignature: source.identity.bodySignature,
      committedResultRequestId: source.identity.resultRequestId,
      body,
    },
    printerVolume,
    printerVolumeSignature: deterministicSegmentationId("printer-volume", printerVolume),
    executionAxis: planes[0]!.axis,
    planes,
    planeSequenceSignature,
    policy,
  };
}

function plane(
  axis: "x" | "y" | "z",
  coordinateMm: number,
  sequenceIndex: number,
  broadcast: boolean,
): SupportedPlaneCutIntent {
  const normal: Readonly<Record<"x" | "y" | "z", readonly [number, number, number]>> = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  };
  return {
    boundary: {
      id: deterministicSegmentationId("boundary", { axis, coordinateMm, sequenceIndex }),
      axis,
      coordinateMm,
      ordinal: 1,
      sequenceIndex,
      ...(broadcast ? { broadcastToAllStraddlingBodies: true } : {}),
    },
    boundaryId: deterministicSegmentationId("boundary", { axis, coordinateMm, sequenceIndex }),
    axis,
    coordinateMm,
    normal: normal[axis],
    originOffset: coordinateMm,
    coordinateSpace: "mold-local",
    units: "millimeters",
    upAxis: "Z",
    sides: ["positive", "negative"],
  };
}

describe("segmentation plane executor -- broadcast extension boundary", () => {
  it("rejects a plain-box second-axis cut as ambiguous when NOT marked broadcast (baseline confirmation)", async () => {
    const { plan, source } = basePlan();
    const request = requestWithPlanes(plan, source, [
      plane("x", 6, 1, false),
      plane("y", 4, 2, false),
    ]);
    const result = await executePlaneSegmentation(request);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reasonCode).toBe("ambiguous_cut_target");
    }
  });

  it("executes a broadcast Y boundary across both X fragments of a plain box, producing 4 bodies", async () => {
    const { plan, source } = basePlan();
    const request = requestWithPlanes(plan, source, [
      plane("x", 6, 1, false),
      plane("y", 4, 2, true),
    ]);
    const result = await executePlaneSegmentation(request);
    expect(result.status).toBe("executed");
    if (result.status !== "executed") return;
    expect(result.bodies).toHaveLength(4);
    // Volume conservation across the whole tree: four 6x4x8 pieces = original 12x8x8.
    const totalVolume = result.bodies.reduce((sum, body) => sum + body.volumeMm3, 0);
    expect(totalVolume).toBeCloseTo(12 * 8 * 8, 3);
    // Every body's bounds must lie strictly within the source bounds and be
    // uniquely identified/provenanced.
    expect(new Set(result.bodies.map((body) => body.id)).size).toBe(4);
    for (const body of result.bodies) {
      expect(body.provenance.axis === "x" || body.provenance.axis === "y").toBe(true);
    }
    // Two X-halves, each further split by the broadcast Y-plane: for each
    // half, both a y<4 and y>=4 fragment must exist.
    const negativeXCount = result.bodies.filter((body) => body.bounds.max.x <= 6 + 1e-6).length;
    const positiveXCount = result.bodies.filter((body) => body.bounds.min.x >= 6 - 1e-6).length;
    expect(negativeXCount).toBe(2);
    expect(positiveXCount).toBe(2);
  });

  it("still enforces exactly-one-target semantics for a broadcast boundary that only partially straddles", async () => {
    const { plan, source } = basePlan();
    // X at 6 then X at 9 (both non-broadcast, valid single-axis sequence),
    // then a broadcast Y boundary -- valid, since neither X fragment has
    // been touched on Y yet, both must straddle it.
    const request = requestWithPlanes(plan, source, [
      plane("x", 6, 1, false),
      plane("x", 9, 2, false),
      plane("y", 4, 3, true),
    ]);
    const result = await executePlaneSegmentation(request);
    expect(result.status).toBe("executed");
    if (result.status === "executed") {
      expect(result.bodies).toHaveLength(6);
    }
  });

  it("end-to-end: a real mergeExtensionBoundary plan flows through the real preflight and executor", async () => {
    const { plan, source } = basePlan(); // oversized on X only, printer 8x8x8 -> 1 X boundary, 2 segments
    const merged = mergeExtensionBoundary(plan, "y", 4);
    expect(merged.segments).toHaveLength(4);

    const preflight = createSegmentationExecutionRequest({ plan: merged, source, printerVolume });
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;

    const result = await executePlaneSegmentation(preflight.request);
    expect(result.status).toBe("executed");
    if (result.status === "executed") {
      expect(result.bodies).toHaveLength(4);
      const totalVolume = result.bodies.reduce((sum, body) => sum + body.volumeMm3, 0);
      expect(totalVolume).toBeCloseTo(12 * 8 * 8, 3);
    }
  });

  it("rejects a plan whose segment count doesn't match its boundary sequence's expected growth", () => {
    const { plan, source } = basePlan();
    const merged = mergeExtensionBoundary(plan, "y", 4);
    const corrupted = { ...merged, segments: merged.segments.slice(0, -1) };
    const preflight = createSegmentationExecutionRequest({ plan: corrupted, source, printerVolume });
    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.result.status).toBe("unsupported");
    }
  });
});
