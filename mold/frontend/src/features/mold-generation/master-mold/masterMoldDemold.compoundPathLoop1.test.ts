import { describe, expect, it } from "vitest";

import { verifyDemoldTranslationByVector } from "./masterMoldDemold.verifier";
import { buildCompoundUndercutFixture } from "./masterMoldDemold.compoundPathFixtures";

/**
 * Execution 09 LOOP 1 (scoping proof): proves the fixture in
 * `masterMoldDemold.compoundPathFixtures.ts` actually has the property its
 * own doc comment claims -- no single straight-line pull releases the
 * piece, but a known-good 2-segment compound path does. This is the ground
 * truth LOOP 2's own `verifyDemoldTranslationByPath` tests build on.
 */
describe("Execution 09 LOOP 1: synthetic undercut fixture (scoping proof, not shipped code)", () => {
  it("no single straight-line direction releases the piece (sampled over a real direction set)", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    try {
      // A real, bounded sample: 6 axis directions, 12 face diagonals, 8
      // corner diagonals -- 26 directions, matching this project's own
      // planning candidate-direction convention (analogous to the real
      // engine's own ~26-direction candidate set).
      const components = [-1, 0, 1];
      const directions: [number, number, number][] = [];
      for (const dx of components) {
        for (const dy of components) {
          for (const dz of components) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const length = Math.hypot(dx, dy, dz);
            directions.push([dx / length, dy / length, dz / length]);
          }
        }
      }
      expect(directions).toHaveLength(26);

      for (const direction of directions) {
        const result = verifyDemoldTranslationByVector(part, piece, direction, 30, 1e-3, 1e-3);
        expect(result.removable).toBe(false);
      }
    } finally {
      part.delete();
      piece.delete();
    }
  });

  it("a hand-derived 2-segment compound path DOES release the piece", { timeout: 60_000 }, async () => {
    const { part, piece } = await buildCompoundUndercutFixture();
    let afterSegment1 = piece;
    try {
      // Segment 1: pure -X shift, exactly 3mm (clears the rib's own
      // X-range before any Y motion happens at all). Note: the
      // clearance passed here must match the segment's own EXACT
      // distance, not a generous overshoot -- unlike a final full
      // extraction (which wants "clear all the way out"), a bounded
      // segment must stop exactly where the next segment begins, or the
      // sweep will correctly (and, for this purpose, misleadingly) flag
      // the piece running past the notch into solid material beyond it.
      // This exact distinction is why LOOP 2's real primitive
      // (`verifyDemoldTranslationByPath`) needs its own segment-length
      // semantics, not a reuse of "clearance to full extraction."
      const segment1 = verifyDemoldTranslationByVector(part, piece, [-1, 0, 0], 3, 1e-3, 1e-3);
      expect(segment1.removable).toBe(true);

      afterSegment1 = piece.translate(-3, 0, 0);
      // Segment 2: pure +Y move from the shifted position, now aligned
      // with the notch and clear of the rib.
      const segment2 = verifyDemoldTranslationByVector(part, afterSegment1, [0, 1, 0], 25, 1e-3, 1e-3);
      expect(segment2.removable).toBe(true);
    } finally {
      part.delete();
      piece.delete();
      if (afterSegment1 !== piece) afterSegment1.delete();
    }
  });
});
