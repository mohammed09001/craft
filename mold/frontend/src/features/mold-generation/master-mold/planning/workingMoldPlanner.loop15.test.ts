import { describe, expect, it } from "vitest";

import { evaluateFinalized } from "./workingMoldPlanner";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import type { AccessibilityAnalysis, DirectionAccessibility, PatchAccessibilityClass, PlanningCandidateDirection, PlanningMesh } from "./masterMoldPlanning.contracts";

/**
 * Execution 08 LOOP 15: a single "grazing"/"uncertain" patch (LOOP 06: a
 * scale-aware probe classification, not a proven block) must not by itself
 * reject a decomposition before exact CSG ever runs -- only a "blocked"
 * (unambiguous) classification does.
 */

function buildScene() {
  const planningMesh: PlanningMesh = {
    patches: [
      { patchIndex: 0, centroid: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, areaMm2: 1, sourceTriangle: 0 },
      { patchIndex: 1, centroid: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, areaMm2: 1, sourceTriangle: 1 },
      { patchIndex: 2, centroid: { x: 10, y: 0, z: -10 }, normal: { x: 1, y: 0, z: 0 }, areaMm2: 100, sourceTriangle: 2 },
    ],
    adjacency: [[1], [0], []],
    totalAreaMm2: 102,
    bounds: { min: { x: -1, y: -1, z: -11 }, max: { x: 11, y: 1, z: 1 } },
    sourceGeometryVersion: "loop15-synthetic",
    vertexCount: 9,
    triangleCount: 3,
  };
  const directions: PlanningCandidateDirection[] = [
    { directionId: "prism", vector: { x: 0, y: 0, z: 1 }, source: "normal-cluster", origin: "loop15-prism" },
    { directionId: "catchall", vector: { x: 1, y: 0, z: 0 }, source: "normal-cluster", origin: "loop15-catchall" },
  ];
  const regionGraph = buildSurfaceRegionGraph(planningMesh);
  return { planningMesh, directions, regionGraph };
}

function analysisWith(patch1Classification: PatchAccessibilityClass): AccessibilityAnalysis {
  const { directions } = buildScene();
  const prismVisible = [1, 0, 1]; // patch1 unassignable along the prism direction.
  const catchallVisible = [0, 1, 1]; // patch0 invisible along catch-all -- the prism rescues it.
  const perDirection: DirectionAccessibility[] = [
    {
      directionId: "prism",
      visible: prismVisible,
      classification: ["clear", patch1Classification, "clear"],
      accessibleAreaMm2: 1,
      inaccessibleAreaMm2: 101,
      undercutRegionCount: 1,
      largestUndercutAreaMm2: 100,
    },
    {
      directionId: "catchall",
      visible: catchallVisible,
      classification: ["blocked", "clear", "clear"],
      accessibleAreaMm2: 101,
      inaccessibleAreaMm2: 1,
      undercutRegionCount: 1,
      largestUndercutAreaMm2: 1,
    },
  ];
  return { directions, perDirection, dominantPatchOrder: [2, 0, 1] };
}

describe("Classification-aware feasibility (Execution 08 LOOP 15)", () => {
  it("a grazing (ambiguous) unassignable patch does not reject the decomposition", () => {
    const { planningMesh, regionGraph } = buildScene();
    const analysis = analysisWith("grazing");
    const result = evaluateFinalized(planningMesh, analysis, regionGraph, [{ directionIndex: 0, offsetMm: -1 }], 1);
    expect(result.candidate.unassignablePatchCount).toBeGreaterThan(0); // patch1 is still formally unassigned...
    expect(result.candidate.feasible).toBe(true); // ...but a grazing patch alone does not block the plan.
  });

  it("an uncertain (ambiguous) unassignable patch does not reject the decomposition", () => {
    const { planningMesh, regionGraph } = buildScene();
    const analysis = analysisWith("uncertain");
    const result = evaluateFinalized(planningMesh, analysis, regionGraph, [{ directionIndex: 0, offsetMm: -1 }], 1);
    expect(result.candidate.feasible).toBe(true);
  });

  it("a blocked (unambiguous) unassignable patch still rejects the decomposition", () => {
    const { planningMesh, regionGraph } = buildScene();
    const analysis = analysisWith("blocked");
    const result = evaluateFinalized(planningMesh, analysis, regionGraph, [{ directionIndex: 0, offsetMm: -1 }], 1);
    expect(result.candidate.unassignablePatchCount).toBeGreaterThan(0);
    expect(result.candidate.feasible).toBe(false); // a proven block, not an ambiguity -- correctly rejected.
  });
});
