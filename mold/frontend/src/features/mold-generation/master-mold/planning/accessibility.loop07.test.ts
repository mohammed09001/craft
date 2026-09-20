import { describe, expect, it } from "vitest";

import { pruneDirections } from "./accessibility";
import type { AccessibilityAnalysis, DirectionAccessibility, PatchAccessibilityClass, PlanningCandidateDirection, PlanningMesh } from "./masterMoldPlanning.contracts";

/**
 * Execution 08 LOOP 07: a direction that uniquely covers one region must
 * survive pruning even when its global score is far worse than the
 * budget's cutoff would otherwise allow. AND: a region covered by SEVERAL
 * redundant directions (none individually "the only one") must still keep
 * at least one of them -- score-based trimming can otherwise eliminate an
 * entire redundant coverer set at once, since none of them looked
 * individually critical.
 *
 * Synthetic scene: patches 0/1 form one small locked region visible ONLY
 * along the oblique "special" direction (score-wise the worst of the four
 * candidates, because it leaves the large filler patch 2 inaccessible) --
 * its own region, no substitute. Patch 2 is a SEPARATE region covered
 * REDUNDANTLY by three "good" directions (any one of them would do), none
 * of which ever sees patches 0/1. None of the four candidates is a world
 * axis, so the OLD algorithm's only protection (always keep world axes)
 * does not apply here.
 *
 * `pruneDirections` found and fixed a real gap in this exact scene: the
 * ORIGINAL algorithm only ever protected a region with EXACTLY one
 * full-coverer (patches 0/1's "special"), and did nothing to check whether
 * a region with SEVERAL coverers (patch 2's three "good" directions) kept
 * at least one after score-based trimming -- at a `keep` budget of 1, the
 * original algorithm silently dropped ALL THREE of patch 2's coverers
 * (none was individually "critical"), leaving patch 2 uncovered even
 * though the full candidate set could reach it. The synthetic scene here
 * always had this property; the original test just never asserted patch
 * 2's own coverage survived, only that "special" did.
 */

function buildScene() {
  const planningMesh: PlanningMesh = {
    patches: [
      { patchIndex: 0, centroid: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, areaMm2: 1, sourceTriangle: 0 },
      { patchIndex: 1, centroid: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, areaMm2: 1, sourceTriangle: 1 },
      { patchIndex: 2, centroid: { x: 10, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 }, areaMm2: 100, sourceTriangle: 2 },
    ],
    adjacency: [[1], [0], []],
    totalAreaMm2: 102,
    bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 11, y: 1, z: 1 } },
    sourceGeometryVersion: "loop07-synthetic",
    vertexCount: 9,
    triangleCount: 3,
  };

  const directions: PlanningCandidateDirection[] = [
    { directionId: "special", vector: { x: 0, y: 0, z: 1 }, source: "normal-cluster", origin: "loop07-special" },
    { directionId: "good-a", vector: { x: 1, y: 0, z: 0 }, source: "normal-cluster", origin: "loop07-good-a" },
    { directionId: "good-b", vector: { x: -1, y: 0, z: 0 }, source: "normal-cluster", origin: "loop07-good-b" },
    { directionId: "good-c", vector: { x: 0, y: 1, z: 0 }, source: "normal-cluster", origin: "loop07-good-c" },
  ];

  const visibleByDirection: Record<string, readonly number[]> = {
    special: [1, 1, 0], // fully covers the locked region (patches 0/1), not patch 2.
    "good-a": [0, 0, 1],
    "good-b": [0, 0, 1],
    "good-c": [0, 0, 1],
  };

  const classificationOf = (visible: readonly number[]): PatchAccessibilityClass[] => visible.map((v) => (v === 1 ? "clear" : "blocked"));

  const perDirection: DirectionAccessibility[] = directions.map((direction) => {
    const visible = visibleByDirection[direction.directionId]!;
    const accessibleAreaMm2 = visible.reduce((sum, v, index) => sum + (v === 1 ? planningMesh.patches[index]!.areaMm2 : 0), 0);
    const inaccessibleAreaMm2 = planningMesh.totalAreaMm2 - accessibleAreaMm2;
    return {
      directionId: direction.directionId,
      visible,
      classification: classificationOf(visible),
      accessibleAreaMm2,
      inaccessibleAreaMm2,
      undercutRegionCount: inaccessibleAreaMm2 > 0 ? 1 : 0,
      largestUndercutAreaMm2: inaccessibleAreaMm2,
    };
  });

  const analysis: AccessibilityAnalysis = {
    directions,
    perDirection,
    dominantPatchOrder: [2, 0, 1],
  };

  return { planningMesh, analysis, directions };
}

describe("Coverage-critical direction preservation (Execution 08 LOOP 07)", () => {
  it("keeps the sole full-coverer of a region even though its score is far worse than the budget cutoff", () => {
    const { planningMesh, analysis, directions } = buildScene();
    const pruned = pruneDirections(directions, analysis, planningMesh, 3);
    const keptIds = pruned.directions.map((d) => d.directionId);
    expect(keptIds).toContain("special");
    expect(keptIds).toHaveLength(3);
  });

  it("keeps the sole coverer PLUS one survivor of the redundant set, even at a budget smaller than either group alone (correctness over budget)", () => {
    const { planningMesh, analysis, directions } = buildScene();
    const pruned = pruneDirections(directions, analysis, planningMesh, 1);
    const keptIds = pruned.directions.map((d) => d.directionId);
    // "special" is mandatory (patches 0/1's sole coverer). Patch 2's own
    // coverage must ALSO survive -- some one of good-a/b/c, not necessarily
    // a specific one (any of the three is an equally valid choice).
    expect(keptIds).toContain("special");
    const goodSurvivors = keptIds.filter((id) => id.startsWith("good-"));
    expect(goodSurvivors).toHaveLength(1);
    expect(keptIds).toHaveLength(2);
  });

  it("drops the coverage-critical direction when the budget is generous enough for everything (no forced tradeoff needed)", () => {
    const { planningMesh, analysis, directions } = buildScene();
    const pruned = pruneDirections(directions, analysis, planningMesh, 10);
    expect(pruned.directions.map((d) => d.directionId).sort()).toEqual(["good-a", "good-b", "good-c", "special"]);
  });
});
