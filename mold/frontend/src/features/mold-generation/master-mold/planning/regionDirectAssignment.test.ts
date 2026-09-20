import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { refineRegionGraphByVisibility } from "./regionSubdivision";
import { greedyRegionCover } from "./regionSetCover";
import { buildRegionDirectAssignment } from "./regionDirectAssignment";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildFreeFormObliqueLockFixture, buildSimpleBoxFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 14 (real-regression root cause fix): proves
 * `buildRegionDirectAssignment` achieves zero unassigned patches for the
 * real free-form regression fixture, where the ordered half-space
 * threshold search achieves zero feasible candidates at every piece count
 * (masterMoldEngine.loop02RealRegression.test.ts) despite region
 * set-cover proving 5 directions collectively see every region.
 */
describe("buildRegionDirectAssignment (Execution 08 LOOP 14 real-regression root cause)", () => {
  it("achieves zero unassigned patches for the real free-form regression fixture, where the threshold search achieves zero feasible candidates", { timeout: 60_000 }, async () => {
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
    const baseRegionGraph = buildSurfaceRegionGraph(planningMesh);
    const regionGraph = refineRegionGraphByVisibility(baseRegionGraph, planningMesh, analysis).regionGraph;
    const cover = greedyRegionCover(regionGraph, planningMesh, analysis);
    expect(cover.uncoveredRegionIndexes).toEqual([]);
    expect(cover.steps.length).toBe(5);

    const result = buildRegionDirectAssignment(regionGraph, planningMesh, analysis, cover.steps);
    expect(result.unassignedPatchCount).toBe(0);
    expect(result.pieceDirectionIndexes.length).toBe(5);
    // Every patch got a real piece index (0..4), never left at -1.
    for (const pieceIndex of result.assignment) {
      expect(pieceIndex).toBeGreaterThanOrEqual(0);
      expect(pieceIndex).toBeLessThan(5);
    }
  });

  it("also achieves zero unassigned patches for a trivial fixture (sanity check against a case the threshold search already solves)", async () => {
    const fixture = await buildSimpleBoxFixture();
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
    const cover = greedyRegionCover(regionGraph, planningMesh, analysis);
    expect(cover.uncoveredRegionIndexes).toEqual([]);

    const result = buildRegionDirectAssignment(regionGraph, planningMesh, analysis, cover.steps);
    expect(result.unassignedPatchCount).toBe(0);
  });
});
