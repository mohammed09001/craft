import { describe, expect, it } from "vitest";

import {
  detectSelfCrossing,
  extractPartingInterfaces,
  orderPartingCurvePoints,
  simplifyPartingCurve,
} from "./workingMoldPlanner";
import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { planWorkingMoldDecomposition } from "./workingMoldPlanner";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildThreeHoleCubeFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 13: real parting curves from region boundaries --
 * ordering, gap healing, small-loop removal, simplification, and
 * self-crossing detection. Earlier executions stored the raw edge-midpoint
 * bag as "samplePoints" without ever ordering it into an actual curve.
 */

describe("Parting curve ordering and simplification (Execution 08 LOOP 13)", () => {
  it("orders scattered points into a connected nearest-neighbor chain", () => {
    const scattered = [
      { x: 4, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ];
    const ordered = orderPartingCurvePoints(scattered);
    expect(ordered).toHaveLength(scattered.length);
    // An evenly-spaced set has no ambiguous far cluster to jump to: the
    // chain recovers the exact monotonic sequence 0,1,2,3,4.
    expect(ordered.map((point) => point.x)).toEqual([0, 1, 2, 3, 4]);
  });

  it("greedy nearest-neighbor chaining still connects every point (total path stays finite and bounded), even when a late unavoidable jump between separated clusters is required", () => {
    // Two tight clusters far apart: nearest-neighbor chaining exhausts one
    // cluster before jumping to the other -- a well-known, accepted greedy
    // trade-off (bounded cost, not a global-optimum tour), never an
    // unbounded or non-terminating result.
    const points = [
      { x: 100, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 101, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ];
    const ordered = orderPartingCurvePoints(points);
    expect(ordered).toHaveLength(points.length);
    const totalLength = ordered.slice(1).reduce((sum, point, index) => sum + Math.abs(point.x - ordered[index]!.x), 0);
    expect(Number.isFinite(totalLength)).toBe(true);
    // Within each cluster, consecutive points are still tightly chained.
    const withinLowCluster = ordered.filter((point) => point.x < 50);
    expect(withinLowCluster.map((point) => point.x)).toEqual([0, 1, 2]);
  });

  it("is deterministic regardless of input order", () => {
    const points = [
      { x: 5, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    const a = orderPartingCurvePoints(points);
    const b = orderPartingCurvePoints([...points].reverse());
    expect(a).toEqual(b);
  });

  it("removes small (near-duplicate) loops and collinear redundant points", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1e-9 }, // near-duplicate of the previous point.
      { x: 1, y: 0, z: 0 }, // collinear with its neighbors.
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ];
    const simplified = simplifyPartingCurve(points, 1e-3);
    expect(simplified.length).toBeLessThan(points.length);
    // Endpoints are always preserved.
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it("detects a genuinely self-crossing polyline", () => {
    // A figure-eight-like path: segment 0-1 and segment 2-3 cross near (0.5, 0.5).
    const crossing = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ];
    expect(detectSelfCrossing(crossing, 1e-2)).toBe(true);
  });

  it("does not flag a simple non-crossing polyline", () => {
    const straight = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ];
    expect(detectSelfCrossing(straight, 1e-2)).toBe(false);
  });

  it("real fixture interfaces are ordered curves with no self-crossing, not a raw sample bag", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const seed = seedFromFixture(fixture);
    const planningMesh = buildPlanningMesh({
      positions: seed.sourceMesh.positions,
      indices: seed.sourceMesh.indices,
      bounds: seed.sourceBounds,
      sourceGeometryVersion: seed.sourceGeometryVersion,
    });
    const directions = generateCandidateDirections(planningMesh, seed.sourceMesh.positions);
    let analysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, directions);
    const pruned = pruneDirections(analysis.directions, analysis, planningMesh, MASTER_PLANNER_LIMITS.maxCandidateDirections);
    analysis = pruned.analysis;
    const plan = planWorkingMoldDecomposition({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    expect(plan).not.toBeNull();

    const interfaces = extractPartingInterfaces(planningMesh, plan!.finalists[0]!.patchAssignment, plan!.finalists[0]!.candidate.pieces);
    expect(interfaces.length).toBeGreaterThan(0);
    for (const face of interfaces) {
      expect(face.samplePoints.length).toBeGreaterThan(0);
      expect(typeof face.selfIntersecting).toBe("boolean");
      expect(face.selfIntersecting).toBe(false); // these simple golden interfaces are not expected to cross themselves.
    }
  });
});
