import { describe, expect, it } from "vitest";

import type { PlanningMesh, PlanningPatch } from "./masterMoldPlanning.contracts";
import type { RegionDirectAssignmentResult } from "./regionDirectAssignment";
import { __TEST_ONLY_buildPhysicalPieceComponents, __TEST_ONLY_componentsBeforeAbsorption } from "./regionDirectConstruction";

/**
 * Execution 08 LOOP 02/14/28 (assignment-stage fragmentation fix): measured
 * directly against the real free-form regression fixture, 132 of 187
 * regions (70%) are fully visible from more than one of the chosen
 * directions -- `buildRegionDirectAssignment`'s first-match-in-cover-order
 * rule picks arbitrarily among them, with zero regard for whether the
 * result is spatially compact. `absorbSmallDisconnectedComponents`
 * (regionDirectConstruction.ts) fixes exactly this: an orphan component
 * (any component that is not its own direction's largest) is reassigned
 * wholesale to an alternative direction only when that alternative (a)
 * legally covers every one of its patches' regions and (b) is mesh-adjacent
 * to it -- so a merge only ever happens where it actually eliminates a
 * seam, never just relocates it. This is deliberately conservative: a
 * direction's own largest component is never touched, so no direction can
 * ever be drained to zero patches (which would make the whole assignment
 * unusable -- `buildPhysicalPieces`'s own guard).
 *
 * These are synthetic adjacency graphs, not real geometry, so the exact
 * mechanism can be checked directly and deterministically rather than only
 * indirectly through an end-to-end piece count on the real fixture (that
 * end-to-end measurement -- 11 -> 10 physical pieces before any CSG/
 * volumetric construction -- is recorded in `Master Mold Execution 08.md`;
 * it does not, on its own, close LOOP 02/28's release-verification gap,
 * since the dominant fragmentation source is downstream, in construction
 * itself, not this assignment stage).
 */
describe("absorbSmallDisconnectedComponents (via buildPhysicalPieces)", () => {
  function fakePlanningMesh(patchCount: number, adjacency: readonly (readonly number[])[]): PlanningMesh {
    const patches: PlanningPatch[] = Array.from({ length: patchCount }, (_, index) => ({
      patchIndex: index,
      centroid: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      areaMm2: 1,
      sourceTriangle: index,
    }));
    return {
      patches,
      adjacency,
      totalAreaMm2: patchCount,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      sourceGeometryVersion: "test",
      vertexCount: patchCount,
      triangleCount: patchCount,
    };
  }

  it("merges an orphan component into a mesh-adjacent alternative direction that also legally covers it", () => {
    // Chain 0-1-2-3-4 plus a disconnected chain 5-6-7.
    const adjacency: (readonly number[])[] = [
      [1], // 0
      [0, 2], // 1
      [1, 3], // 2
      [2, 4], // 3
      [3], // 4
      [6], // 5
      [5, 7], // 6
      [6], // 7
    ];
    const planningMesh = fakePlanningMesh(8, adjacency);

    // A (piece 0) owns {0,1,5,6,7} -- two disconnected components: {0,1}
    // (orphan, size 2) and {5,6,7} (primary, size 3). B (piece 1) owns
    // {2,3,4}, one component (trivially primary).
    const assignment = Int32Array.from([0, 0, 1, 1, 1, 0, 0, 0]);
    const alternativePiecesByPatch: (readonly number[])[] = [
      [0, 1], // patch 0: A or B
      [0, 1], // patch 1: A or B
      [1], // patch 2: B only
      [1], // patch 3: B only
      [1], // patch 4: B only
      [0], // patch 5: A only
      [0], // patch 6: A only
      [0], // patch 7: A only
    ];
    const direct: RegionDirectAssignmentResult = {
      assignment,
      pieceDirectionIndexes: [10, 11],
      unassignedPatchCount: 0,
      alternativePiecesByPatch,
    };

    const before = __TEST_ONLY_componentsBeforeAbsorption(planningMesh, direct);
    expect(before.map((c) => [...c.patches].sort((a, b) => a - b))).toEqual(
      expect.arrayContaining([
        [0, 1],
        [2, 3, 4],
        [5, 6, 7],
      ]),
    );
    expect(before).toHaveLength(3);

    const after = __TEST_ONLY_buildPhysicalPieceComponents(planningMesh, direct);
    // {0,1} (direction A's orphan) merges into direction B, which already
    // owns the mesh-adjacent {2,3,4} -- one real connected piece results.
    expect(after).toHaveLength(2);
    const merged = after.find((c) => c.directionIndex === 1)!;
    expect([...merged.patches].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    const untouched = after.find((c) => c.directionIndex === 0)!;
    expect([...untouched.patches].sort((a, b) => a - b)).toEqual([5, 6, 7]);
  });

  it("leaves an orphan component untouched when its only legal alternative is not mesh-adjacent to it", () => {
    // {0,1} (orphan pair, isolated), {2} (C's singleton, isolated),
    // {3,4,5} (A's primary chain) -- no edges connect the orphan pair to
    // anything else, so even though C is a legal alternative for it, there
    // is nothing to merge into.
    const adjacency: (readonly number[])[] = [
      [1], // 0
      [0], // 1
      [], // 2
      [4], // 3
      [3, 5], // 4
      [4], // 5
    ];
    const planningMesh = fakePlanningMesh(6, adjacency);

    // A (piece 0) owns {0,1,3,4,5} -- two components: {0,1} (orphan, size
    // 2) and {3,4,5} (primary, size 3). C (piece 1) owns {2}.
    const assignment = Int32Array.from([0, 0, 1, 0, 0, 0]);
    const alternativePiecesByPatch: (readonly number[])[] = [
      [0, 1], // patch 0: A or C
      [0, 1], // patch 1: A or C
      [1], // patch 2: C only
      [0], // patch 3: A only
      [0], // patch 4: A only
      [0], // patch 5: A only
    ];
    const direct: RegionDirectAssignmentResult = {
      assignment,
      pieceDirectionIndexes: [10, 11],
      unassignedPatchCount: 0,
      alternativePiecesByPatch,
    };

    const after = __TEST_ONLY_buildPhysicalPieceComponents(planningMesh, direct);
    // C is a legal alternative for the orphan, but not mesh-adjacent to it
    // -- reassigning would only relocate the seam, not remove it, so the
    // orphan is correctly left as its own physical piece.
    expect(after).toHaveLength(3);
    expect(after.map((c) => [...c.patches].sort((a, b) => a - b))).toEqual(
      expect.arrayContaining([[0, 1], [2], [3, 4, 5]]),
    );
  });
});
