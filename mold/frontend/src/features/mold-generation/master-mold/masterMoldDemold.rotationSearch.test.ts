import { describe, expect, it } from "vitest";

import { searchRotationReleasePath } from "./masterMoldDemold.rotationSearch";
import { getManifoldModule, manifoldFromPayload } from "../geometry/manifold";

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

describe("searchRotationReleasePath: a bounded search finds the real hinge without being told it directly", () => {
  it("finds a clearing rotation for a piece trapped under a partial ceiling, among a candidate set with several axes", async () => {
    const module = await getManifoldModule();
    const toolPositions: number[] = [];
    const toolIndices: number[] = [];
    pushBox(toolPositions, toolIndices, [-10, -10, 10], [10, 3, 14]);
    const toolSolid = manifoldFromPayload(module, { positions: toolPositions, indices: toolIndices }, 1e-4);

    const targetPositions: number[] = [];
    const targetIndices: number[] = [];
    pushBox(targetPositions, targetIndices, [-1, -1, 0], [1, 1, 10]);
    const targetSolid = manifoldFromPayload(module, { positions: targetPositions, indices: targetIndices }, 1e-4);

    try {
      const result = searchRotationReleasePath(toolSolid, targetSolid, {
        axisPoints: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: -1, z: 0 },
          { x: 0, y: 1, z: 5 },
        ],
        axisDirections: [
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 0, z: 1 },
        ],
        angleMagnitudesDeg: [30, 60, 90, 180],
        volumeToleranceMm3: 1e-2,
      });
      console.log("search result:", JSON.stringify(result));
      // A real, bounded search: it must find SOME clearing candidate (this
      // piece genuinely has a rotational escape, unlike a translation), and
      // report a real, bounded candidate cost -- which specific axis it
      // finds first depends on iteration order and is not asserted here,
      // since this geometry (found empirically, not assumed) has more than
      // one real solution among the tried candidates.
      expect(result.found).not.toBeNull();
      expect(result.candidatesTried).toBeGreaterThan(0);
      expect(result.candidatesTried).toBeLessThanOrEqual(3 * 3 * 4 * 2); // fully bounded by the candidate set sizes.
    } finally {
      toolSolid.delete();
      targetSolid.delete();
    }
  });

  it("honestly reports no path found for a piece fully enclosed on every side except its own straight insertion axis", async () => {
    const module = await getManifoldModule();
    // A piece fully enclosed in a solid shell with a matching cavity --
    // the only real exit is back out the way it went in (+Z, not searched
    // here), so no rotation about any of these candidate axes/angles
    // should ever clear it without passing through solid shell material.
    const shellPositions: number[] = [];
    const shellIndices: number[] = [];
    pushBox(shellPositions, shellIndices, [-10, -10, -10], [10, 10, 10]);
    const cavityPositions: number[] = [];
    const cavityIndices: number[] = [];
    pushBox(cavityPositions, cavityIndices, [-2, -2, -2], [2, 2, 2]);
    const shellSolid = manifoldFromPayload(module, { positions: shellPositions, indices: shellIndices }, 1e-4);
    const cavitySolid = manifoldFromPayload(module, { positions: cavityPositions, indices: cavityIndices }, 1e-4);
    const toolSolid = shellSolid.subtract(cavitySolid);
    shellSolid.delete();

    const targetPositions: number[] = [];
    const targetIndices: number[] = [];
    pushBox(targetPositions, targetIndices, [-1.9, -1.9, -1.9], [1.9, 1.9, 1.9]); // fits snugly inside the cavity, well clear of the shell walls.
    const targetSolid = manifoldFromPayload(module, { positions: targetPositions, indices: targetIndices }, 1e-4);
    cavitySolid.delete();

    try {
      const result = searchRotationReleasePath(toolSolid, targetSolid, {
        axisPoints: [{ x: 0, y: 0, z: 0 }],
        axisDirections: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
        angleMagnitudesDeg: [30, 90, 180],
        volumeToleranceMm3: 1e-2,
      });
      console.log("enclosed-piece search result:", JSON.stringify(result));
      expect(result.found).toBeNull();
      expect(result.candidatesTried).toBe(1 * 3 * 3 * 2);
    } finally {
      toolSolid.delete();
      targetSolid.delete();
    }
  });
});
