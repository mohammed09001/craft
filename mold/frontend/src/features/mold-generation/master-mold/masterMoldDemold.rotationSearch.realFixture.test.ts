import { describe, expect, it } from "vitest";

import { getManifoldModule, manifoldFromPayload, boundsFromManifold, type ManifoldSolid } from "../geometry/manifold";
import { buildGeometryTolerancePolicy } from "../geometry/geometryTolerance";
import { buildPlanningMesh } from "./planning/planningMesh";
import { generateCandidateDirections } from "./planning/candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./planning/accessibility";
import { buildSurfaceRegionGraph } from "./planning/surfaceRegions";
import { refineRegionGraphByVisibility } from "./planning/regionSubdivision";
import { greedyRegionCover } from "./planning/regionSetCover";
import { buildRegionDirectAssignment } from "./planning/regionDirectAssignment";
import { buildMultiLabelConstructionPieces } from "./planning/regionDirectConstruction";
import { buildMultiLabelPartitionSolids } from "./planning/multiLabelPartition";
import { workingMoldEnvelopeWallMm, inflatedBounds, MASTER_PLANNER_LIMITS } from "./planning/masterMoldPlanning.contracts";
import { buildFreeFormObliqueLockFixture, seedFromFixture } from "./planning/masterMoldGoldenFixtures";
import { searchRotationReleasePath } from "./masterMoldDemold.rotationSearch";

/**
 * Execution 09 -- eighth technique: does true rotational release verification
 * (the one capability Section 6/8 of `Master Mold Execution 09.md` named as
 * the remaining unexplored path) find a release path for the real free-form
 * regression fixture's own remaining failing island, where translation-only
 * search (LOOP 5, `compoundPathSearch.realFixture.test.ts`) found zero slack
 * across the entire 52-direction planning candidate space at multiple
 * distance scales?
 *
 * Same real fixture, same construction pipeline, same failing island
 * (identified the identical way: the smallest carved multi-label piece) as
 * the already-committed compound-path real-fixture test -- this measures the
 * ONE variable that test could not: whether letting the piece SWEEP through
 * an arc (rather than only slide in a straight line) clears any of its
 * neighbors.
 *
 * Bounded candidate set, Pass 1 discipline (mirrors LOOP 5 Pass 1): 1 axis
 * point (the failing piece's own bounding-box center -- the simplest,
 * cheapest real candidate, not an arbitrary choice), 8 axis directions (the
 * 6 world axes plus the piece's own assigned release direction and its
 * negation -- the same reasoning LOOP 5 Pass 1 used), 8 angle magnitudes
 * (15 to 180 degrees), both rotational senses: 128 total candidates, each a
 * real, complete 32-sample rotational sweep (`verifyDemoldRotationByAxis`'s
 * own default resolution, matching `verifyDemoldTranslationByVector`'s own
 * `COARSE_SAMPLE_COUNT`).
 */
describe("Execution 09 (eighth technique, real fixture): does rotation about a bounded candidate axis set free the real failing island?", () => {
  it("searches rotational release for the real fixture's smallest carved piece, honestly reporting whether any of the 128 bounded candidates clear it", { timeout: 300_000 }, async () => {
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

    // Identical identification method to the committed compound-path
    // real-fixture test: the failing island is the smallest carved piece by
    // volume (Execution 08's own finding: a 6-triangle fragment, ~33.5mm3).
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
      console.log("failing piece volume:", failingPiece.volume());
      const pieceBounds = boundsFromManifold(failingPiece);
      const axisPoint = {
        x: (pieceBounds.min.x + pieceBounds.max.x) / 2,
        y: (pieceBounds.min.y + pieceBounds.max.y) / 2,
        z: (pieceBounds.min.z + pieceBounds.max.z) / 2,
      };
      const ownDirection = built!.pieces[failingIndex]!.releaseDirection;
      const axisDirections = [
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: -1 },
        ownDirection,
        { x: -ownDirection.x, y: -ownDirection.y, z: -ownDirection.z },
      ];

      const angleMagnitudesDeg = [15, 30, 45, 60, 90, 120, 150, 180];
      const pass1 = searchRotationReleasePath(combinedTool, failingPiece, {
        axisPoints: [axisPoint],
        axisDirections,
        angleMagnitudesDeg,
        volumeToleranceMm3: Math.max(policy.affectedVolumeToleranceMm3, 1e-3),
      });
      console.log("pass 1 (8 directions) result:", JSON.stringify(pass1));
      expect(pass1.candidatesTried).toBe(axisDirections.length * angleMagnitudesDeg.length * 2);

      // Pass 2 (mirrors LOOP 5 Pass 2's own escalation): broaden to the
      // FULL planning candidate-direction set -- every direction the
      // planning search itself ever generates, plus negations -- before
      // declaring an honest completed negative result, the same rigor as
      // every other completed search in this investigation.
      const allDirections = analysis.directions.map((d) => ({ x: d.vector.x, y: d.vector.y, z: d.vector.z }));
      const negatedDirections = allDirections.map((d) => ({ x: -d.x, y: -d.y, z: -d.z }));
      const fullDirectionSet = [...allDirections, ...negatedDirections];
      expect(fullDirectionSet.length).toBeGreaterThanOrEqual(52);

      const result = pass1.found !== null ? pass1 : searchRotationReleasePath(combinedTool, failingPiece, {
        axisPoints: [axisPoint],
        axisDirections: fullDirectionSet,
        angleMagnitudesDeg,
        volumeToleranceMm3: Math.max(policy.affectedVolumeToleranceMm3, 1e-3),
      });
      console.log("final rotation search result:", JSON.stringify(result));

      // Bounded, observable search (Execution 08 invariant #15): report the
      // exact candidate cost regardless of outcome, never a silent/free "no".
      expect(result.candidatesTried).toBeGreaterThan(0);

      if (result.found === null) {
        // An honest negative, consistent with (not a repeat of -- a
        // DIFFERENT technique from) LOOP 5's translation-only conclusion:
        // within this bounded candidate space, no simple single-axis
        // rotation clears the island either.
        expect(result.found).toBeNull();
        expect(result.candidatesTried).toBe(fullDirectionSet.length * angleMagnitudesDeg.length * 2);
      } else {
        // A genuine positive would be the first real release path found for
        // this island across the whole investigation -- flag it loudly
        // rather than silently asserting on it, since it changes this
        // fixture's entire status.
        console.log("BREAKTHROUGH CANDIDATE FOUND:", JSON.stringify(result.found));
      }
    } finally {
      for (const solid of carved) solid.delete();
      siblingsUnion?.delete();
      combinedTool.delete();
      partSolid.delete();
      clearanceSphere?.delete();
    }
  });
});
