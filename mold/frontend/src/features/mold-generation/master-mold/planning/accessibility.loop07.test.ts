import { describe, expect, it } from "vitest";

import { pruneDirections } from "./accessibility";
import type { AccessibilityAnalysis, DirectionAccessibility, PatchAccessibilityClass, PlanningCandidateDirection, PlanningMesh } from "./masterMoldPlanning.contracts";

/**
 * Execution 08 LOOP 07: a direction that uniquely covers one region must
 * survive pruning even when its global score is far worse than the
 * budget's cutoff would otherwise allow.
 *
 * Synthetic scene: patches 0/1 form one small locked region visible ONLY
 * along the oblique "special" direction (score-wise the worst of the four
 * candidates, because it leaves the large filler patch 2 inaccessible).
 * Three "good" directions cover patch 2 well but never see patches 0/1 at
 * all. None of the four candidates is a world axis, so the OLD algorithm's
 * only protection (always keep world axes) does not apply here -- a
 * `keep` budget smaller than the candidate count would drop "special"
 * entirely under naive top-N-by-score pruning.
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

  it("keeps ONLY the coverage-critical direction when the budget is smaller than the mandatory set (correctness over budget)", () => {
    const { planningMesh, analysis, directions } = buildScene();
    const pruned = pruneDirections(directions, analysis, planningMesh, 1);
    const keptIds = pruned.directions.map((d) => d.directionId);
    expect(keptIds).toEqual(["special"]);
  });

  it("drops the coverage-critical direction when the budget is generous enough for everything (no forced tradeoff needed)", () => {
    const { planningMesh, analysis, directions } = buildScene();
    const pruned = pruneDirections(directions, analysis, planningMesh, 10);
    expect(pruned.directions.map((d) => d.directionId).sort()).toEqual(["good-a", "good-b", "good-c", "special"]);
  });
});
