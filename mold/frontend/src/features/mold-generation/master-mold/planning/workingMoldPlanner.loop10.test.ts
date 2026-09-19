import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { createWorkingMoldPieceCountSearch } from "./workingMoldPlanner";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import {
  buildFourHoleCubeFixture,
  buildHighPolySphereFixture,
  buildObliqueHoleCubeFixture,
  buildThreeHoleCubeFixture,
  seedFromFixture,
  type GoldenFixture,
} from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 10: piece ownership is defined by whole moldable
 * surface regions, not raw patch position -- a coherent region must never
 * be split across two pieces in the search's own finalist assignment.
 */

async function planningFor(fixture: GoldenFixture) {
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
  return { planningMesh, analysis };
}

function expectNoRegionSplitAcrossPieces(planningMesh: Awaited<ReturnType<typeof planningFor>>["planningMesh"], patchAssignment: readonly number[]): void {
  const regionGraph = buildSurfaceRegionGraph(planningMesh);
  for (const region of regionGraph.regions) {
    if (region.patchIndexes.length === 0) continue;
    const pieces = new Set(region.patchIndexes.map((patchIndex) => patchAssignment[patchIndex]));
    expect(pieces.size).toBe(1);
  }
}

describe("Region-consistent piece ownership (Execution 08 LOOP 10)", () => {
  it("keeps every moldable region within a single piece for a three-hole cube's chosen finalist", async () => {
    const { planningMesh, analysis } = await planningFor(await buildThreeHoleCubeFixture());
    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    let step = search.next();
    while (step !== null && step.finalists.length === 0) step = search.next();
    expect(step).not.toBeNull();
    for (const finalist of step!.finalists) {
      expectNoRegionSplitAcrossPieces(planningMesh, finalist.patchAssignment);
    }
  });

  it("keeps every moldable region within a single piece for an oblique fixture", async () => {
    const { planningMesh, analysis } = await planningFor(await buildObliqueHoleCubeFixture());
    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    let step = search.next();
    while (step !== null && step.finalists.length === 0) step = search.next();
    expect(step).not.toBeNull();
    for (const finalist of step!.finalists) {
      expectNoRegionSplitAcrossPieces(planningMesh, finalist.patchAssignment);
    }
  });

  it("keeps every moldable region within a single piece for a four-hole cube across all attempted piece counts", async () => {
    const { planningMesh, analysis } = await planningFor(await buildFourHoleCubeFixture());
    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    for (;;) {
      const step = search.next();
      if (step === null) break;
      for (const finalist of step.finalists) expectNoRegionSplitAcrossPieces(planningMesh, finalist.patchAssignment);
    }
  });

  it("does not regress the high-poly sphere: region forcing degrades safely to the proven per-patch assignment where a coherent region spans a wide extent", () => {
    const fixture = buildHighPolySphereFixture();
    const planningMesh = buildPlanningMesh({
      positions: fixture.mesh.positions,
      indices: fixture.mesh.indices,
      bounds: fixture.bounds,
      sourceGeometryVersion: "loop10-sphere",
    });
    const directions = generateCandidateDirections(planningMesh, fixture.mesh.positions);
    let analysis = analyzeDirectionAccessibility(fixture.mesh, planningMesh, directions);
    const pruned = pruneDirections(analysis.directions, analysis, planningMesh, MASTER_PLANNER_LIMITS.maxCandidateDirections);
    analysis = pruned.analysis;

    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    const step = search.next();
    expect(step).not.toBeNull();
    // The minimum two-piece plan must still be found (a giant polar-cap
    // region does not get force-split into an inaccessible assignment).
    expect(step!.rejectionReason).toBeNull();
    expect(step!.finalists.length).toBeGreaterThan(0);
  }, 30_000);
});
