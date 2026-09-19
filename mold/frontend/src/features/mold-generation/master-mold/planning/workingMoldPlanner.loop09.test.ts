import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { candidatePartingThresholds } from "./workingMoldPlanner";
import { MASTER_PLANNER_LIMITS, type PlanningMesh, type PlanningPatch } from "./masterMoldPlanning.contracts";
import { buildThreeHoleCubeFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 09: a single valid release direction must not fail the
 * search because only one plane offset was tried. `candidatePartingThresholds`
 * must generate multiple meaningful offsets, stay within the centralized
 * budget, and the regression geometry must actually need a non-primary one.
 */

/** Two disconnected 2x2x2 boxes stacked along Z with a real gap between them (z in [0,2] and z in [6,8]), all patches +Z-exclusive. */
function twoTierPlanningMesh(): PlanningMesh {
  const patches: PlanningPatch[] = [];
  let patchIndex = 0;
  const push = (z: number, count: number) => {
    for (let i = 0; i < count; i += 1) {
      patches.push({ patchIndex: patchIndex, centroid: { x: i * 0.1, y: 0, z }, normal: { x: 0, y: 0, z: 1 }, areaMm2: 1, sourceTriangle: patchIndex });
      patchIndex += 1;
    }
  };
  push(2, 5); // lower tier top face, all at z=2.
  push(8, 5); // upper tier top face, all at z=8 -- a 6mm gap from the lower tier.
  const adjacency: number[][] = patches.map((_, index) => {
    const tierStart = index < 5 ? 0 : 5;
    const tierEnd = index < 5 ? 5 : 10;
    return patches.map((_, other) => other).filter((other) => other !== index && other >= tierStart && other < tierEnd);
  });
  return {
    patches,
    adjacency,
    totalAreaMm2: patches.reduce((sum, p) => sum + p.areaMm2, 0),
    bounds: { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 8 } },
    sourceGeometryVersion: "loop09-synthetic",
    vertexCount: 30,
    triangleCount: 10,
  };
}

describe("Multiple parting thresholds per direction (Execution 08 LOOP 09)", () => {
  it("generates a distinct offset for each disconnected section along the direction, not just the minimum", () => {
    const planningMesh = twoTierPlanningMesh();
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const visible = planningMesh.patches.map(() => 1); // every patch is +Z-exclusive.
    const opposing = planningMesh.patches.map(() => 0);
    const offsets = candidatePartingThresholds(planningMesh, visible, opposing, { x: 0, y: 0, z: 1 }, regionGraph);

    expect(offsets.length).toBeGreaterThanOrEqual(2);
    expect(offsets.length).toBeLessThanOrEqual(MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection);
    // The primary (exact-exclusive-minimum) candidate is always first, at the lower tier.
    expect(offsets[0]).toBeCloseTo(2 - 1e-4, 3);
    // At least one OTHER candidate places the cut between the two tiers
    // (skipping the isolated lower cluster instead of dragging the prism
    // all the way down to include it) -- a genuinely different, non-primary offset.
    expect(offsets.some((offset) => offset > 5 && offset < 8)).toBe(true);
  });

  it("stays within the centralized per-direction budget even with many natural section changes", () => {
    const patches: PlanningPatch[] = [];
    for (let tier = 0; tier < 10; tier += 1) {
      patches.push({ patchIndex: tier, centroid: { x: 0, y: 0, z: tier * 3 }, normal: { x: 0, y: 0, z: 1 }, areaMm2: 1, sourceTriangle: tier });
    }
    const planningMesh: PlanningMesh = {
      patches,
      adjacency: patches.map(() => []),
      totalAreaMm2: 10,
      bounds: { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 27 } },
      sourceGeometryVersion: "loop09-many-gaps",
      vertexCount: 30,
      triangleCount: 10,
    };
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const visible = patches.map(() => 1);
    const opposing = patches.map(() => 0);
    const offsets = candidatePartingThresholds(planningMesh, visible, opposing, { x: 0, y: 0, z: 1 }, regionGraph);
    expect(offsets.length).toBeLessThanOrEqual(MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection);
  });

  it("generates real multiple thresholds on real free-form geometry (not just synthetic scenes)", async () => {
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
    const regionGraph = buildSurfaceRegionGraph(planningMesh);

    let sawMultiple = false;
    for (let d = 0; d < analysis.directions.length; d += 1) {
      const opposing = new Array(planningMesh.patches.length).fill(0);
      const offsets = candidatePartingThresholds(planningMesh, analysis.perDirection[d]!.visible, opposing, analysis.directions[d]!.vector, regionGraph);
      if (offsets.length > 1) sawMultiple = true;
      expect(offsets.length).toBeLessThanOrEqual(MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection);
    }
    expect(sawMultiple).toBe(true);
  });
});
