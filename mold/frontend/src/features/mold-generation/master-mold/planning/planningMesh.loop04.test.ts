import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildHighPolySphereFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 04: medium meshes must not lose triangles to raw
 * triangle-index striding, and neither planning path (full-resolution or
 * clustered-reduction) may depend on triangle array order.
 */

/** `order[destinationTriangle] === sourceTriangle`: destination triangle `d` in the shuffled array holds the same physical triangle as original triangle `order[d]`. */
function shufflePermutation(triangleCount: number, seed: number): number[] {
  const order = Array.from({ length: triangleCount }, (_, index) => index);
  // Deterministic Fisher-Yates using a simple LCG (no dependency, reproducible).
  let state = seed >>> 0;
  const nextRandom = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp!;
  }
  return order;
}

function shuffledIndices(indices: readonly number[], order: readonly number[]): number[] {
  const shuffled: number[] = new Array(indices.length);
  order.forEach((sourceTriangle, destinationTriangle) => {
    shuffled[destinationTriangle * 3] = indices[sourceTriangle * 3]!;
    shuffled[destinationTriangle * 3 + 1] = indices[sourceTriangle * 3 + 1]!;
    shuffled[destinationTriangle * 3 + 2] = indices[sourceTriangle * 3 + 2]!;
  });
  return shuffled;
}

/** A medium (~1.6-2k triangle) free-form-ish mesh: a dense-enough UV sphere to sit inside the full-resolution band. */
function buildMediumSphere() {
  return buildHighPolySphereFixture(20, 40, 15); // ~1600 triangles.
}

describe("PlanningMesh triangle-order independence (Execution 08 LOOP 04)", () => {
  it("uses every triangle (no stride loss) for a medium mesh inside the full-resolution budget", () => {
    const fixture = buildMediumSphere();
    const triangleCount = fixture.mesh.indices.length / 3;
    expect(triangleCount).toBeLessThan(MASTER_PLANNER_LIMITS.fullResolutionPlanningTriangleBudget);
    expect(triangleCount).toBeGreaterThan(MASTER_PLANNER_LIMITS.maxPlanningPatches); // the exact regime the real part hit (stride=2 previously).

    const mesh = buildPlanningMesh({
      positions: fixture.mesh.positions,
      indices: fixture.mesh.indices,
      bounds: fixture.bounds,
      sourceGeometryVersion: "loop04-medium",
    });
    // One patch per (non-degenerate) triangle: no sampling loss.
    expect(mesh.patches.length).toBe(triangleCount);
  });

  it("produces the identical patch set for a medium mesh regardless of triangle array order", () => {
    const fixture = buildMediumSphere();
    const original = buildPlanningMesh({
      positions: fixture.mesh.positions,
      indices: fixture.mesh.indices,
      bounds: fixture.bounds,
      sourceGeometryVersion: "loop04-order-a",
    });
    const order = shufflePermutation(fixture.mesh.indices.length / 3, 12345);
    const reordered = buildPlanningMesh({
      positions: fixture.mesh.positions,
      indices: shuffledIndices(fixture.mesh.indices, order),
      bounds: fixture.bounds,
      sourceGeometryVersion: "loop04-order-b",
    });

    expect(reordered.patches.length).toBe(original.patches.length);
    expect(reordered.totalAreaMm2).toBeCloseTo(original.totalAreaMm2, 6);

    const fingerprint = (patches: typeof original.patches) =>
      patches
        .map((patch) => `${patch.centroid.x.toFixed(6)},${patch.centroid.y.toFixed(6)},${patch.centroid.z.toFixed(6)}|${patch.areaMm2.toFixed(6)}`)
        .sort();
    expect(fingerprint(reordered.patches)).toEqual(fingerprint(original.patches));
  });

  it("keeps patch count bounded and identical (exact clustering, not sampling) for a large mesh in any triangle order", () => {
    const fixture = buildHighPolySphereFixture(120, 240, 15); // ~57k triangles: well above the full-resolution budget.
    const triangleCount = fixture.mesh.indices.length / 3;
    expect(triangleCount).toBeGreaterThan(MASTER_PLANNER_LIMITS.fullResolutionPlanningTriangleBudget);

    const original = buildPlanningMesh({
      positions: fixture.mesh.positions,
      indices: fixture.mesh.indices,
      bounds: fixture.bounds,
      sourceGeometryVersion: "loop04-large-a",
    });
    const reordered = buildPlanningMesh({
      positions: fixture.mesh.positions,
      indices: shuffledIndices(fixture.mesh.indices, shufflePermutation(triangleCount, 987)),
      bounds: fixture.bounds,
      sourceGeometryVersion: "loop04-large-b",
    });

    expect(original.patches.length).toBeLessThanOrEqual(MASTER_PLANNER_LIMITS.maxPlanningPatches);
    expect(original.patches.length).toBeGreaterThan(100);
    // Content-derived clustering: exactly the same patches regardless of triangle order.
    expect(reordered.patches.length).toBe(original.patches.length);
    expect(reordered.totalAreaMm2).toBeCloseTo(original.totalAreaMm2, 6);
  });

  it("adjacency is topology-stable: the same physical neighbor relationships survive a triangle reorder (full-resolution path)", () => {
    const fixture = buildMediumSphere();
    const triangleCount = fixture.mesh.indices.length / 3;
    const order = shufflePermutation(triangleCount, 42);

    const original = buildPlanningMesh({
      positions: fixture.mesh.positions,
      indices: fixture.mesh.indices,
      bounds: fixture.bounds,
      sourceGeometryVersion: "loop04-adjacency-a",
    });
    const reordered = buildPlanningMesh({
      positions: fixture.mesh.positions,
      indices: shuffledIndices(fixture.mesh.indices, order),
      bounds: fixture.bounds,
      sourceGeometryVersion: "loop04-adjacency-b",
    });

    // Full-resolution path: one patch per triangle, so reordered patch `d`
    // (sourceTriangle === d in its own array) is physically the same
    // triangle as original patch `order[d]` (shuffledIndices put original
    // triangle `order[d]` at destination `d`).
    expect(reordered.patches.length).toBe(original.patches.length);
    let comparedAtLeastOneNonEmptyAdjacency = false;
    for (let reorderedPatchIndex = 0; reorderedPatchIndex < reordered.patches.length; reorderedPatchIndex += 1) {
      const originalPatchIndex = order[reorderedPatchIndex]!;
      const mappedNeighbors = new Set(reordered.adjacency[reorderedPatchIndex]!.map((neighbor) => order[neighbor]!));
      const originalNeighbors = new Set(original.adjacency[originalPatchIndex]!);
      if (originalNeighbors.size > 0) comparedAtLeastOneNonEmptyAdjacency = true;
      expect(mappedNeighbors).toEqual(originalNeighbors);
    }
    expect(comparedAtLeastOneNonEmptyAdjacency).toBe(true); // guards against a vacuously-true empty-adjacency mesh.
  });
});
