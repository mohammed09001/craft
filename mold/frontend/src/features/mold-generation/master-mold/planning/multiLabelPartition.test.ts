import { describe, expect, it } from "vitest";

import { getManifoldModule } from "../../geometry/manifold";
import { buildMultiLabelPartitionSolids } from "./multiLabelPartition";

/**
 * Execution 08 LOOP 02/14/28 (true multi-label surface reconstruction):
 * proves `buildMultiLabelPartitionSolids` is correct on the same controlled
 * geometry `volumetricPartition.test.ts` uses, before ever measuring it
 * against the real free-form regression fixture -- the same discipline
 * applied to every construction technique in this project.
 */
describe("buildMultiLabelPartitionSolids (Execution 08 LOOP 02/14/28 true multi-label reconstruction)", () => {
  function boxMesh() {
    const c = (bx: number, by: number, bz: number) => [bx ? 5 : -5, by ? 5 : -5, bz ? 5 : -5];
    const positions: number[] = [
      ...c(0, 0, 0), ...c(1, 0, 0), ...c(1, 1, 0), ...c(0, 1, 0),
      ...c(0, 0, 1), ...c(1, 0, 1), ...c(1, 1, 1), ...c(0, 1, 1),
    ];
    const indices: number[] = [
      0, 3, 7, 0, 7, 4, // -X
      1, 5, 6, 1, 6, 2, // +X
      0, 4, 5, 0, 5, 1, // -Y
      3, 2, 6, 3, 6, 7, // +Y
      0, 1, 2, 0, 2, 3, // -Z
      4, 7, 6, 4, 6, 5, // +Z
    ];
    return { positions, indices };
  }

  it("tiles two well-separated flat faces correctly", { timeout: 30_000 }, async () => {
    const module = await getManifoldModule();
    const sourceMesh = boxMesh();
    const bounds = { min: { x: -11, y: -11, z: -11 }, max: { x: 11, y: 11, z: 11 } };
    const voxelSizeMm = 22 / 60;
    const result = buildMultiLabelPartitionSolids(module, {
      pieceTriangleIndices: [[2, 3], [0, 1]], // +X, -X
      sourceMesh,
      bounds,
      voxelSizeMm,
      smoothnessWeight: voxelSizeMm * 0.1,
      maxIterations: 5,
    });
    try {
      expect(result.solids).toHaveLength(2);
      const envelopeVolume = 22 * 22 * 22;
      for (const solid of result.solids) {
        expect(solid.status()).toBe("NoError");
        // A voxelized boundary quantizes volume by roughly boundary-area *
        // voxel-size (~87mm3 here) -- a real, expected source of noise
        // distinct from the exact BVH-based technique's own tolerance.
        expect(Math.abs(solid.volume() - envelopeVolume / 2)).toBeLessThan(100);
      }
      const overlap = result.solids[0]!.intersect(result.solids[1]!);
      try {
        expect(overlap.volume()).toBeLessThan(100);
      } finally {
        overlap.delete();
      }
    } finally {
      for (const solid of result.solids) solid.delete();
    }
  });

  it("tiles two adjacent finite patches sharing an edge with no structural gap", { timeout: 30_000 }, async () => {
    const module = await getManifoldModule();
    const sourceMesh = boxMesh();
    const bounds = { min: { x: -11, y: -11, z: -11 }, max: { x: 11, y: 11, z: 11 } };
    const voxelSizeMm = 22 / 60;
    const piece1 = [0, 1]; // -X face only
    const piece0 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // the other 5 faces
    const result = buildMultiLabelPartitionSolids(module, {
      pieceTriangleIndices: [piece0, piece1],
      sourceMesh,
      bounds,
      voxelSizeMm,
      smoothnessWeight: voxelSizeMm * 0.1,
      maxIterations: 5,
    });
    try {
      const envelopeVolume = 22 * 22 * 22;
      const union = result.solids[0]!.volume() + result.solids[1]!.volume();
      const gap = envelopeVolume - union;
      // A discrete voxel argmin-labeling has no continuous "tie wedge" at
      // all (every voxel gets SOME nearest label by construction) -- this
      // structural gap class should not exist here in the first place.
      expect(Math.abs(gap)).toBeLessThan(200);
      const overlap = result.solids[0]!.intersect(result.solids[1]!);
      try {
        expect(overlap.volume()).toBeLessThan(200);
      } finally {
        overlap.delete();
      }
    } finally {
      for (const solid of result.solids) solid.delete();
    }
  });
});
