import { describe, expect, it } from "vitest";

import { getManifoldModule } from "../../geometry/manifold";
import { volumetricAssignmentSolid } from "./volumetricPartition";

/**
 * Execution 08 LOOP 02/14/28 (volumetric reconstruction): proves the core
 * primitive -- `Manifold.levelSet` driven by a real triangle-mesh nearest-
 * surface signed-distance field -- is genuinely correct for real geometry,
 * independent of whether it converges for the hardest known real
 * regression fixture (it currently does not; see this file's own doc
 * comment and `regionDirectConstruction.ts`'s for the full, precise
 * finding).
 */
describe("volumetricAssignmentSolid (Execution 08 LOOP 02/14/28)", () => {
  function boxMesh() {
    // A 10x10x10 box, corners 0-7 (bit0=x,bit1=y,bit2=z, -5/+5), faces as
    // pairs of triangles. Real, valid triangle mesh -- not a synthetic
    // point cloud.
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

  it("extracts a real, single-connected, correctly-sized solid for two well-separated flat faces", { timeout: 30_000 }, async () => {
    const module = await getManifoldModule();
    const sourceMesh = boxMesh();
    const bounds = { min: { x: -11, y: -11, z: -11 }, max: { x: 11, y: 11, z: 11 } };
    const edgeLengthMm = 22 / 60;
    // +X face (triangles 2,3) vs -X face (triangles 0,1): two OPPOSING,
    // non-adjacent flat quads sharing no edge -- the case this technique
    // handles cleanly.
    const solidPlusX = volumetricAssignmentSolid(module, {
      ownTriangleIndices: [2, 3],
      otherTriangleIndices: [0, 1],
      sourceMesh,
      bounds,
      edgeLengthMm,
    });
    const solidMinusX = volumetricAssignmentSolid(module, {
      ownTriangleIndices: [0, 1],
      otherTriangleIndices: [2, 3],
      sourceMesh,
      bounds,
      edgeLengthMm,
    });
    try {
      expect(solidPlusX.status()).toBe("NoError");
      expect(solidMinusX.status()).toBe("NoError");
      const envelopeVolume = 22 * 22 * 22;
      expect(solidPlusX.volume()).toBeCloseTo(envelopeVolume / 2, 0);
      expect(solidMinusX.volume()).toBeCloseTo(envelopeVolume / 2, 0);
      const overlap = solidPlusX.intersect(solidMinusX);
      try {
        expect(overlap.volume()).toBeLessThan(1e-6);
      } finally {
        overlap.delete();
      }
      for (const solid of [solidPlusX, solidMinusX]) {
        const components = solid.decompose();
        expect(components.length).toBe(1);
        for (const component of components) component.delete();
      }
    } finally {
      solidPlusX.delete();
      solidMinusX.delete();
    }
  });

  /**
   * Execution 08 LOOP 02/14/28: the real, precise, root-caused limitation
   * of nearest-real-surface partitioning, found while investigating why
   * this approach -- despite eliminating the CSG-boundary paradigm's own
   * "single-direction-projection" bias entirely -- still failed to
   * converge for the real hardest regression fixture, AND its fix.
   *
   * `MeshBVH.closestPointToPoint` correctly measures distance to the
   * NEAREST POINT ON THE FINITE TRIANGLE (clamped to its own edges, not
   * its infinite plane) -- the geometrically correct notion of "distance
   * to this real surface region". But wherever TWO adjacent pieces' own
   * patches share an edge (as this box's -X and -Y faces do, at the edge
   * x=-5,y=-5), the region beyond that shared edge is a genuine
   * mathematical TIE: both pieces' nearest point clamps to the exact same
   * shared edge point, so their distances are IDENTICAL there, not just
   * approximately. That is not open ambiguity along a curve -- once you
   * are beyond BOTH patches' extents (the outer diagonal wedge past their
   * shared edge/corner), the tie persists at every point in that entire
   * wedge, all the way to the envelope boundary. Neither `sdf > 0`
   * (strict) captures a tied point, so `Manifold.levelSet` did not assign
   * it to EITHER piece -- a real, structural GAP, not overlap, and not a
   * grid-resolution artifact (confirmed directly: refining the grid by
   * 2.5x left the gap volume unchanged). Measured directly: two adjacent
   * box faces (one small, five others forming an open box) gapped
   * ~2183mm3 of a 10648mm3 envelope, entirely in the wedge beyond their
   * shared edges.
   *
   * Fixed with a small secondary tie-breaking term in the sdf itself
   * (`volumetricAssignmentSolid`'s own doc comment has the full mechanism):
   * off the exact bisector of a tied wedge, one side's nearest triangle's
   * own INFINITE PLANE is closer than the other's -- using that as a
   * lightly-weighted secondary criterion collapses the ambiguous region
   * from a full wedge VOLUME down to (at most) its own measure-zero
   * bisector plane, which a continuous level-set field has no trouble
   * with. Measured directly: the SAME two-faces-of-a-box scenario that
   * gapped ~2183mm3 before the fix now gaps ~14mm3 (a ~150x reduction, and
   * what remains is consistent with ordinary grid-resolution noise along
   * that residual bisector, not a structural gap).
   */
  it("two adjacent finite patches sharing an edge tile correctly once the tie-break term is applied", { timeout: 30_000 }, async () => {
    const module = await getManifoldModule();
    const sourceMesh = boxMesh();
    const bounds = { min: { x: -11, y: -11, z: -11 }, max: { x: 11, y: 11, z: 11 } };
    const edgeLengthMm = 22 / 60;
    // piece1 = -X face only (triangles 0,1); piece0 = the other 5 faces
    // (triangles 2-11), which SHARE edges with piece1 along all 4 sides
    // of the box.
    const piece1 = [0, 1];
    const piece0 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const solid0 = volumetricAssignmentSolid(module, { ownTriangleIndices: piece0, otherTriangleIndices: piece1, sourceMesh, bounds, edgeLengthMm });
    const solid1 = volumetricAssignmentSolid(module, { ownTriangleIndices: piece1, otherTriangleIndices: piece0, sourceMesh, bounds, edgeLengthMm });
    try {
      const envelopeVolume = 22 * 22 * 22;
      const union = solid0.volume() + solid1.volume();
      const gap = envelopeVolume - union;
      // What remains is residual grid-resolution noise along the
      // (now measure-zero) bisector, not the ~2183mm3 structural gap the
      // unfixed version left -- a wide but real bound, deliberately far
      // below the old gap size, not just under the full envelope.
      expect(gap).toBeLessThan(100);
      const overlap = solid0.intersect(solid1);
      try {
        expect(overlap.volume()).toBeLessThan(100);
      } finally {
        overlap.delete();
      }
    } finally {
      solid0.delete();
      solid1.delete();
    }
  });
});
