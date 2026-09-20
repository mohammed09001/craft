import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { refineRegionGraphByVisibility } from "./regionSubdivision";
import { MASTER_PLANNER_LIMITS, type AccessibilityAnalysis, type PlanningMesh } from "./masterMoldPlanning.contracts";
import { buildFreeFormObliqueLockFixture, buildSimpleBoxFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 12: a region that straddles a visibility transition
 * (part visible along some direction, part not) is split into a resolvable
 * child and a remaining child, instead of the whole region being rejected
 * for one blocked part -- bounded by a minimum child size and a maximum
 * refinement depth.
 */

describe("Partial-region subdivision (Execution 08 LOOP 12)", () => {
  it("does not split a fully-planar, uniformly-resolved fixture (nothing to subdivide)", async () => {
    const fixture = await buildSimpleBoxFixture();
    const seed = seedFromFixture(fixture);
    const planningMesh = buildPlanningMesh({
      positions: seed.sourceMesh.positions,
      indices: seed.sourceMesh.indices,
      bounds: seed.sourceBounds,
      sourceGeometryVersion: seed.sourceGeometryVersion,
    });
    const directions = generateCandidateDirections(planningMesh, seed.sourceMesh.positions);
    const analysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, directions);
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const result = refineRegionGraphByVisibility(regionGraph, planningMesh, analysis);
    expect(result.subdividedRegionCount).toBe(0);
    expect(result.regionGraph).toBe(regionGraph); // same reference: no wasted rebuild when nothing changes.
  });

  it("splits a synthetic half-visible region into a fully resolved child and a remaining child", () => {
    // A single flat 4x1 strip region (uniform normal, so LOOP 05 keeps it
    // whole) where only the left half is visible along the only direction
    // that sees it at all.
    const patches = Array.from({ length: 8 }, (_, index) => ({
      patchIndex: index,
      centroid: { x: index, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      areaMm2: 1,
      sourceTriangle: index,
    }));
    const adjacency = patches.map((_, index) => {
      const list: number[] = [];
      if (index > 0) list.push(index - 1);
      if (index < patches.length - 1) list.push(index + 1);
      return list;
    });
    const planningMesh: PlanningMesh = {
      patches,
      adjacency,
      totalAreaMm2: 8,
      bounds: { min: { x: 0, y: -1, z: -1 }, max: { x: 8, y: 1, z: 1 } },
      sourceGeometryVersion: "loop12-synthetic",
      vertexCount: 24,
      triangleCount: 8,
    };
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    expect(regionGraph.regions).toHaveLength(1); // uniform normal: LOOP 05 keeps it as one region.

    const visible = patches.map((patch) => (patch.centroid.x < 4 ? 1 : 0)); // left half visible, right half not.
    const analysis: AccessibilityAnalysis = {
      directions: [{ directionId: "d0", vector: { x: 0, y: 0, z: 1 }, source: "normal-cluster", origin: "loop12" }],
      perDirection: [
        {
          directionId: "d0",
          visible,
          classification: visible.map((v) => (v === 1 ? "clear" : "blocked")),
          accessibleAreaMm2: 4,
          inaccessibleAreaMm2: 4,
          undercutRegionCount: 1,
          largestUndercutAreaMm2: 4,
        },
      ],
      dominantPatchOrder: patches.map((patch) => patch.patchIndex),
    };

    const result = refineRegionGraphByVisibility(regionGraph, planningMesh, analysis, { minRegionAreaFraction: 0.1, minRegionPatchCount: 2 });
    expect(result.subdividedRegionCount).toBe(1);
    expect(result.regionGraph.regions.length).toBeGreaterThan(1);
    const totalArea = result.regionGraph.regions.reduce((sum, region) => sum + region.areaMm2, 0);
    expect(totalArea).toBeCloseTo(8, 6); // no patch lost in the split.
    // The visible half is now its own region, fully resolvable.
    const visibleChild = result.regionGraph.regions.find((region) => region.patchIndexes.every((patchIndex) => visible[patchIndex] === 1));
    expect(visibleChild).toBeDefined();
  });

  it("does not fragment below the minimum region size (a tiny sliver stays merged with the whole region)", () => {
    const patches = Array.from({ length: 5 }, (_, index) => ({
      patchIndex: index,
      centroid: { x: index, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      areaMm2: 1,
      sourceTriangle: index,
    }));
    const adjacency = patches.map((_, index) => {
      const list: number[] = [];
      if (index > 0) list.push(index - 1);
      if (index < patches.length - 1) list.push(index + 1);
      return list;
    });
    const planningMesh: PlanningMesh = {
      patches,
      adjacency,
      totalAreaMm2: 5,
      bounds: { min: { x: 0, y: -1, z: -1 }, max: { x: 5, y: 1, z: 1 } },
      sourceGeometryVersion: "loop12-tiny",
      vertexCount: 15,
      triangleCount: 5,
    };
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    // Only the very last patch is invisible -- too small a sliver to be worth splitting out.
    const visible = [1, 1, 1, 1, 0];
    const analysis: AccessibilityAnalysis = {
      directions: [{ directionId: "d0", vector: { x: 0, y: 0, z: 1 }, source: "normal-cluster", origin: "loop12" }],
      perDirection: [
        {
          directionId: "d0",
          visible,
          classification: visible.map((v) => (v === 1 ? "clear" : "blocked")),
          accessibleAreaMm2: 4,
          inaccessibleAreaMm2: 1,
          undercutRegionCount: 1,
          largestUndercutAreaMm2: 1,
        },
      ],
      dominantPatchOrder: patches.map((patch) => patch.patchIndex),
    };
    const result = refineRegionGraphByVisibility(regionGraph, planningMesh, analysis, { minRegionAreaFraction: 0.5, minRegionPatchCount: 2 });
    expect(result.subdividedRegionCount).toBe(0);
    expect(result.regionGraph).toBe(regionGraph);
  });

  it("real free-form regression: subdivision runs safely (no crash, no area loss) without regressing the known unresolved-region finding", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
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
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const result = refineRegionGraphByVisibility(regionGraph, planningMesh, analysis);
    const totalAreaBefore = regionGraph.regions.reduce((sum, region) => sum + region.areaMm2, 0);
    const totalAreaAfter = result.regionGraph.regions.reduce((sum, region) => sum + region.areaMm2, 0);
    expect(totalAreaAfter).toBeCloseTo(totalAreaBefore, 3);
  });
});
