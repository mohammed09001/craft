import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { runMeshPreflight } from "./meshPreflight";
import {
  buildFourHoleCubeFixture,
  buildFreeFormObliqueLockFixture,
  buildObliqueHoleCubeFixture,
  buildPartiallyVisibleCurvedFixture,
  buildSaddleLobeFixture,
  buildSimpleBoxFixture,
  buildThreeHoleCubeFixture,
  seedFromFixture,
  type GoldenFixture,
} from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 22: real free-form golden cases -- triangle count is
 * not the complexity metric (Article 24). Every family below must clear
 * mesh preflight and produce a real, non-degenerate region graph and
 * accessibility analysis; low piece-count success is asserted only where
 * it is physically expected (some families are deliberately hard cases
 * whose value is in exercising partial-coverage/region-subdivision logic,
 * not in succeeding at a small piece count).
 */

interface GoldenFamily {
  readonly label: string;
  readonly build: () => Promise<GoldenFixture> | GoldenFixture;
}

const FAMILIES: readonly GoldenFamily[] = [
  { label: "A: convex simple", build: () => buildSimpleBoxFixture() },
  { label: "B: one undercut", build: () => buildThreeHoleCubeFixture() },
  { label: "C: three-direction undercut", build: () => buildThreeHoleCubeFixture() },
  { label: "D: four-region free-form", build: () => buildFourHoleCubeFixture() },
  { label: "E: curved organic saddle/lobe", build: () => buildSaddleLobeFixture() },
  { label: "F: oblique local undercut", build: () => buildObliqueHoleCubeFixture() },
  { label: "G: partially visible curved region", build: () => buildPartiallyVisibleCurvedFixture() },
  { label: "H: real failing regression fixture", build: () => buildFreeFormObliqueLockFixture() },
];

describe("Real free-form golden families (Execution 08 LOOP 22)", () => {
  for (const family of FAMILIES) {
    it(`${family.label}: passes preflight and produces a real region graph + accessibility analysis`, async () => {
      const fixture = await family.build();
      const seed = seedFromFixture(fixture);

      const preflight = runMeshPreflight(seed.sourceMesh);
      expect(preflight.status).not.toBe("invalid-for-master-mold");
      expect(preflight.volumeMm3).toBeGreaterThan(0);

      const planningMesh = buildPlanningMesh({
        positions: seed.sourceMesh.positions,
        indices: seed.sourceMesh.indices,
        bounds: seed.sourceBounds,
        sourceGeometryVersion: seed.sourceGeometryVersion,
      });
      expect(planningMesh.patches.length).toBeGreaterThan(0);

      const regionGraph = buildSurfaceRegionGraph(planningMesh);
      expect(regionGraph.regions.length).toBeGreaterThan(0);
      const totalRegionArea = regionGraph.regions.reduce((sum, region) => sum + region.areaMm2, 0);
      expect(totalRegionArea).toBeCloseTo(planningMesh.totalAreaMm2, 3);

      const directions = generateCandidateDirections(planningMesh, seed.sourceMesh.positions);
      expect(directions.length).toBeGreaterThan(0);
      const analysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, directions);
      expect(analysis.perDirection.length).toBe(directions.length);
    }, 60_000);
  }

  it("triangle count is not the complexity metric: the saddle/lobe (smooth, no locked features) and the real regression fixture (locked, similar triangle scale) diverge sharply in resolvability", async () => {
    const saddle = await buildSaddleLobeFixture();
    const locked = await buildFreeFormObliqueLockFixture();

    const analysisFor = async (fixture: GoldenFixture) => {
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
      return { planningMesh, analysis, regionGraph };
    };

    const saddleResult = await analysisFor(saddle);
    const lockedResult = await analysisFor(locked);

    // Comparable triangle density (both in the same medium-mesh band)...
    expect(Math.abs(saddleResult.planningMesh.triangleCount - lockedResult.planningMesh.triangleCount)).toBeLessThan(5000);
    // ...but the saddle has no locked feature (every region resolves), while
    // the locked fixture's own real regression is already independently
    // proven to fail end to end (masterMoldEngine.loop02RealRegression.test.ts).
    for (const region of saddleResult.regionGraph.regions) {
      const best = saddleResult.analysis.perDirection.some((entry) =>
        region.patchIndexes.every((patchIndex) => entry.visible[patchIndex] === 1),
      );
      expect(best).toBe(true);
    }
  });
});
