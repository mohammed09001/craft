import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph, summarizeRegionAccessibility, unresolvedSurfaceRegions } from "./surfaceRegions";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import {
  buildFreeFormObliqueLockFixture,
  buildHighPolySphereFixture,
  buildSimpleBoxFixture,
  buildThreeHoleCubeFixture,
  seedFromFixture,
} from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 05: the surface region graph must survive triangle
 * reorder, represent curved free-form surfaces coherently, and give
 * undercut/coverage reasoning a real region to work with instead of sparse
 * per-patch incidence.
 */

function shuffledIndices(indices: readonly number[], seed: number): number[] {
  const triangleCount = indices.length / 3;
  const order = Array.from({ length: triangleCount }, (_, index) => index);
  let state = seed >>> 0;
  const nextRandom = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp!;
  }
  const shuffled: number[] = new Array(indices.length);
  order.forEach((sourceTriangle, destinationTriangle) => {
    shuffled[destinationTriangle * 3] = indices[sourceTriangle * 3]!;
    shuffled[destinationTriangle * 3 + 1] = indices[sourceTriangle * 3 + 1]!;
    shuffled[destinationTriangle * 3 + 2] = indices[sourceTriangle * 3 + 2]!;
  });
  return shuffled;
}

describe("Surface region graph (Execution 08 LOOP 05)", () => {
  it("splits an axis-aligned box into exactly its six planar faces", async () => {
    const fixture = await buildSimpleBoxFixture(10);
    const mesh = buildPlanningMesh({ positions: fixture.mesh.positions, indices: fixture.mesh.indices, bounds: fixture.bounds, sourceGeometryVersion: "loop05-box" });
    const graph = buildSurfaceRegionGraph(mesh);
    expect(graph.regions.length).toBe(6);
    for (const region of graph.regions) {
      expect(region.normalConeHalfAngleDeg).toBeLessThan(1); // each face is exactly planar.
      expect(region.areaMm2).toBeCloseTo(100, 3); // 10x10 face.
      expect(region.adjacentRegionIndexes.length).toBe(4); // a box face touches four others.
      expect(region.hasSharpBoundary).toBe(true); // every box edge is a 90-degree ridge.
    }
  });

  it("gives a blind hole's interior its own region, distinct from the outer faces", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const mesh = buildPlanningMesh({ positions: fixture.mesh.positions, indices: fixture.mesh.indices, bounds: fixture.bounds, sourceGeometryVersion: "loop05-holes" });
    const graph = buildSurfaceRegionGraph(mesh);
    // 6 outer faces plus at least one region per hole's cylindrical wall/bottom.
    expect(graph.regions.length).toBeGreaterThan(6);
    const totalArea = graph.regions.reduce((sum, region) => sum + region.areaMm2, 0);
    expect(totalArea).toBeCloseTo(mesh.totalAreaMm2, 3);
  });

  it("represents a curved free-form surface coherently (far fewer regions than patches, full centroid coverage)", () => {
    const fixture = buildHighPolySphereFixture(48, 96, 15);
    const mesh = buildPlanningMesh({ positions: fixture.mesh.positions, indices: fixture.mesh.indices, bounds: fixture.bounds, sourceGeometryVersion: "loop05-sphere" });
    const graph = buildSurfaceRegionGraph(mesh);
    expect(graph.regions.length).toBeGreaterThan(0);
    expect(graph.regions.length).toBeLessThan(mesh.patches.length / 4);
    const totalArea = graph.regions.reduce((sum, region) => sum + region.areaMm2, 0);
    expect(totalArea).toBeCloseTo(mesh.totalAreaMm2, 3);
    expect(graph.regionOfPatch.every((regionIndex) => regionIndex >= 0)).toBe(true);
  });

  it("produces the identical region set regardless of triangle array order", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const original = buildPlanningMesh({ positions: fixture.mesh.positions, indices: fixture.mesh.indices, bounds: fixture.bounds, sourceGeometryVersion: "loop05-order-a" });
    const reordered = buildPlanningMesh({ positions: fixture.mesh.positions, indices: shuffledIndices(fixture.mesh.indices, 42), bounds: fixture.bounds, sourceGeometryVersion: "loop05-order-b" });

    const graphA = buildSurfaceRegionGraph(original);
    const graphB = buildSurfaceRegionGraph(reordered);

    expect(graphB.regions.length).toBe(graphA.regions.length);
    const fingerprint = (regions: typeof graphA.regions) =>
      regions.map((region) => `${region.regionId}|${region.areaMm2.toFixed(6)}|${region.normalConeHalfAngleDeg.toFixed(3)}`).sort();
    expect(fingerprint(graphB.regions)).toEqual(fingerprint(graphA.regions));
  });

  it("shows the real regression's failure is combinatorial coverage, not a missing direction: every cone-capped region IS individually resolvable", async () => {
    // With cone-capped regions (bounded to surfaceRegionMergeAngleDeg by
    // construction), a region is small/local enough that some direction in
    // the kept candidate set almost always sees it fully -- this precisely
    // separates two different failure classes: "no direction exists at
    // all" (LOOP 08's target) versus "no small SET of directions jointly
    // covers everything within the piece-count budget" (LOOP 10/11's
    // target, the real regression's actual failure, per
    // masterMoldEngine.loop02RealRegression.test.ts: planning still rejects
    // every piece count even though every region here resolves alone).
    const fixture = await buildFreeFormObliqueLockFixture();
    const seed = seedFromFixture(fixture);
    const mesh = buildPlanningMesh({ positions: seed.sourceMesh.positions, indices: seed.sourceMesh.indices, bounds: seed.sourceBounds, sourceGeometryVersion: seed.sourceGeometryVersion });
    const directions = generateCandidateDirections(mesh, seed.sourceMesh.positions);
    let analysis = analyzeDirectionAccessibility(seed.sourceMesh, mesh, directions);
    const pruned = pruneDirections(analysis.directions, analysis, mesh, MASTER_PLANNER_LIMITS.maxCandidateDirections);
    analysis = pruned.analysis;

    const graph = buildSurfaceRegionGraph(mesh);
    const summaries = summarizeRegionAccessibility(graph, mesh, analysis);
    const unresolved = unresolvedSurfaceRegions(summaries, graph);

    expect(graph.regions.length).toBeGreaterThan(10);
    expect(unresolved).toEqual([]);
    for (const summary of summaries) expect(summary.bestVisibleAreaFraction).toBeGreaterThanOrEqual(0.999);
  });
});
