import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { refineRegionGraphByVisibility } from "./regionSubdivision";
import { greedyRegionCover } from "./regionSetCover";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildFreeFormObliqueLockFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 07: the synthetic test in accessibility.loop07.test.ts
 * proves the pruning ALGORITHM keeps a coverage-critical direction in a
 * small hand-built scene. This closes the plan's OWN second gate item
 * directly ("free-form regression does not lose required local
 * direction"), which was previously only indirect -- true only because
 * LOOP 11's own full-coverage assertion on the real fixture happens to
 * pass downstream of pruning, not because pruning's own effect on
 * coverage was ever isolated and checked on real geometry.
 *
 * Runs region-cover TWICE on the same real free-form regression fixture:
 * once against every candidate direction generated (no pruning at all),
 * once against a DELIBERATELY tight budget forced well below the real
 * candidate count (this fixture alone generates 26 raw candidates, never
 * enough to exceed the real engine's own 32-direction cap, so pruning
 * never actually activates on any real fixture in the current golden set
 * -- checked directly. A tight budget here exercises the exact same real
 * pruning algorithm against real geometry instead of leaving that code
 * path untested on anything but the synthetic scene). If pruning had
 * dropped a direction some region needs and no other retained direction
 * covers, the pruned run would leave that region newly uncovered while
 * the unpruned run does not.
 */
describe("Coverage-critical direction preservation on real geometry (Execution 08 LOOP 07)", () => {
  it("pruning the real free-form regression fixture's directions down to a tight budget does not leave any newly-uncovered region", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const seed = seedFromFixture(fixture);
    const planningMesh = buildPlanningMesh({
      positions: seed.sourceMesh.positions,
      indices: seed.sourceMesh.indices,
      bounds: seed.sourceBounds,
      sourceGeometryVersion: seed.sourceGeometryVersion,
    });
    const directions = generateCandidateDirections(planningMesh, seed.sourceMesh.positions);
    const fullAnalysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, directions);
    expect(fullAnalysis.directions.length).toBeLessThan(MASTER_PLANNER_LIMITS.maxCandidateDirections);

    const baseRegionGraph = buildSurfaceRegionGraph(planningMesh);

    const unprunedRegionGraph = refineRegionGraphByVisibility(baseRegionGraph, planningMesh, fullAnalysis).regionGraph;
    const unprunedCover = greedyRegionCover(unprunedRegionGraph, planningMesh, fullAnalysis);
    expect(unprunedCover.uncoveredRegionIndexes).toEqual([]);

    const tightBudget = Math.max(4, Math.floor(fullAnalysis.directions.length / 3));
    const pruned = pruneDirections(fullAnalysis.directions, fullAnalysis, planningMesh, tightBudget);
    expect(pruned.directions.length).toBeLessThan(fullAnalysis.directions.length);
    const prunedRegionGraph = refineRegionGraphByVisibility(baseRegionGraph, planningMesh, pruned.analysis).regionGraph;
    const prunedCover = greedyRegionCover(prunedRegionGraph, planningMesh, pruned.analysis);

    // Pruning must never leave a region uncovered that the full direction
    // set could cover -- the real evidence this gate item asks for.
    expect(prunedCover.uncoveredRegionIndexes).toEqual([]);
  });
});
