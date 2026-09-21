import { describe, expect, it } from "vitest";

import { searchCompoundReleasePath } from "./masterMoldDemold.compoundPathSearch";
import { buildCompoundUndercutFixture } from "./masterMoldDemold.compoundPathFixtures";

/** The same 26-direction sample (6 axis, 12 face-diagonal, 8 corner-diagonal) used throughout this scoping effort. */
function sample26Directions(): (readonly [number, number, number])[] {
  const components = [-1, 0, 1];
  const directions: (readonly [number, number, number])[] = [];
  for (const dx of components) {
    for (const dy of components) {
      for (const dz of components) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const length = Math.hypot(dx, dy, dz);
        directions.push([dx / length, dy / length, dz / length]);
      }
    }
  }
  return directions;
}

/**
 * Execution 09 LOOP 3 (scoping proof): `searchCompoundReleasePath` finds
 * LOOP 1's known-good path WITHOUT being told the answer -- only given a
 * real, bounded direction set and a real, bounded intermediate-distance
 * set to try.
 */
describe("searchCompoundReleasePath (Execution 09 LOOP 3, scoping proof)", () => {
  it("finds a real compound path on LOOP 1's proven-hard fixture, without being told the answer", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      const result = searchCompoundReleasePath(part, piece, {
        candidateDirections: sample26Directions(),
        // A real, bounded set of plausible hop distances (not an
        // unbounded/continuous search) -- 3mm (the fixture's own actual
        // requirement) is included as an ordinary member of a
        // reasonable dimension-based sample, not injected as an answer.
        intermediateDistancesMm: [1, 2, 3, 5, 8],
        finalClearanceMm: 25,
        maxSegments: 2,
        toleranceMm: 1e-3,
        volumeToleranceMm3: 1e-3,
      });
      expect(result.path).not.toBeNull();
      expect(result.path).toHaveLength(2);
      expect(result.candidatesTried).toBeGreaterThan(0);
    } finally {
      part.delete();
      piece.delete();
    }
  });

  it("reports a real single-vector solution as a valid (length-1) path when one exists, not forcing a compound answer", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    // Shift the piece to already be aligned with the notch, with no rib
    // in the way at all -- a real, ordinary single-vector case.
    const alignedPiece = piece.translate(-3, 0, 0);
    piece.delete();
    try {
      const result = searchCompoundReleasePath(part, alignedPiece, {
        candidateDirections: sample26Directions(),
        intermediateDistancesMm: [1, 2, 3, 5, 8],
        finalClearanceMm: 25,
        maxSegments: 2,
        toleranceMm: 1e-3,
        volumeToleranceMm3: 1e-3,
      });
      expect(result.path).toHaveLength(1);
    } finally {
      part.delete();
      alignedPiece.delete();
    }
  });

  it("reports 'not found within the searched space' (never a false success) when the intermediate distance set doesn't include the real requirement", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      // Deliberately excludes 3mm, the fixture's own exact requirement --
      // proves the search does not silently "round" or "snap" to a
      // nearby untested value, and reports a real, honest miss.
      const result = searchCompoundReleasePath(part, piece, {
        candidateDirections: sample26Directions(),
        intermediateDistancesMm: [1, 2],
        finalClearanceMm: 25,
        maxSegments: 2,
        toleranceMm: 1e-3,
        volumeToleranceMm3: 1e-3,
      });
      expect(result.path).toBeNull();
      // A real miss still did real, observable work -- never a silent
      // or free "no", per Execution 08 invariant #15 (bounded and
      // observable search).
      expect(result.candidatesTried).toBeGreaterThan(0);
    } finally {
      part.delete();
      piece.delete();
    }
  });

  it("respects maxSegments: a 1-segment budget cannot find the 2-segment-only path", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      const result = searchCompoundReleasePath(part, piece, {
        candidateDirections: sample26Directions(),
        intermediateDistancesMm: [1, 2, 3, 5, 8],
        finalClearanceMm: 25,
        maxSegments: 1,
        toleranceMm: 1e-3,
        volumeToleranceMm3: 1e-3,
      });
      expect(result.path).toBeNull();
    } finally {
      part.delete();
      piece.delete();
    }
  });
});
