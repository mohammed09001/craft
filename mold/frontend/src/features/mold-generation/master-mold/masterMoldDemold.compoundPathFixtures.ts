import { getManifoldModule, createBlankSolid, type ManifoldSolid } from "../geometry/manifold";

/**
 * Execution 09 LOOP 1 (scoping proof): a hand-designed synthetic piece that
 * is provably infeasible for ANY single straight-line pull (including
 * diagonals), but has a known-good 2-segment compound path. Shared between
 * `masterMoldDemold.compoundPathLoop1.test.ts` (proves both halves of that
 * claim) and `masterMoldDemold.verifier.compoundPath.test.ts` (LOOP 2's own
 * `verifyDemoldTranslationByPath` tests).
 *
 * Construction: a rectangular "part" with a straight tunnel bored through
 * it (X=[0,10], Y=[0,20], Z=[0,10]). Both tunnel ends are capped by the
 * part's own solid material, EXCEPT for a notch cut through the Y=20 cap
 * at X=[0,4] (full Z height) -- the only opening to the outside. A "rib"
 * of solid part material fills the tunnel's right side (X=[4,10]) for
 * Y=[8,20], directly in front of the notch's own X-range on the wrong
 * side.
 *
 * The piece fills the tunnel's empty space near the Y=0 end, at
 * X=[3,7] (centered in the 10-wide tunnel), Y=[2,7.9] (short, stays clear
 * of the rib), Z=[0,10] (flush with tunnel floor/ceiling).
 *
 * Why no single vector works (see `masterMoldDemold.compoundPathLoop1.
 * test.ts` for the full derivation): the piece's own X-extent is [3,7] at
 * rest, and the rib occupies X=[4,10] for Y=[8,20] -- the piece's right
 * side collides with the rib unless it has already fully shifted to
 * X=[0,4] (matching the notch) *before* its leading edge reaches Y=8. A
 * single linear vector moves X and Y in constant proportion the whole way,
 * so it can never front-load the X shift before Y motion begins the way a
 * genuinely bent path can.
 *
 * The known-good compound path: segment 1 is a pure -3mm shift in X (zero
 * Y motion, so the rib -- which does not exist before Y=8 -- is
 * irrelevant); segment 2 is a pure +Y move with X now fixed at [0,4],
 * which is both clear of the rib (X=[4,10] only) and aligned with the
 * Y=20 notch (also X=[0,4]).
 */
export async function buildCompoundUndercutFixture(): Promise<{ readonly part: ManifoldSolid; readonly piece: ManifoldSolid }> {
  const module = await getManifoldModule();
  const outerBlock = createBlankSolid(module, { min: { x: -5, y: -5, z: -5 }, max: { x: 15, y: 25, z: 15 } });
  const tunnel = createBlankSolid(module, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 20, z: 10 } });
  const notch = createBlankSolid(module, { min: { x: 0, y: 19, z: 0 }, max: { x: 4, y: 26, z: 10 } });
  const rib = createBlankSolid(module, { min: { x: 4, y: 8, z: 0 }, max: { x: 10, y: 20, z: 10 } });
  const piece = createBlankSolid(module, { min: { x: 3, y: 2, z: 0 }, max: { x: 7, y: 7.9, z: 10 } });

  const part = outerBlock.subtract(tunnel);
  tunnel.delete();
  const withNotch = part.subtract(notch);
  part.delete();
  notch.delete();
  const finalPart = withNotch.add(rib);
  withNotch.delete();
  rib.delete();

  return { part: finalPart, piece };
}

/** The known-good compound path for `buildCompoundUndercutFixture`'s own piece: -3mm in X, then +25mm in Y. */
export const COMPOUND_UNDERCUT_KNOWN_GOOD_PATH = [
  { direction: [-1, 0, 0] as const, distanceMm: 3 },
  { direction: [0, 1, 0] as const, distanceMm: 25 },
];
