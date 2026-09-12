import { DIRECTION_VECTORS } from "./masterMoldDirection.analyzer";
import type { MasterMoldDirection } from "./masterMold.contracts";

export interface DemoldVerificationResult {
  /** True iff no sampled translation step along `direction` produced a tool/target overlap volume beyond tolerance. */
  readonly removable: boolean;
  /** Refined distance (mm) into the pull at which a collision was first confirmed, or null when removable. */
  readonly firstCollisionDistanceMm: number | null;
}

/**
 * Article 02 Strategy A: coarse sample count for the initial sweep. Fixed
 * rather than scaled by tolerance/clearance so cost stays bounded regardless
 * of part size -- this is a deliberate, documented resolution limit, not an
 * attempt at exhaustive proof for arbitrarily thin traps.
 */
const COARSE_SAMPLE_COUNT = 32;

/** Binary-search steps refining the first-collision estimate once a coarse collision is found -- tightens the reported distance, does not change the accept/reject outcome. */
const REFINEMENT_ITERATIONS = 12;

/** Structural shape of the Manifold solids this verifier operates on -- avoids coupling to manifold-3d's own generated types, which are not exported from a stable path. */
interface DemoldSolid {
  translate(x: number, y: number, z: number): DemoldSolid;
  intersect(other: DemoldSolid): DemoldSolid;
  volume(): number;
  delete(): void;
}

/**
 * Article 02/03: the actual physical question -- as `targetSolid` translates
 * rigidly out of `toolSolid` along `direction`, does it ever overlap tool
 * material by more than a negligible (tolerance-scale) volume? Reuses the
 * same Manifold CSG kernel the rest of the pipeline already relies on for an
 * exact solid/solid intersection at each sampled offset, rather than a
 * sampled point/ray heuristic -- a shape with a straight (non-tapered) run
 * along the pull axis (a plain box, for example) keeps its side surface in
 * flush, zero-clearance sliding contact with the cavity wall for the entire
 * pull; an exact CSG intersection of two solids that only share a boundary
 * surface is genuinely zero volume, so that expected sliding contact is
 * correctly never flagged as a collision (a raw triangle/triangle
 * intersection or ray-parity point sample cannot make this distinction
 * reliably, especially for thin features).
 */
export function verifyDemoldTranslation<S extends DemoldSolid>(
  toolSolid: S,
  targetSolid: S,
  direction: MasterMoldDirection,
  clearanceDistanceMm: number,
  toleranceMm: number,
  volumeToleranceMm3: number,
): DemoldVerificationResult {
  const [dx, dy, dz] = DIRECTION_VECTORS[direction];

  const overlapVolumeAt = (distanceMm: number): number => {
    const translated = targetSolid.translate(dx * distanceMm, dy * distanceMm, dz * distanceMm);
    try {
      const overlap = toolSolid.intersect(translated);
      try {
        return overlap.volume();
      } finally {
        overlap.delete();
      }
    } finally {
      translated.delete();
    }
  };

  const collidesAt = (distanceMm: number): boolean => overlapVolumeAt(distanceMm) > volumeToleranceMm3;

  const startDistanceMm = Math.max(toleranceMm * 2, 1e-6);
  const safeClearanceMm = Math.max(clearanceDistanceMm, startDistanceMm);
  const stepMm = Math.max((safeClearanceMm - startDistanceMm) / COARSE_SAMPLE_COUNT, toleranceMm);

  let previousClearDistanceMm = startDistanceMm;
  let firstCollisionDistanceMm: number | null = null;

  for (let distanceMm = startDistanceMm; distanceMm <= safeClearanceMm; distanceMm += stepMm) {
    if (collidesAt(distanceMm)) {
      firstCollisionDistanceMm = distanceMm;
      break;
    }
    previousClearDistanceMm = distanceMm;
  }

  if (firstCollisionDistanceMm === null) {
    return { removable: true, firstCollisionDistanceMm: null };
  }

  let lo = previousClearDistanceMm;
  let hi = firstCollisionDistanceMm;
  for (let i = 0; i < REFINEMENT_ITERATIONS; i += 1) {
    const mid = (lo + hi) / 2;
    if (collidesAt(mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return { removable: false, firstCollisionDistanceMm: hi };
}
