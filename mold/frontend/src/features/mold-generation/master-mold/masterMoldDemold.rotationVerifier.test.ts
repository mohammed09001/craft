import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";

import { rotationMatrix4AboutAxis, verifyDemoldRotationByAxis } from "./masterMoldDemold.rotationVerifier";
import { verifyDemoldTranslationByVector } from "./masterMoldDemold.verifier";
import { getManifoldModule, manifoldFromPayload } from "../geometry/manifold";

/**
 * Execution 08/09: true rotational release verification -- the one
 * capability seven completed techniques in this project's own investigation
 * repeatedly named as the only unexplored path for a piece whose real
 * extraction motion is a rotation, not a straight-line pull.
 */

describe("rotationMatrix4AboutAxis", () => {
  it("matches three.js's own Matrix4 rotation-about-an-arbitrary-point composition exactly", () => {
    // Cross-check against an independent, already-trusted implementation
    // (three.js), not just internal self-consistency.
    const axisPoint = { x: 3, y: -2, z: 5 };
    const axisDirection = { x: 0.2672612419124244, y: 0.5345224838248488, z: 0.8017837257372732 }; // a normalized arbitrary direction (1,2,3)/|(1,2,3)|.
    const angleDeg = 47;

    const ours = rotationMatrix4AboutAxis(axisPoint, axisDirection, angleDeg);

    const theirs = new Matrix4()
      .makeTranslation(axisPoint.x, axisPoint.y, axisPoint.z)
      .multiply(new Matrix4().makeRotationAxis(new Vector3(axisDirection.x, axisDirection.y, axisDirection.z), (angleDeg * Math.PI) / 180))
      .multiply(new Matrix4().makeTranslation(-axisPoint.x, -axisPoint.y, -axisPoint.z));
    const theirsColumnMajor = theirs.toArray(); // three.js Matrix4.toArray is already column-major.

    for (let i = 0; i < 16; i += 1) {
      expect(ours[i]).toBeCloseTo(theirsColumnMajor[i]!, 9);
    }
  });

  it("leaves a point exactly on the axis fixed", () => {
    const axisPoint = { x: 1, y: 2, z: 3 };
    const axisDirection = { x: 0, y: 0, z: 1 };
    const matrix = rotationMatrix4AboutAxis(axisPoint, axisDirection, 73);
    // A point on the axis (same x,y as axisPoint, arbitrary z) must map to itself.
    const onAxis = new Vector3(1, 2, 100).applyMatrix4(new Matrix4().fromArray(matrix));
    expect(onAxis.x).toBeCloseTo(1, 9);
    expect(onAxis.y).toBeCloseTo(2, 9);
    expect(onAxis.z).toBeCloseTo(100, 9);
  });

  it("rotates a point 90 degrees about the Z axis through the origin exactly as expected", () => {
    const matrix = rotationMatrix4AboutAxis({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 90);
    const rotated = new Vector3(5, 0, 0).applyMatrix4(new Matrix4().fromArray(matrix));
    expect(rotated.x).toBeCloseTo(0, 9);
    expect(rotated.y).toBeCloseTo(5, 9);
    expect(rotated.z).toBeCloseTo(0, 9);
  });

  it("throws on a zero-length axis direction", () => {
    expect(() => rotationMatrix4AboutAxis({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 45)).toThrow();
  });
});

/** Axis-aligned box as a manifold-ready triangle mesh, appended into shared position/index arrays. */
function pushBox(positions: number[], indices: number[], min: readonly [number, number, number], max: readonly [number, number, number]): void {
  const base = positions.length / 3;
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const vertices: [number, number, number][] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  for (const v of vertices) positions.push(...v);
  const faces = [
    [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7],
    [1, 5, 6], [1, 6, 2], [0, 3, 7], [0, 7, 4],
  ];
  for (const [a, b, c] of faces) indices.push(base + a!, base + b!, base + c!);
}

describe("verifyDemoldRotationByAxis: the defining proof -- a real hinge-release case translation-only verification cannot see", () => {
  it("correctly rejects a straight pull for a piece trapped under a partial ceiling, but confirms it releases by rotating open about a hinge into the ceiling's own open gap", async () => {
    const module = await getManifoldModule();
    // Tool: a ceiling slab that covers y in [-10, 3] only (y > 3 is OPEN --
    // a real gap, not obstacle material), at height z in [10, 14].
    const toolPositions: number[] = [];
    const toolIndices: number[] = [];
    pushBox(toolPositions, toolIndices, [-10, -10, 10], [10, 3, 14]);
    const toolSolid = manifoldFromPayload(module, { positions: toolPositions, indices: toolIndices }, 1e-4);

    // Target: an L-shaped piece -- a vertical stem (floor to just under the
    // ceiling) plus a horizontal foot at the top, entirely under the
    // ceiling's own covered footprint (y in [-1, 1], well within [-10, 3]) --
    // a genuine vertical undercut: pulling straight up collides with the
    // ceiling immediately.
    const targetPositions: number[] = [];
    const targetIndices: number[] = [];
    pushBox(targetPositions, targetIndices, [-1, -1, 0], [1, 1, 10]); // stem
    pushBox(targetPositions, targetIndices, [-1, -1, 8], [1, 1, 10]); // foot (subset of stem footprint here -- straight L is enough: the stem itself is already under the ceiling).
    const targetSolid = manifoldFromPayload(module, { positions: targetPositions, indices: targetIndices }, 1e-4);

    try {
      // Straight pull along +Z: the whole piece is under the ceiling's footprint, so this must fail.
      const straightPull = verifyDemoldTranslationByVector(toolSolid, targetSolid, [0, 0, 1], 20, 1e-3, 1e-2);
      expect(straightPull.removable).toBe(false);

      // Hinge axis along X, through the piece's own base-back edge (y=-1, z=0):
      // swinging the piece's TOP toward +Y (into the ceiling's open gap,
      // y>3) should clear it without ever entering the ceiling's own y<3
      // covered region at ceiling height. Measured empirically which
      // rotational sense that is, rather than assumed.
      const positiveSweep = verifyDemoldRotationByAxis(toolSolid, targetSolid, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, 90, 1e-2);
      const negativeSweep = verifyDemoldRotationByAxis(toolSolid, targetSolid, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, -90, 1e-2);
      console.log("positive sweep:", positiveSweep, "negative sweep:", negativeSweep);
      // Exactly one of the two rotational senses about this hinge must
      // release it (swinging toward the open gap); the other swings deeper
      // under the ceiling and must still collide -- a real, asymmetric,
      // physically meaningful result, not both directions trivially free.
      expect(positiveSweep.removable).not.toBe(negativeSweep.removable);
      expect(positiveSweep.removable || negativeSweep.removable).toBe(true);
    } finally {
      toolSolid.delete();
      targetSolid.delete();
    }
  });
});
