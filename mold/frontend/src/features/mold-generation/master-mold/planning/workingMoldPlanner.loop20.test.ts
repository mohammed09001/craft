import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { createWorkingMoldPieceCountSearch } from "./workingMoldPlanner";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildFreeFormObliqueLockFixture, buildSimpleBoxFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 20: per-piece-count diagnostics must explain WHY a
 * count failed with a precise geometric referent (distinct unresolved
 * regions), not just a raw patch count with no meaning attached.
 */

describe("Precise per-piece-count rejection diagnostics (Execution 08 LOOP 20)", () => {
  it("names a specific unresolved region count for the real regression, bounded by the patch count", async () => {
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

    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    const step = search.next();
    expect(step).not.toBeNull();
    expect(step!.pieceCount).toBe(2);
    expect(step!.diagnostics.bestUnresolvedRegionCount).not.toBeNull();
    expect(step!.diagnostics.bestUnresolvedRegionCount).toBeGreaterThan(0);
    // A region groups multiple patches, so the region count can never
    // exceed the raw unassignable patch count.
    expect(step!.diagnostics.bestUnresolvedRegionCount!).toBeLessThanOrEqual(step!.diagnostics.bestUnassignablePatchCount!);
    expect(step!.rejectionReason).toMatch(/unresolved region\(s\)/);
  });

  it("reports zero unresolved regions on a successful plan", async () => {
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

    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    const step = search.next();
    expect(step!.rejectionReason).toBeNull();
    expect(step!.diagnostics.bestUnresolvedRegionCount).toBe(0);
  });
});
