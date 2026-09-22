import { describe, expect, it } from "vitest";

import { areaWeightedCentroid, perpendicularDistanceToAxis, buildMultiLabelPartitionSolids } from "./multiLabelPartition";
import { getManifoldModule } from "../../geometry/manifold";

/**
 * Execution 08/09 (shape-convexity-aware ICM, opt-in): direct proof of the
 * two new pure geometric primitives, then a real synthetic case showing the
 * bias mechanism actually changes which voxels a label claims -- ceding a
 * bent/off-axis region to a competing label rather than claiming it purely
 * because it is nearest.
 */

describe("areaWeightedCentroid", () => {
  it("returns the exact centroid of a single triangle", () => {
    const positions = [0, 0, 0, 6, 0, 0, 0, 6, 0];
    const indices = [0, 1, 2];
    const centroid = areaWeightedCentroid({ positions, indices }, [0]);
    expect(centroid[0]).toBeCloseTo(2, 6);
    expect(centroid[1]).toBeCloseTo(2, 6);
    expect(centroid[2]).toBeCloseTo(0, 6);
  });

  it("area-weights two triangles of different size correctly", () => {
    // Triangle 0: small (area 0.5, centroid near origin). Triangle 1: large (area 50, centroid far away).
    const positions = [
      0, 0, 0, 1, 0, 0, 0, 1, 0, // small triangle, centroid (1/3, 1/3, 0), area 0.5
      100, 0, 0, 110, 0, 0, 100, 10, 0, // large triangle, centroid (103.33, 3.33, 0), area 50
    ];
    const indices = [0, 1, 2, 3, 4, 5];
    const centroid = areaWeightedCentroid({ positions, indices }, [0, 1]);
    // Weighted heavily toward the large triangle (50 vs 0.5 area).
    expect(centroid[0]).toBeGreaterThan(90);
  });

  it("returns the origin for an empty triangle set (degenerate, never called this way in practice)", () => {
    const centroid = areaWeightedCentroid({ positions: [], indices: [] }, []);
    expect(centroid).toEqual([0, 0, 0]);
  });
});

describe("perpendicularDistanceToAxis", () => {
  it("is zero for a point exactly on the axis", () => {
    const distance = perpendicularDistanceToAxis([5, 0, 0], [0, 0, 0], { x: 1, y: 0, z: 0 });
    expect(distance).toBeCloseTo(0, 9);
  });

  it("measures the real perpendicular offset for a point beside the axis", () => {
    // Axis along +X through the origin; point at (5, 3, 4) is 3mm off in Y and 4mm off in Z -> perpendicular distance 5.
    const distance = perpendicularDistanceToAxis([5, 3, 4], [0, 0, 0], { x: 1, y: 0, z: 0 });
    expect(distance).toBeCloseTo(5, 9);
  });

  it("is invariant to how far along the axis the point projects", () => {
    const near = perpendicularDistanceToAxis([1, 2, 0], [0, 0, 0], { x: 1, y: 0, z: 0 });
    const far = perpendicularDistanceToAxis([1000, 2, 0], [0, 0, 0], { x: 1, y: 0, z: 0 });
    expect(near).toBeCloseTo(far, 9);
  });
});

describe("Convexity bias, opt-in mechanism (Execution 08/09)", () => {
  it("is a strict no-op when releaseDirections/convexityBiasWeight are omitted -- identical solids to the base technique", async () => {
    const module = await getManifoldModule();
    // Two adjacent flat squares sharing an edge, forming a simple box-like envelope split down the middle.
    const positions = [
      // Label 0's own surface: a flat square at x=0..10, y=0..10, z=0.
      0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0,
      // Label 1's own surface: a flat square at x=10..20, y=0..10, z=0.
      10, 0, 0, 20, 0, 0, 20, 10, 0, 10, 10, 0,
    ];
    const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
    const bounds = { min: { x: -1, y: -1, z: -6 }, max: { x: 21, y: 11, z: 6 } };
    const baseInput = {
      pieceTriangleIndices: [[0, 1], [2, 3]],
      sourceMesh: { positions, indices },
      bounds,
      voxelSizeMm: 2,
      smoothnessWeight: 1,
      maxIterations: 10,
    };
    const without = buildMultiLabelPartitionSolids(module, baseInput);
    const withUndefinedBias = buildMultiLabelPartitionSolids(module, { ...baseInput, releaseDirections: [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }], convexityBiasWeight: 0 });
    expect(without.solids[0]!.volume()).toBeCloseTo(withUndefinedBias.solids[0]!.volume(), 6);
    expect(without.solids[1]!.volume()).toBeCloseTo(withUndefinedBias.solids[1]!.volume(), 6);
    for (const solid of [...without.solids, ...withUndefinedBias.solids]) solid.delete();
  });

  it("a real, positive bias measurably shrinks a label's off-axis claim relative to the unbiased baseline", async () => {
    // Label 0's real surface is an L-shape (bent): a horizontal arm PLUS a
    // vertical arm meeting at a corner -- its nearest-surface territory
    // would naturally follow the bend. Label 0's own release direction is
    // simply +X (along the horizontal arm only) -- the vertical arm is
    // genuinely OFF that axis. A real convexity bias should make label 0
    // claim LESS of the vertical-arm region (ceding it to label 1, whose
    // own flat surface sits right behind it) than the unbiased baseline.
    const module = await getManifoldModule();
    const positions = [
      // Label 0: horizontal arm (x=0..20, y=0..4, z=0).
      0, 0, 0, 20, 0, 0, 20, 4, 0, 0, 4, 0,
      // Label 0: vertical arm (x=16..20, y=4..20, z=0) -- bent 90 degrees off the horizontal arm.
      16, 4, 0, 20, 4, 0, 20, 20, 0, 16, 20, 0,
      // Label 1: a flat competing surface directly behind the vertical arm (x=16..20, y=4..20, z=-3).
      16, 4, -3, 20, 4, -3, 20, 20, -3, 16, 20, -3,
    ];
    const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11];
    const bounds = { min: { x: -1, y: -1, z: -6 }, max: { x: 21, y: 21, z: 3 } };
    const baseInput = {
      pieceTriangleIndices: [[0, 1, 2, 3], [4, 5]],
      sourceMesh: { positions, indices },
      bounds,
      voxelSizeMm: 1,
      smoothnessWeight: 0.5,
      maxIterations: 15,
    };
    const unbiased = buildMultiLabelPartitionSolids(module, baseInput);
    const biased = buildMultiLabelPartitionSolids(module, {
      ...baseInput,
      releaseDirections: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }],
      convexityBiasWeight: 3,
    });
    const unbiasedVolume0 = unbiased.solids[0]!.volume();
    const biasedVolume0 = biased.solids[0]!.volume();
    console.log("unbiased label-0 volume:", unbiasedVolume0, "biased label-0 volume:", biasedVolume0);
    // Real, measurable effect: the bias claims LESS territory for label 0
    // (ceding the off-axis vertical arm's own nearby voxels to label 1)
    // than the unbiased baseline -- not identical, not more.
    expect(biasedVolume0).toBeLessThan(unbiasedVolume0);
    for (const solid of [...unbiased.solids, ...biased.solids]) solid.delete();
  });
});
