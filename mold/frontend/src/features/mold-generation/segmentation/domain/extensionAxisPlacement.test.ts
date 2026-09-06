import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { ProtectedRegion, SegmentationSourceSnapshot } from "./segmentation.contracts";
import { deterministicSegmentationId } from "./segmentationIdentity";
import { suggestExtensionAxisPosition } from "./extensionAxisPlacement";

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

function source(
  maximum = { x: 200, y: 50, z: 50 },
  protectedRegions: readonly ProtectedRegion[] = [],
): SegmentationSourceSnapshot {
  const bodies = [body(maximum)];
  const protectedRegionEvidence = {
    status: "incomplete",
    reason: "Bounds-level test evidence only.",
  } as const;
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
        regions: protectedRegions,
        evidence: protectedRegionEvidence,
      }),
    },
    bodies,
    aggregateBounds: bodies[0]!.bounds,
    protectedRegions,
    protectedRegionEvidence,
    warnings: [],
    units: "millimeters",
    upAxis: "Z",
  };
}

describe("suggestExtensionAxisPosition", () => {
  it("bisects the axis span when there is no protected region, returning an absolute mm coordinate", () => {
    const coordinateMm = suggestExtensionAxisPosition(source(), "x");
    // Source spans x in [0, 200] -- the midpoint is 100mm, not a 0..1 fraction.
    expect(coordinateMm).toBeCloseTo(100, 5);
  });

  it("nudges away from a hard protected region overlapping the midpoint", () => {
    const region: ProtectedRegion = {
      id: "region-1",
      kind: "cavity",
      source: "cavity",
      provenanceId: "cavity-1",
      bodyIds: ["body-a"],
      bounds: { min: { x: 90, y: 0, z: 0 }, max: { x: 110, y: 50, z: 50 } },
      hardness: "hard",
      clearanceMm: 5,
    };
    const coordinateMm = suggestExtensionAxisPosition(source(undefined, [region]), "x");
    // Midpoint (100mm) is inside the region's clearance envelope (85-115mm);
    // the suggestion must not land inside it.
    expect(coordinateMm <= 85 || coordinateMm >= 115).toBe(true);
    expect(coordinateMm).not.toBeCloseTo(100, 5);
  });

  it("does not conflict with an advisory (non-hard) region and stays at the midpoint", () => {
    const region: ProtectedRegion = {
      id: "region-2",
      kind: "sprue",
      source: "sprue",
      provenanceId: "sprue-1",
      bodyIds: ["body-a"],
      bounds: { min: { x: 90, y: 0, z: 0 }, max: { x: 110, y: 50, z: 50 } },
      hardness: "advisory",
      clearanceMm: 5,
    };
    const coordinateMm = suggestExtensionAxisPosition(source(undefined, [region]), "x");
    expect(coordinateMm).toBeCloseTo(100, 5);
  });

  it("falls back to the plain midpoint when no conflict-free candidate exists in range", () => {
    const region: ProtectedRegion = {
      id: "region-3",
      kind: "cavity",
      source: "cavity",
      provenanceId: "cavity-2",
      bodyIds: ["body-a"],
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 200, y: 50, z: 50 } },
      hardness: "hard",
      clearanceMm: 0,
    };
    const coordinateMm = suggestExtensionAxisPosition(source(undefined, [region]), "x");
    expect(coordinateMm).toBeCloseTo(100, 5);
  });

  it("returns the midpoint for a degenerate (zero-length) axis span", () => {
    const coordinateMm = suggestExtensionAxisPosition(
      source({ x: 0, y: 50, z: 50 }),
      "x",
    );
    expect(coordinateMm).toBe(0);
  });

  it("stays within a small margin of each bound, never at the exact edge", () => {
    const coordinateMm = suggestExtensionAxisPosition(source({ x: 100, y: 50, z: 50 }), "x");
    expect(coordinateMm).toBeGreaterThan(0);
    expect(coordinateMm).toBeLessThan(100);
  });
});
