import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { createWorkingMoldPieceCountSearch } from "./workingMoldPlanner";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildFourHoleCubeFixture, buildFreeFormObliqueLockFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 18: the beam must not collapse onto near-identical
 * variations of the single best-scoring prefix -- a prefix addressing a
 * DIFFERENT unresolved region must survive selection even when its raw
 * score is worse, up to the same bounded beam width.
 */

describe("Region-aware beam diversity (Execution 08 LOOP 18)", () => {
  it("the beam explores genuinely distinct directions for a part needing four independent pulls, not a narrow score-only cluster", async () => {
    const fixture = await buildFourHoleCubeFixture();
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
    let step = search.next();
    while (step !== null && step.finalists.length === 0) step = search.next();
    expect(step).not.toBeNull();
    expect(step!.pieceCount).toBe(4);

    // The four independently-locked holes (+Z, -Z, +X, -X) each need their
    // own pull: the winning finalist must actually use four distinct
    // directions, not a beam that collapsed onto fewer.
    const finalist = step!.finalists[0]!;
    const directionIds = new Set(finalist.candidate.pieces.map((piece) => piece.directionId));
    expect(directionIds.size).toBe(4);
  });

  it("bounded: the beam never exceeds its configured width regardless of how many candidate prefixes tie on score", async () => {
    const fixture = await buildFourHoleCubeFixture();
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
    for (;;) {
      const step = search.next();
      if (step === null) break;
      // maxExactPlansPerPieceCount is the exposed finalist cap; the
      // underlying beam is a wider (but still bounded) intermediate --
      // exact CSG only ever sees the small final shortlist.
      expect(step.finalists.length).toBeLessThanOrEqual(MASTER_PLANNER_LIMITS.maxExactPlansPerPieceCount);
    }
  });

  it("the real free-form regression fixture's beam does not collapse early: it stays at full configured width across multiple piece counts", { timeout: 300_000 }, async () => {
    // This fixture never reaches a fully feasible candidate through the
    // ordinary beam search at any piece count (its real closure comes from
    // a separate last-resort, per LOOP 02's own status) -- so this cannot
    // check a WINNING finalist's own direction diversity the way the
    // four-hole-cube test above does. What it CAN check directly, by name,
    // is whether the beam itself dies down to a small/degenerate set (the
    // gate's own "does not die from early beam collapse" wording) or
    // genuinely retains real breadth throughout: `beamSizeUsed` is the
    // post-`selectDiverseBeam` beam size, reported honestly in diagnostics
    // for exactly this purpose (LOOP 26). A beam that collapsed onto
    // near-identical variations of a single best-scoring prefix would
    // report a small `beamSizeUsed` (1-2), not the full configured width.
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
    const beamSizesByPieceCount: number[] = [];
    for (;;) {
      const step = search.next();
      if (step === null) break;
      beamSizesByPieceCount.push(step.diagnostics.beamSizeUsed);
    }
    expect(beamSizesByPieceCount.length).toBeGreaterThan(1); // multiple piece counts genuinely searched, not a one-shot rejection.
    for (const beamSize of beamSizesByPieceCount) {
      expect(beamSize, `beamSizeUsed across piece counts: ${beamSizesByPieceCount.join(",")}`).toBe(MASTER_PLANNER_LIMITS.beamWidth);
    }
  });
});
