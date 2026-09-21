import { describe, expect, it } from "vitest";

import { argminLabels, relaxLabeling } from "./multiLabelReconstruction";

/**
 * Execution 08 LOOP 02/14/28 (true multi-label surface reconstruction):
 * proves the core claim in `multiLabelReconstruction.ts`'s own doc comment
 * directly, in complete isolation from any mesh/geometry machinery -- that
 * an ICM/Potts-model relaxation can remove a small, isolated pocket of one
 * label surrounded by a much larger region of another, something no prior
 * distance-metric tie-break (five separate variants, `volumetricPartition.
 * ts`'s own doc comment has the full history) was ever able to do, since
 * none of them had any notion of a neighbor's label at all.
 */
describe("relaxLabeling (Execution 08 LOOP 02/14/28 true multi-label reconstruction)", () => {
  function buildGrid(size: number, labelCount: number, fillCost: (x: number, y: number, z: number, label: number) => number) {
    const dims: [number, number, number] = [size, size, size];
    const voxelCount = size * size * size;
    const dataCost = new Float64Array(voxelCount * labelCount);
    for (let z = 0; z < size; z += 1) {
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const v = (z * size + y) * size + x;
          for (let label = 0; label < labelCount; label += 1) dataCost[v * labelCount + label] = fillCost(x, y, z, label);
        }
      }
    }
    return { dims, dataCost, voxelCount };
  }

  it("removes a single mislabeled voxel surrounded entirely by a different label", () => {
    // A 5x5x5 grid where every voxel's true (dominant) label is 0, EXCEPT
    // one implanted "island" voxel at the center whose data cost is
    // (weakly) biased toward label 1 -- exactly the pathology this file's
    // own doc comment describes: a small pocket that a pure distance
    // criterion, evaluated with no regard for its neighbors, would assign
    // to the "wrong" (scattered, isolated) label.
    const size = 5;
    const center = 2;
    const { dims, dataCost, voxelCount } = buildGrid(size, 2, (x, y, z, label) => {
      const isIsland = x === center && y === center && z === center;
      if (isIsland) return label === 1 ? 0 : 1; // label 1 is (weakly) cheaper here
      return label === 0 ? 0 : 10; // everywhere else, label 0 is much cheaper
    });

    const initialLabels = argminLabels(dataCost, voxelCount, 2);
    // Confirms the island really is mislabeled before any smoothing --
    // otherwise this test would prove nothing.
    const islandIndex = (center * size + center) * size + center;
    expect(initialLabels[islandIndex]).toBe(1);
    expect([...initialLabels].filter((l) => l === 1)).toHaveLength(1);

    const result = relaxLabeling({
      dims,
      labelCount: 2,
      dataCost,
      initialLabels,
      smoothnessWeight: 2, // each of the island's 6 neighbors disagreeing costs 2 -- outweighs its own 1-unit data-cost preference for label 1.
      maxIterations: 10,
    });

    expect(result.converged).toBe(true);
    // The isolated pocket is gone entirely -- every voxel now agrees with
    // its overwhelming neighborhood majority.
    expect([...result.labels].every((l) => l === 0)).toBe(true);
  });

  it("does NOT erase a genuinely large, legitimate region just because it is a minority label", () => {
    // Two real halves of a 6-voxel-wide grid, split down the middle -- a
    // real boundary, not an isolated pocket. Smoothing should preserve it
    // (only sand down the boundary layer's own preference, never dissolve
    // an entire real region), proving this is not just "always erase the
    // minority label" but genuine data-cost-vs-smoothness balancing.
    const size = 6;
    const { dims, dataCost, voxelCount } = buildGrid(size, 2, (x, _y, _z, label) => {
      const trueLabel = x < size / 2 ? 0 : 1;
      return label === trueLabel ? 0 : 5;
    });
    const initialLabels = argminLabels(dataCost, voxelCount, 2);
    const result = relaxLabeling({
      dims,
      labelCount: 2,
      dataCost,
      initialLabels,
      smoothnessWeight: 1,
      maxIterations: 10,
    });
    const count = (label: number) => [...result.labels].filter((l) => l === label).length;
    expect(count(0)).toBeGreaterThan(voxelCount * 0.3);
    expect(count(1)).toBeGreaterThan(voxelCount * 0.3);
  });
});
