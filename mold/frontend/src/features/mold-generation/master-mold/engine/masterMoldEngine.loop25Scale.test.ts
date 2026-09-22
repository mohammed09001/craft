import { describe, expect, it } from "vitest";

import { buildMasterMoldSeedSnapshot, worldMeshFromSnapshot } from "../seed/masterMoldSeed";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { GENERIC_RIGID_CAST_PROFILE } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";
import { buildThreeHoleCubeFixture, type GoldenFixture } from "../planning/masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 25: the same shape at different unit scales must
 * produce an equivalent mold strategy -- same piece count, same
 * watertight/manifold/release-verified outcome -- with appropriately
 * scaled tolerances (LOOP 06 already made accessibility probing
 * scale-aware; this proves it holds end to end through the full engine,
 * including exact CSG construction).
 */

function scaleBounds(bounds: Bounds3, factor: number): Bounds3 {
  return {
    min: { x: bounds.min.x * factor, y: bounds.min.y * factor, z: bounds.min.z * factor },
    max: { x: bounds.max.x * factor, y: bounds.max.y * factor, z: bounds.max.z * factor },
  };
}

function seedAtScale(fixture: GoldenFixture, factor: number, geometryVersion: string) {
  const positions = fixture.mesh.positions.map((value) => value * factor);
  const bounds = scaleBounds(fixture.bounds, factor);
  return worldMeshFromSnapshot(buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: "loop25",
      positions,
      indices: fixture.mesh.indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: bounds,
      geometryVersion,
      sourceSignature: geometryVersion,
    },
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: "loop25-rev",
  }));
}

describe("Scale invariance at the full engine level (Execution 08 LOOP 25)", () => {
  it("plans the three-blind-hole cube equivalently at 0.1x, 1x, and 10x scale", { timeout: 180_000 }, async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const scales = [0.1, 1, 10];

    const results = await Promise.all(
      scales.map(async (factor) => {
        const seed = seedAtScale(fixture, factor, `loop25-scale-${factor}`);
        const result = await runMasterMoldEngine(seed);
        return { factor, result };
      }),
    );

    const reference = results.find((entry) => entry.factor === 1)!.result;
    expect(reference.failures).toEqual([]);
    expect(reference.plan).not.toBeNull();

    for (const { factor, result } of results) {
      expect(result.failures, `${factor}x: failures`).toEqual([]);
      expect(result.plan, `${factor}x: plan`).not.toBeNull();
      expect(result.plan!.moldPieces.length, `${factor}x: piece count`).toBe(reference.plan!.moldPieces.length);
      expect(
        result.plan!.rejectedPieceCounts.map((entry) => entry.pieceCount).sort(),
        `${factor}x: rejected piece counts`,
      ).toEqual(reference.plan!.rejectedPieceCounts.map((entry) => entry.pieceCount).sort());
      expect(result.plan!.moldPieces.every((piece) => piece.watertight && piece.manifold), `${factor}x: watertight/manifold`).toBe(true);
      expect(result.plan!.releaseSequence.every((step) => step.collisionVerified), `${factor}x: release verified`).toBe(true);

      // Execution 08 LOOP 25 (audit follow-up): release DIRECTIONS
      // (unit vectors, scale-independent) must match the reference set,
      // not just piece count/pass-fail -- matched by nearest vector since
      // piece encounter order is not guaranteed identical across scales.
      const referenceDirections = reference.plan!.moldPieces.map((piece) => piece.assignedDirection);
      const ownDirections = result.plan!.moldPieces.map((piece) => piece.assignedDirection);
      const unmatchedReference = [...referenceDirections];
      for (const direction of ownDirections) {
        const matchIndex = unmatchedReference.findIndex(
          (candidate) =>
            Math.abs(candidate.x - direction.x) < 1e-6 &&
            Math.abs(candidate.y - direction.y) < 1e-6 &&
            Math.abs(candidate.z - direction.z) < 1e-6,
        );
        expect(matchIndex, `${factor}x: direction [${direction.x},${direction.y},${direction.z}] has no unmatched reference counterpart`).toBeGreaterThanOrEqual(0);
        unmatchedReference.splice(matchIndex, 1);
      }
      expect(unmatchedReference, `${factor}x: every reference direction was matched`).toEqual([]);
    }
  });

  it("total working-mold piece volume grows monotonically with physical scale", { timeout: 180_000 }, async () => {
    // NOT a cube-law check: workingMoldEnvelopeWallMm has a fixed >= 5mm
    // minimum wall regardless of part size (WORKING_MOLD_ENVELOPE_POLICY),
    // so a tiny part's envelope wall dominates its piece volume and a
    // strict cube-law relationship does not hold at small scale -- that is
    // intentional (manufacturability), not a bug. The always-valid
    // invariant is monotonicity: strictly more material at a larger
    // physical scale, at every scale tested.
    const fixture = await buildThreeHoleCubeFixture();
    const scales = [0.1, 1, 10];
    const results = await Promise.all(
      scales.map(async (factor) => {
        const seed = seedAtScale(fixture, factor, `loop25-volume-${factor}`);
        const result = await runMasterMoldEngine(seed);
        return { factor, result };
      }),
    );
    let previousVolume = -Infinity;
    for (const { result } of results.sort((a, b) => a.factor - b.factor)) {
      const volume = result.plan!.moldPieces.reduce((sum, piece) => sum + piece.volumeMm3, 0);
      expect(volume).toBeGreaterThan(previousVolume);
      previousVolume = volume;
    }
  });
});
