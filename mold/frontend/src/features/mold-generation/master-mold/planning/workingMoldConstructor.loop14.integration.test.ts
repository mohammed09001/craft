import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { createWorkingMoldPieceCountSearch } from "./workingMoldPlanner";
import { constructWorkingMold } from "./workingMoldConstructor";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildSimpleBoxFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 14: proves the height-field construction path
 * (`heightFieldPartingSolid`, wired through `constructWorkingMold` via
 * `PlannedPieceRegion.curve`) produces a REAL, fully verified working mold
 * -- release-checked, watertight, single-connected pieces, an assembled
 * negative that exactly reproduces the part cavity -- for a real fixture's
 * own real parting curve, not just a geometrically-plausible-looking solid
 * in isolation (workingMoldConstructor.loop14.test.ts).
 */
describe("constructWorkingMold height-field path (Execution 08 LOOP 14 integration)", () => {
  it("constructs a fully verified working mold via the curve-based cutting tool, for a real fixture's own real parting curve", async () => {
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
    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 2 });
    const step = search.next();
    expect(step).not.toBeNull();
    expect(step!.finalists.length).toBeGreaterThan(0);
    const finalist = step!.finalists[0]!;
    expect(finalist.candidate.pieces.length).toBe(2);
    expect(finalist.interfaces.length).toBe(1);
    const curveInterface = finalist.interfaces[0]!;
    expect(curveInterface.selfIntersecting).toBe(false);
    expect(curveInterface.samplePoints.length).toBeGreaterThanOrEqual(3);

    const prismPieceIndex = finalist.candidate.pieces.findIndex((piece) => piece.prism !== null);
    expect(prismPieceIndex).toBeGreaterThanOrEqual(0);
    const planarPieces = finalist.candidate.pieces.map((piece) => ({
      releaseDirection: piece.releaseDirection,
      plane: piece.prism === null ? null : { direction: analysis.directions[piece.prism.directionIndex]!.vector, offsetMm: piece.prism.offsetMm },
    }));

    const curvePieces = planarPieces.map((piece, index) =>
      index === prismPieceIndex
        ? { releaseDirection: piece.releaseDirection, plane: piece.plane, curve: { points: curveInterface.samplePoints } }
        : piece,
    );
    const curveResult = await constructWorkingMold({
      sourceMesh: seed.sourceMesh,
      sourceBounds: seed.sourceBounds,
      releaseClearanceMm: 0,
      minimumToolingWallMm: 3,
      pieces: curvePieces,
    });

    expect(curveResult.pieces.length).toBe(2);
    for (const piece of curveResult.pieces) {
      expect(piece.watertight).toBe(true);
      expect(piece.manifold).toBe(true);
      expect(piece.volumeMm3).toBeGreaterThan(0);
    }
    expect(curveResult.releaseSequence.length).toBe(2);
    expect(curveResult.releaseSequence.every((releaseStep) => releaseStep.collisionVerified)).toBe(true);
  });
});
