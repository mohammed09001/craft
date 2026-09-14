import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import { MASTER_MOLD_DIRECTIONS, type MasterMoldDirection } from "../masterMold.contracts";
import { DIRECTION_VECTORS } from "../masterMoldDirection.analyzer";
import { buildMeshGeometry, countUniqueForwardIntersections } from "../../geometry/meshBvh";
import type { MasterCastTarget, MasterReleaseDirection, MasterSurfaceAccessibility } from "./contracts";

/**
 * Execution 05 Article 08: Release Analysis.
 *
 * Stage A — surface accessibility: Chen–Chou–Woo-style visibility reasoning
 * over deterministically sampled surface regions, with grouped undercut
 * severity (Nee-style: re-entrant triangles are grouped into one release
 * constraint, not treated as independent failures).
 *
 * Stage B — exact verification lives in the piece-level release steps: every
 * candidate removal is collision-verified with neutral Manifold sweeps
 * (verifyDemoldTranslation). Visibility only plans; collision decides.
 */

/** Bounded deterministic surface sample budget (triangles) for accessibility analysis. */
export const ACCESSIBILITY_SAMPLE_LIMIT = 256;
/** Samples below this many visible counts are treated as inaccessible (zero-visibility guards). */
export const MINIMUM_VISIBLE_SAMPLES = 3;

/**
 * Computes, for each candidate direction, the fraction of the cast target's
 * sampled boundary surface that can see out along that direction (sample ray
 * exits without crossing the target again), plus the grouped re-entrant
 * (undercut) surface area the direction cannot release.
 */
export function analyzeSurfaceAccessibility(
  castTarget: MasterCastTarget,
  candidateDirections: readonly MasterMoldDirection[] = MASTER_MOLD_DIRECTIONS,
): MasterSurfaceAccessibility {
  const directions: MasterReleaseDirection[] = [];
  let geometry: ReturnType<typeof buildMeshGeometry> | null = null;
  let totalSampledAreaMm2 = 0;
  const visibleCounts = new Map<MasterMoldDirection, number>();

  try {
    geometry = buildMeshGeometry(castTarget.mesh);
    const bvh = new MeshBVH(geometry);
    const indices = castTarget.mesh.indices;
    const positions = castTarget.mesh.positions;
    const triangleCount = indices.length / 3;
    const stride = Math.max(1, Math.floor(triangleCount / ACCESSIBILITY_SAMPLE_LIMIT));
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const ab = new Vector3();
    const ac = new Vector3();
    const normal = new Vector3();
    const centroid = new Vector3();

    for (const direction of candidateDirections) visibleCounts.set(direction, 0);

    let sampled = 0;
    for (let triangle = 0; triangle < triangleCount; triangle += stride) {
      const i0 = indices[triangle * 3]! * 3;
      const i1 = indices[triangle * 3 + 1]! * 3;
      const i2 = indices[triangle * 3 + 2]! * 3;
      a.set(positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!);
      b.set(positions[i1]!, positions[i1 + 1]!, positions[i1 + 2]!);
      c.set(positions[i2]!, positions[i2 + 1]!, positions[i2 + 2]!);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);
      const area2 = normal.length();
      normal.normalize();
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      // Backface offset along the outward normal: sample the surface region
      // just outside the solid.
      const probe = centroid.clone().addScaledVector(normal, 1e-3);
      totalSampledAreaMm2 += area2 / 2;
      sampled += 1;
      for (const direction of candidateDirections) {
        const [dx, dy, dz] = DIRECTION_VECTORS[direction];
        const crossings = countUniqueForwardIntersections(bvh, probe, new Vector3(dx, dy, dz));
        if (crossings === 0) visibleCounts.set(direction, visibleCounts.get(direction)! + 1);
      }
    }

    const denominator = Math.max(1, sampled);
    for (const direction of candidateDirections) {
      const visible = visibleCounts.get(direction) ?? 0;
      const accessibilityFraction = visible / denominator;
      directions.push({
        direction,
        accessibilityFraction,
        undercutAreaMm2: (1 - accessibilityFraction) * totalSampledAreaMm2,
      });
    }
  } finally {
    geometry?.dispose();
  }

  const best = directions.reduce<number>((bestFraction, entry) => Math.max(bestFraction, entry.accessibilityFraction), 0);
  return {
    directions,
    // One-piece release is plausible only when some direction can see (and
    // thus slide out) essentially the whole surface. Exact proof still comes
    // from the collision sweep.
    onePieceReleaseFeasible: best >= 1 - 1 / MINIMUM_VISIBLE_SAMPLES,
  };
}
