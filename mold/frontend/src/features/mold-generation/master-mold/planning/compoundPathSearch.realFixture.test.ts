import { describe, expect, it } from "vitest";

import { getManifoldModule, manifoldFromPayload, type ManifoldSolid } from "../../geometry/manifold";
import { buildGeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { refineRegionGraphByVisibility } from "./regionSubdivision";
import { greedyRegionCover } from "./regionSetCover";
import { buildRegionDirectAssignment } from "./regionDirectAssignment";
import { buildMultiLabelConstructionPieces } from "./regionDirectConstruction";
import { buildMultiLabelPartitionSolids } from "./multiLabelPartition";
import { workingMoldEnvelopeWallMm, inflatedBounds, MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildFreeFormObliqueLockFixture, seedFromFixture } from "./masterMoldGoldenFixtures";
import { searchCompoundReleasePath } from "../masterMoldDemold.compoundPathSearch";

/**
 * Execution 09 LOOP 5 (real-fixture preview, run to completion): does a
 * bounded compound-path search free the real free-form regression
 * fixture's own remaining island (Execution 08's own last unresolved
 * piece, `masterMoldEngine.loop02RealRegression.test.ts` has the full
 * history)?
 *
 * Two passes, both complete (see `Master Mold Execution 09.md` Section 4
 * for the full narrative):
 *  - Pass 1 (8 directions: 6 world axes + the island's own assigned
 *    direction/negation; 4 distances up to its own largest bounding-box
 *    dimension): 0 of 32 intermediate-hop candidates succeeded -- the
 *    island cannot move even 1mm along any of these without an immediate
 *    collision.
 *  - Pass 2 (this test): the FULL 52-direction planning candidate set
 *    (every direction the planning search itself ever generates, plus
 *    negations), at 0.5mm/1mm distances. An initial attempt was killed
 *    prematurely on an overly pessimistic cost estimate; re-run to actual
 *    completion, it finished in ~2 minutes (candidate successes are what
 *    make this search expensive, and there were none, so the recursion
 *    never went deep).
 *
 * Combined result: across the ENTIRE realistic candidate direction space
 * this project's planning process ever generates, at multiple distance
 * scales, this island cannot move at all without an immediate collision.
 * This is strong, direct evidence it is fully geometrically locked by its
 * neighbors' current shapes -- not a search-budget gap (Execution 08
 * invariant #10 still applies: this is not a claim that NO conceivable
 * direction anywhere could ever work, only that none in this project's
 * own real candidate space do). The real fix, if one exists, is almost
 * certainly upstream in the multi-label territory assignment itself
 * (Execution 08), not a more capable release search -- Execution 09's own
 * LOOP 4/6 (construction integration, the manufacturability question) are
 * accordingly on hold, not because they are wrong, but because this
 * specific island cannot use them.
 */
describe("Execution 09 LOOP 5 (real fixture): the remaining island has zero release slack across the full planning candidate space", () => {
  it("finds no compound path for the real fixture's failing island, across all 52 planning candidate directions", { timeout: 300_000 }, async () => {
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
    const direct = buildRegionDirectAssignment(regionGraph, planningMesh, analysis, cover.steps);
    const built = buildMultiLabelConstructionPieces(planningMesh, analysis, direct);
    expect(built).not.toBeNull();

    const module = await getManifoldModule();
    const bounds = seed.sourceBounds;
    const wallMm = workingMoldEnvelopeWallMm(bounds, seed.processProfile.minimumToolingWallMm);
    const envelopeBounds = inflatedBounds(bounds, wallMm);
    const policy = buildGeometryTolerancePolicy(envelopeBounds, 0);
    const diagonal = Math.hypot(
      envelopeBounds.max.x - envelopeBounds.min.x,
      envelopeBounds.max.y - envelopeBounds.min.y,
      envelopeBounds.max.z - envelopeBounds.min.z,
    );
    const voxelSizeMm = diagonal / 60;

    const rawResult = buildMultiLabelPartitionSolids(module, {
      pieceTriangleIndices: built!.pieces.map((piece) => piece.multiLabel!.ownTriangleIndices),
      sourceMesh: seed.sourceMesh,
      bounds: envelopeBounds,
      voxelSizeMm,
      smoothnessWeight: voxelSizeMm * 2,
      maxIterations: 15,
    });

    const partSolid = manifoldFromPayload(module, { positions: [...seed.sourceMesh.positions], indices: [...seed.sourceMesh.indices] }, policy.booleanToleranceMm);
    const releaseClearanceMm = seed.processProfile.releaseClearanceMm ?? 0;
    let negativeTool: ManifoldSolid = partSolid;
    let clearanceSphere: ManifoldSolid | null = null;
    if (releaseClearanceMm > 0) {
      clearanceSphere = module.Manifold.sphere(releaseClearanceMm, 16);
      negativeTool = partSolid.minkowskiSum(clearanceSphere);
    }

    const carved = rawResult.solids.map((solid) => solid.subtract(negativeTool));
    for (const solid of rawResult.solids) solid.delete();

    // The failing island is the smallest carved piece by volume (Execution
    // 08's own finding: a 6-triangle fragment, ~33.5mm3 here).
    const volumes = carved.map((solid) => solid.volume());
    let failingIndex = 0;
    let smallestVolume = Infinity;
    for (let i = 0; i < volumes.length; i += 1) {
      if (volumes[i]! < smallestVolume) {
        smallestVolume = volumes[i]!;
        failingIndex = i;
      }
    }

    let siblingsUnion: ManifoldSolid | null = null;
    for (let i = 0; i < carved.length; i += 1) {
      if (i === failingIndex) continue;
      siblingsUnion = siblingsUnion === null ? carved[i]!.asOriginal() : siblingsUnion.add(carved[i]!);
    }
    const combinedTool = siblingsUnion === null ? partSolid.asOriginal() : siblingsUnion.add(partSolid);
    const failingPiece = carved[failingIndex]!;

    try {
      const allDirections = analysis.directions.map((d) => [d.vector.x, d.vector.y, d.vector.z] as const);
      const negated = allDirections.map(([x, y, z]) => [-x, -y, -z] as const);
      const candidateDirections: (readonly [number, number, number])[] = [...allDirections, ...negated];
      expect(candidateDirections.length).toBeGreaterThanOrEqual(52);

      const result = searchCompoundReleasePath(combinedTool, failingPiece, {
        candidateDirections,
        intermediateDistancesMm: [0.5, 1],
        finalClearanceMm: diagonal,
        maxSegments: 2,
        toleranceMm: policy.surfaceToleranceMm,
        volumeToleranceMm3: Math.max(policy.affectedVolumeToleranceMm3, 1e-3),
      });

      // The honest, bounded, complete result: no path found within this
      // real candidate space, and the search actually exhausted its own
      // budget (never a silent/free "no" -- Execution 08 invariant #15).
      expect(result.path).toBeNull();
      expect(result.candidatesTried).toBe(candidateDirections.length + candidateDirections.length * 2);
    } finally {
      for (const solid of carved) solid.delete();
      siblingsUnion?.delete();
      combinedTool.delete();
      partSolid.delete();
      clearanceSphere?.delete();
    }
  });
});
