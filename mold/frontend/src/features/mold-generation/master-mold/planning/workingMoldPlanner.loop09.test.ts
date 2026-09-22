import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { candidatePartingThresholds, evaluateFinalized } from "./workingMoldPlanner";
import { MASTER_PLANNER_LIMITS, type AccessibilityAnalysis, type PlanningMesh, type PlanningPatch } from "./masterMoldPlanning.contracts";
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

  it("the primary (minimum) threshold can fail feasibility while a non-primary threshold succeeds -- the search must not stop at the first offset (Execution 08 LOOP 09 audit)", () => {
    // Two +Z-EXCLUSIVE tiers (z=2 and z=8, a real gap between them, as in
    // the first test above -- both count toward `candidatePartingThresholds`'s
    // own "exclusive projection" set, so the primary offset is anchored to
    // the LOWER tier, not the upper) plus a third "poison" patch sitting IN
    // that gap (z=3) that is releasable ONLY along -Z, genuinely blocked
    // along +Z (not just absent). The primary/minimum threshold (just above
    // the lower tier, z~2) sweeps the poison patch into the +Z piece along
    // with both tiers -- a real hard-blocked patch. A later, non-primary
    // threshold (between the tiers) excludes the lower tier AND the poison
    // patch from the +Z piece, sending them to the catch-all(-Z) piece
    // instead: the poison patch is genuinely -Z-visible there, and the
    // lower tier -- though not -Z-visible either -- is only "grazing" on
    // that side (an ambiguity, not a proven block, per LOOP 15), so it does
    // not itself count as a hard block. This is a real, minimal,
    // hand-engineered proof that trying only the primary offset would
    // silently reject an otherwise-valid direction.
    const patches: PlanningPatch[] = [];
    let patchIndex = 0;
    const push = (z: number, count: number) => {
      for (let i = 0; i < count; i += 1) {
        patches.push({ patchIndex, centroid: { x: i * 0.1, y: 0, z }, normal: { x: 0, y: 0, z: 1 }, areaMm2: 1, sourceTriangle: patchIndex });
        patchIndex += 1;
      }
    };
    push(2, 5); // lower tier: +Z-exclusive; "grazing" (not "blocked") on the -Z side.
    push(8, 5); // upper tier: +Z-exclusive; genuinely "blocked" on the -Z side.
    push(3, 1); // poison patch, in the gap: genuinely -Z-exclusive, "blocked" on the +Z side.
    const lowerTierIndexes = [0, 1, 2, 3, 4];
    const upperTierIndexes = [5, 6, 7, 8, 9];
    const poisonIndex = 10;

    // Within-tier adjacency (matching the first test's own working two-tier
    // pattern) -- the poison patch stays isolated, a distinct feature.
    const adjacency: number[][] = patches.map((_, index) => {
      if (lowerTierIndexes.includes(index)) return lowerTierIndexes.filter((other) => other !== index);
      if (upperTierIndexes.includes(index)) return upperTierIndexes.filter((other) => other !== index);
      return [];
    });
    const planningMesh: PlanningMesh = {
      patches,
      adjacency,
      totalAreaMm2: patches.reduce((sum, p) => sum + p.areaMm2, 0),
      bounds: { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 8 } },
      sourceGeometryVersion: "loop09-poison-patch",
      vertexCount: patches.length * 3,
      triangleCount: patches.length,
    };
    const regionGraph = buildSurfaceRegionGraph(planningMesh);

    // +Z: both tiers visible/clear; poison genuinely blocked.
    const plusZVisible = patches.map((_, i) => (i === poisonIndex ? 0 : 1));
    const plusZClassification = plusZVisible.map((v) => (v === 1 ? "clear" : "blocked"));
    // -Z: poison visible/clear; upper tier genuinely blocked; lower tier merely grazing (ambiguous).
    const minusZVisible = patches.map((_, i) => (lowerTierIndexes.includes(i) || upperTierIndexes.includes(i) ? 0 : 1));
    const minusZClassification = patches.map((_, i) => (i === poisonIndex ? "clear" : lowerTierIndexes.includes(i) ? "grazing" : "blocked"));

    const analysis: AccessibilityAnalysis = {
      directions: [
        { directionId: "world:world+Z", vector: { x: 0, y: 0, z: 1 }, source: "world-axis", origin: "loop09-poison" },
        { directionId: "world:world-Z", vector: { x: 0, y: 0, z: -1 }, source: "world-axis", origin: "loop09-poison" },
      ],
      perDirection: [
        {
          directionId: "world:world+Z",
          visible: plusZVisible,
          classification: plusZClassification,
          accessibleAreaMm2: plusZVisible.reduce((sum, v) => sum + v, 0),
          inaccessibleAreaMm2: plusZVisible.filter((v) => v === 0).length,
          undercutRegionCount: 1,
          largestUndercutAreaMm2: 1,
        },
        {
          directionId: "world:world-Z",
          visible: minusZVisible,
          classification: minusZClassification,
          accessibleAreaMm2: minusZVisible.reduce((sum, v) => sum + v, 0),
          inaccessibleAreaMm2: minusZVisible.filter((v) => v === 0).length,
          undercutRegionCount: 1,
          largestUndercutAreaMm2: 1,
        },
      ],
      dominantPatchOrder: patches.map((p) => p.patchIndex),
    };

    const offsets = candidatePartingThresholds(planningMesh, plusZVisible, minusZVisible, { x: 0, y: 0, z: 1 }, regionGraph);
    expect(offsets.length).toBeGreaterThanOrEqual(2);
    expect(offsets[0]).toBeCloseTo(2 - 1e-4, 3); // primary offset: just above the lower tier.

    const primaryResult = evaluateFinalized(planningMesh, analysis, regionGraph, [{ directionIndex: 0, offsetMm: offsets[0]! }], 1);
    expect(primaryResult.candidate.feasible).toBe(false); // the poison patch got swept into the +Z piece: a real hard block.

    const nonPrimaryOffset = offsets.find((offset) => offset > 5 && offset < 8);
    expect(nonPrimaryOffset).toBeDefined();
    const nonPrimaryResult = evaluateFinalized(planningMesh, analysis, regionGraph, [{ directionIndex: 0, offsetMm: nonPrimaryOffset! }], 1);
    expect(nonPrimaryResult.candidate.feasible).toBe(true); // excludes the poison patch (and the lower tier) from the +Z piece: genuinely feasible.

    // Sanity: the poison and lower-tier patches really did move to the
    // catch-all piece under the non-primary offset (piece index 1: the
    // remainder slot after the single prism at index 0).
    for (const index of [...lowerTierIndexes, poisonIndex]) {
      expect(nonPrimaryResult.assignment[index]).toBe(1);
    }
    for (const index of upperTierIndexes) {
      expect(nonPrimaryResult.assignment[index]).toBe(0); // stays in the +Z prism piece.
    }
  });
});
