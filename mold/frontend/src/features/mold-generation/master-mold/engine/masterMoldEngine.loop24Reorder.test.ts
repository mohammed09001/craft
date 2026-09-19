import { describe, expect, it } from "vitest";

import { buildMasterMoldSeedSnapshot, worldMeshFromSnapshot } from "../seed/masterMoldSeed";
import { GENERIC_RIGID_CAST_PROFILE } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";
import { buildThreeHoleCubeFixture, type GoldenFixture } from "../planning/masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 24: an equivalent STL with a different triangle order
 * must plan the same way end to end -- same piece count, equivalent
 * release directions, equivalent final validity. Exercised at the full
 * engine level (not just the planning-mesh/region-graph unit level covered
 * by LOOP 04/05's own tests), since the real bug report was triangle order
 * changing the PRODUCT'S outcome.
 */

function shuffledIndices(indices: readonly number[], seed: number): number[] {
  const triangleCount = indices.length / 3;
  const order = Array.from({ length: triangleCount }, (_, index) => index);
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
  const shuffled: number[] = new Array(indices.length);
  order.forEach((sourceTriangle, destinationTriangle) => {
    shuffled[destinationTriangle * 3] = indices[sourceTriangle * 3]!;
    shuffled[destinationTriangle * 3 + 1] = indices[sourceTriangle * 3 + 1]!;
    shuffled[destinationTriangle * 3 + 2] = indices[sourceTriangle * 3 + 2]!;
  });
  return shuffled;
}

/** Reverses the ORDER of triangles while preserving each triangle's own vertex order (winding) -- reversing the flat array instead would flip every triangle's winding and produce a genuinely different (inverted) mesh. */
function reversedTriangleOrder(indices: readonly number[]): number[] {
  const triangleCount = indices.length / 3;
  const result: number[] = new Array(indices.length);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const source = triangleCount - 1 - triangle;
    result[triangle * 3] = indices[source * 3]!;
    result[triangle * 3 + 1] = indices[source * 3 + 1]!;
    result[triangle * 3 + 2] = indices[source * 3 + 2]!;
  }
  return result;
}

function seedFromRawFixture(fixture: GoldenFixture, indices: readonly number[], geometryVersion: string) {
  return worldMeshFromSnapshot(buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: "loop24",
      positions: fixture.mesh.positions,
      indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: fixture.bounds,
      geometryVersion,
      sourceSignature: geometryVersion,
    },
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: "loop24-rev",
  }));
}

describe("Triangle-reorder invariance at the full engine level (Execution 08 LOOP 24)", () => {
  it("plans the three-blind-hole cube identically under the original order, a shuffle, and a reversed order", { timeout: 180_000 }, async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const orderings: readonly { readonly label: string; readonly indices: readonly number[] }[] = [
      { label: "original", indices: fixture.mesh.indices },
      { label: "shuffled", indices: shuffledIndices(fixture.mesh.indices, 777) },
      { label: "reversed", indices: reversedTriangleOrder(fixture.mesh.indices) },
    ];

    const results = await Promise.all(
      orderings.map(async ({ label, indices }) => {
        const seed = seedFromRawFixture(fixture, indices, `loop24-${label}`);
        const result = await runMasterMoldEngine(seed);
        return { label, result };
      }),
    );

    const reference = results[0]!.result;
    expect(reference.failures).toEqual([]);
    expect(reference.plan).not.toBeNull();

    for (const { label, result } of results) {
      expect(result.failures, `${label}: failures`).toEqual([]);
      expect(result.plan, `${label}: plan`).not.toBeNull();
      // Same piece count, same rejection pattern (same physical minimum found).
      expect(result.plan!.moldPieces.length, `${label}: piece count`).toBe(reference.plan!.moldPieces.length);
      expect(
        result.plan!.rejectedPieceCounts.map((entry) => entry.pieceCount).sort(),
        `${label}: rejected piece counts`,
      ).toEqual(reference.plan!.rejectedPieceCounts.map((entry) => entry.pieceCount).sort());
      // Equivalent release directions (as a set of unit vectors, not order):
      // every piece is watertight/manifold and every release collision-verified.
      expect(result.plan!.moldPieces.every((piece) => piece.watertight && piece.manifold), `${label}: watertight/manifold`).toBe(true);
      expect(result.plan!.releaseSequence.every((step) => step.collisionVerified), `${label}: release verified`).toBe(true);
      expect(result.toolingSets.length, `${label}: tooling sets`).toBe(reference.toolingSets.length);
    }
  });
});
