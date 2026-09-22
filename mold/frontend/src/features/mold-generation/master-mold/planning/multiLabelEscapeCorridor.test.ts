import { describe, expect, it } from "vitest";

import { carveEscapeCorridors } from "./multiLabelEscapeCorridor";

// dims = [5,5,3]: a genuine 3D grid with a real, non-boundary "middle"
// layer (z=1) -- a 2D (sizeZ=1) grid would make every voxel trivially
// "on the Z boundary," defeating the whole point of these tests.
const DIMS: [number, number, number] = [5, 5, 3];
const VOXEL_COUNT = 5 * 5 * 3;
const indexOf = (x: number, y: number, z: number) => (z * 5 + y) * 5 + x;

describe("carveEscapeCorridors", () => {
  it("carves a real minimal corridor for a piece sealed in the middle of a grid, when raw cavity space actually reaches the boundary", () => {
    // Label 0 owns only the true center voxel (2,2,1); label 1 owns
    // everything else. All voxels are cavity (the algorithm's own
    // territory decision is the only thing sealing label 0 in, exactly
    // the real-fixture finding this function exists to fix).
    const labels = new Int32Array(VOXEL_COUNT).fill(1);
    const centerIndex = indexOf(2, 2, 1);
    labels[centerIndex] = 0;
    const isCavity = new Uint8Array(VOXEL_COUNT).fill(1);

    const result = carveEscapeCorridors(labels, DIMS, isCavity, 2);

    expect(result.corridorsCarved).toBe(1);
    expect(result.genuinelyUnreachablePieceLabels).toEqual([]);
    expect(result.totalCorridorVoxels).toBeGreaterThan(0);

    let label0TouchesBoundary = false;
    for (let v = 0; v < VOXEL_COUNT; v += 1) {
      if (result.labels[v] !== 0) continue;
      const z = Math.floor(v / 25);
      const y = Math.floor((v % 25) / 5);
      const x = v % 5;
      if (x === 0 || y === 0 || z === 0 || x === 4 || y === 4 || z === 2) label0TouchesBoundary = true;
    }
    expect(label0TouchesBoundary).toBe(true);
    // The original center voxel is still label 0 -- the corridor extends
    // from it, never abandons it.
    expect(result.labels[centerIndex]).toBe(0);
  });

  it("leaves a piece untouched when its own territory already reaches the boundary", () => {
    const labels = new Int32Array(VOXEL_COUNT).fill(1);
    labels[indexOf(0, 0, 0)] = 0; // a real corner -- already on the boundary in all three axes.
    const isCavity = new Uint8Array(VOXEL_COUNT).fill(1);

    const result = carveEscapeCorridors(labels, DIMS, isCavity, 2);

    expect(result.corridorsCarved).toBe(0);
    expect(result.genuinelyUnreachablePieceLabels).toEqual([]);
    expect(result.labels).toEqual(labels);
  });

  it("correctly reports a piece as genuinely unreachable when even raw cavity space cannot reach the boundary -- and does not force a corridor through solid material", () => {
    // Same layout as the first test, but now a full shell of solid
    // ("part") material -- isCavity=0 -- surrounds the center voxel on
    // all 6 faces. No path exists through cavity space at all, regardless
    // of current labels: a genuine lock, not an assignment artifact.
    const labels = new Int32Array(VOXEL_COUNT).fill(1);
    const centerIndex = indexOf(2, 2, 1);
    labels[centerIndex] = 0;
    const isCavity = new Uint8Array(VOXEL_COUNT).fill(1);
    for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]] as const) {
      isCavity[indexOf(2 + dx, 2 + dy, 1 + dz)] = 0;
    }

    const result = carveEscapeCorridors(labels, DIMS, isCavity, 2);

    expect(result.corridorsCarved).toBe(0);
    expect(result.genuinelyUnreachablePieceLabels).toEqual([0]);
    // Labels are unchanged -- never a forced/incorrect relabeling through
    // solid material.
    expect(result.labels).toEqual(labels);
  });
});
