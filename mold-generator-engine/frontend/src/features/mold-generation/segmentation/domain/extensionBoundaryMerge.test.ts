import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { SegmentationSourceSnapshot } from "./segmentation.contracts";
import { baselineSegmentationAlgorithm } from "./baselineSegmentationAlgorithm";
import { deterministicSegmentationId } from "./segmentationIdentity";
import { planSegmentation } from "./planSegmentation";
import { createSegmentationRequest } from "../application/segmentationApplication";
import { resolveSegmentationModeStrategy } from "../application/segmentationModeStrategies";
import { mergeExtensionBoundary } from "./extensionBoundaryMerge";

function body(maximum: { x: number; y: number; z: number }): MoldBodyData & {
  readonly geometryVersion: string;
} {
  return {
    id: "body-a",
    name: "body-a",
    visible: true,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: maximum },
    triangleCount: 1,
    volumeMm3: maximum.x * maximum.y * maximum.z,
    watertight: true,
    mesh: { positions: [0, 0, 0, maximum.x, 0, 0, 0, maximum.y, maximum.z], indices: [0, 1, 2] },
    geometryVersion: "body-a:v1",
  };
}

function source(maximum = { x: 200, y: 50, z: 50 }): SegmentationSourceSnapshot {
  const bodies = [body(maximum)];
  const protectedRegionEvidence = { status: "incomplete", reason: "test" } as const;
  return {
    identity: {
      documentRevision: 1,
      documentFingerprint: "doc-fingerprint",
      resultRequestId: "mold-eval:1",
      definitionId: "definition-a",
      modelId: "model-a",
      frameId: "frame-a",
      bodySignature: "body-signature",
      protectedRegionSignature: deterministicSegmentationId("protected-regions", {
        regions: [],
        evidence: protectedRegionEvidence,
      }),
    },
    bodies,
    aggregateBounds: bodies[0]!.bounds,
    protectedRegions: [],
    protectedRegionEvidence,
    warnings: [],
    units: "millimeters",
    upAxis: "Z",
  };
}

function basePlan(printerVolume = { x: 100, y: 100, z: 100 }) {
  const sourceSnapshot = source();
  const mode = "make-as-one-mold" as const;
  const strategy = resolveSegmentationModeStrategy(mode);
  const request = createSegmentationRequest({ mode, source: sourceSnapshot, printerVolume, strategy });
  const result = planSegmentation({
    request,
    source: sourceSnapshot,
    algorithm: baselineSegmentationAlgorithm,
    strategy,
  });
  if (result.status !== "planned") throw new Error(`expected a planned result, got ${result.status}`);
  return result.plan;
}

describe("mergeExtensionBoundary", () => {
  it("appends the extension axis, doubling segments and marking only the new boundary broadcast", () => {
    const plan = basePlan(); // oversized only on X (200mm > 100mm) -> requiredAxes=["x"], 1 boundary, 2 segments
    expect(plan.requiredAxes).toEqual(["x"]);
    expect(plan.boundaries).toHaveLength(1);
    expect(plan.segments).toHaveLength(2);

    const merged = mergeExtensionBoundary(plan, "y", 25);

    expect(merged.requiredAxes).toEqual(["x", "y"]);
    expect(merged.boundaries).toHaveLength(2);
    expect(merged.segments).toHaveLength(4);
    expect(merged.perAxisSegmentCount).toEqual({ x: 2, y: 2, z: 1 });
    expect(merged.estimatedMinimumSegmentCount).toBe(plan.estimatedMinimumSegmentCount * 2);

    const original = merged.boundaries.filter((boundary) => boundary.axis === "x");
    const extension = merged.boundaries.filter((boundary) => boundary.axis === "y");
    expect(original).toHaveLength(1);
    expect(extension).toHaveLength(1);
    expect(original[0]!.broadcastToAllStraddlingBodies).toBeFalsy();
    expect(extension[0]!.broadcastToAllStraddlingBodies).toBe(true);
    expect(extension[0]!.sequenceIndex).toBeGreaterThan(original[0]!.sequenceIndex);
  });

  it("does not mutate the original plan object", () => {
    const plan = basePlan();
    const beforeBoundaries = plan.boundaries;
    const beforeSegments = plan.segments;
    mergeExtensionBoundary(plan, "y", 25);
    expect(plan.boundaries).toBe(beforeBoundaries);
    expect(plan.segments).toBe(beforeSegments);
  });

  it("produces a different, deterministic plan id from the base plan", () => {
    const plan = basePlan();
    const first = mergeExtensionBoundary(plan, "y", 25);
    const second = mergeExtensionBoundary(plan, "y", 25);
    expect(first.id).not.toBe(plan.id);
    expect(first.id).toBe(second.id);
  });

  it("keeps every resulting segment printable when the extension axis already fit as a whole", () => {
    const plan = basePlan();
    const merged = mergeExtensionBoundary(plan, "y", 25);
    expect(merged.segments.every((segment) => segment.predictedFit.status === "FITS")).toBe(true);
    expect(merged.validation.status).toBe("planning-valid");
  });

  it("supports merging a second extension axis on top of the first", () => {
    const plan = basePlan();
    const first = mergeExtensionBoundary(plan, "y", 25);
    const second = mergeExtensionBoundary(first, "z", 25);
    expect(second.requiredAxes).toEqual(["x", "y", "z"]);
    expect(second.segments).toHaveLength(8);
    const zBoundary = second.boundaries.find((boundary) => boundary.axis === "z")!;
    expect(zBoundary.broadcastToAllStraddlingBodies).toBe(true);
    expect(zBoundary.sequenceIndex).toBeGreaterThan(
      Math.max(...first.boundaries.map((boundary) => boundary.sequenceIndex)),
    );
  });

  it("is a defensive no-op when the axis is already required", () => {
    const plan = basePlan();
    const result = mergeExtensionBoundary(plan, "x", 50);
    expect(result).toBe(plan);
  });

  it("flags a hard protected-region conflict as a blocker without dropping the boundary", () => {
    const plan = basePlan();
    const region = {
      id: "region-1",
      kind: "cavity",
      source: "cavity" as const,
      provenanceId: "cavity-1",
      bodyIds: ["body-a"],
      bounds: { min: { x: 0, y: 20, z: 0 }, max: { x: 200, y: 30, z: 50 } },
      hardness: "hard" as const,
      clearanceMm: 0,
    };
    const merged = mergeExtensionBoundary(plan, "y", 25, [region]);
    // The boundary is still recorded (never silently dropped/reset) --
    // only its validity is affected.
    expect(merged.boundaries.some((boundary) => boundary.axis === "y" && boundary.coordinateMm === 25)).toBe(true);
    expect(merged.validation.status).toBe("invalid");
    expect(merged.validation.blockers.some((issue) => issue.reasonCode === "protected_region_conflict")).toBe(true);
  });

  it("does not flag an advisory (non-hard) protected region", () => {
    const plan = basePlan();
    const region = {
      id: "region-2",
      kind: "sprue",
      source: "sprue" as const,
      provenanceId: "sprue-1",
      bodyIds: ["body-a"],
      bounds: { min: { x: 0, y: 20, z: 0 }, max: { x: 200, y: 30, z: 50 } },
      hardness: "advisory" as const,
      clearanceMm: 0,
    };
    const merged = mergeExtensionBoundary(plan, "y", 25, [region]);
    expect(merged.validation.status).toBe("planning-valid");
  });

  it("flags a degenerate split (coordinate at or beyond a segment's own bounds) as a blocker", () => {
    const plan = basePlan();
    // Y spans [0,50] on every segment; 0 is not strictly interior.
    const merged = mergeExtensionBoundary(plan, "y", 0);
    expect(merged.validation.status).toBe("invalid");
    expect(
      merged.validation.blockers.some((issue) => issue.reasonCode === "invalid_authoritative_geometry"),
    ).toBe(true);
  });

  it("recovers to planning-valid when re-merged at a valid coordinate (simulates moving the plane back)", () => {
    const plan = basePlan();
    const region = {
      id: "region-3",
      kind: "cavity",
      source: "cavity" as const,
      provenanceId: "cavity-2",
      bodyIds: ["body-a"],
      bounds: { min: { x: 0, y: 20, z: 0 }, max: { x: 200, y: 30, z: 50 } },
      hardness: "hard" as const,
      clearanceMm: 0,
    };
    const invalid = mergeExtensionBoundary(plan, "y", 25, [region]);
    expect(invalid.validation.status).toBe("invalid");

    const recovered = mergeExtensionBoundary(plan, "y", 40, [region]);
    expect(recovered.validation.status).toBe("planning-valid");
  });
});
