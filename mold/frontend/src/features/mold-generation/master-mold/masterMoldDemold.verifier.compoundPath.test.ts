import { describe, expect, it } from "vitest";

import { verifyDemoldTranslationByPath, verifyDemoldTranslationByVector } from "./masterMoldDemold.verifier";
import { buildCompoundUndercutFixture, COMPOUND_UNDERCUT_KNOWN_GOOD_PATH } from "./masterMoldDemold.compoundPathFixtures";

/**
 * Execution 09 LOOP 2 (scoping proof): proves `verifyDemoldTranslationByPath`
 * -- a real, exact multi-segment sweep, not a heuristic -- against LOOP 1's
 * own proven-hard fixture (`masterMoldDemold.compoundPathLoop1.test.ts`).
 */
describe("verifyDemoldTranslationByPath (Execution 09 LOOP 2, scoping proof)", () => {
  it("verifies LOOP 1's known-good 2-segment path", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      const result = verifyDemoldTranslationByPath(part, piece, COMPOUND_UNDERCUT_KNOWN_GOOD_PATH, 1e-3, 1e-3);
      expect(result.removable).toBe(true);
      expect(result.firstCollisionDistanceMm).toBeNull();
    } finally {
      part.delete();
      piece.delete();
    }
  });

  it("correctly REJECTS a 2-segment path that shifts too little in X to clear the rib", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      // Only 1mm of the required 3mm shift -- the piece still spans
      // X=[2,6] when it enters the rib's Y-range, well within the rib's
      // own X=[4,10] footprint. Proves the function actually checks
      // segment 2's real geometry, not just "some" shift happened.
      const result = verifyDemoldTranslationByPath(
        part,
        piece,
        [
          { direction: [-1, 0, 0], distanceMm: 1 },
          { direction: [0, 1, 0], distanceMm: 25 },
        ],
        1e-3,
        1e-3,
      );
      expect(result.removable).toBe(false);
      expect(result.firstCollisionDistanceMm).not.toBeNull();
    } finally {
      part.delete();
      piece.delete();
    }
  });

  it("correctly REJECTS a 2-segment path whose FIRST segment itself collides", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      // +X instead of -X: immediately drives the piece toward the
      // tunnel's own side wall well before any Y motion -- proves a
      // failure on segment 1 is reported correctly, not masked by
      // segment 2 never running.
      const result = verifyDemoldTranslationByPath(
        part,
        piece,
        [
          { direction: [1, 0, 0], distanceMm: 3 },
          { direction: [0, 1, 0], distanceMm: 25 },
        ],
        1e-3,
        1e-3,
      );
      expect(result.removable).toBe(false);
    } finally {
      part.delete();
      piece.delete();
    }
  });

  it("a single-segment path is exactly equivalent to verifyDemoldTranslationByVector on the same segment", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      const direct = verifyDemoldTranslationByVector(part, piece, [-1, 0, 0], 3, 1e-3, 1e-3);
      const viaPath = verifyDemoldTranslationByPath(part, piece, [{ direction: [-1, 0, 0], distanceMm: 3 }], 1e-3, 1e-3);
      expect(viaPath.removable).toBe(direct.removable);
      expect(viaPath.firstCollisionDistanceMm).toBe(direct.firstCollisionDistanceMm);
    } finally {
      part.delete();
      piece.delete();
    }
  });

  it("rejects an empty path", async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      expect(() => verifyDemoldTranslationByPath(part, piece, [], 1e-3, 1e-3)).toThrow();
    } finally {
      part.delete();
      piece.delete();
    }
  });
});
