import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import { buildMeshGeometry, countUniqueForwardIntersections } from "../../geometry/meshBvh";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MasterMoldDirection } from "../masterMold.contracts";
import { DIRECTION_VECTORS } from "../masterMoldDirection.analyzer";
import type { MasterCastTarget } from "./contracts";

/**
 * Execution 07 LOOP 06: lock evidence for localized removable cores.
 *
 * A core region must be derived from an actual lock, never from an arbitrary
 * span fraction. Two evidence families, strongest first:
 *
 *   1. release-collision evidence -- the exact Manifold overlap between the
 *      case and the translated target at the first colliding sweep distance
 *      (computed by the one-piece release attempt that just failed). This is
 *      exact geometry: it is where the release physically jams.
 *   2. inaccessible patch clusters -- deterministically sampled surface
 *      patches that face against the pull AND cannot see out along it
 *      (undercut patches by visibility). Sampled over the planning BVH, so
 *      cost is bounded by the sample cap regardless of mesh density; exact
 *      CSG runs only on the shortlisted cluster regions.
 *
 * Every candidate region is grown into a full pull column (extended along the
 * pull axis to the target's pull-side face): a lock face traps the material
 * between itself and the exit face, and only a full column gives the
 * remaining target a clear path. Exact verification still decides.
 */

export interface LockRegion {
  /** The exact lock footprint (collision overlap bounds or patch-cluster bounds), before column growth. */
  readonly seedBounds: Bounds3;
  /** The grown pull column handed to exact CSG (core = target ∩ bounds). */
  readonly bounds: Bounds3;
  readonly evidence: "release-collision" | "inaccessible-patch-cluster";
  /** Locked samples in this region (patch clusters only; absent for collision regions). */
  readonly lockedSampleCount?: number;
}

export interface LockEvidence {
  /** The release direction whose failure produced this evidence (a failed one-piece pull). */
  readonly pullDirection: MasterMoldDirection;
  readonly pullVector: readonly [number, number, number];
  readonly regions: readonly LockRegion[];
  readonly lockedSampleCount: number;
  readonly sampledTriangleCount: number;
}

/** Bounded lock-evidence derivation (planning geometry; exact CSG runs later on the shortlist only). */
export const LOCK_EVIDENCE_LIMITS = {
  /** Surface triangles sampled (deterministic stride) for patch clusters, mirroring the accessibility sample budget. */
  sampleCap: 256,
  /** Grid divisions along the target's largest span when clustering locked patches. */
  gridDivisions: 8,
  /** Regions retained after sorting/dedup -- the exact-CSG shortlist. */
  maxRegions: 4,
} as const;

/**
 * Grows a lock footprint into a pull column: extended along the pull axis to
 * the target's pull-side face, padded transversally by one sampling cell
 * (clamped to the target bounds) so the column fully clears the lock patch.
 */
function growPullColumn(seedBounds: Bounds3, targetBounds: Bounds3, pullVector: readonly [number, number, number], padMm: number): Bounds3 {
  const min = { x: seedBounds.min.x, y: seedBounds.min.y, z: seedBounds.min.z };
  const max = { x: seedBounds.max.x, y: seedBounds.max.y, z: seedBounds.max.z };
  const [dx, dy, dz] = pullVector;
  const components: readonly [number, number, number] = [Math.abs(dx), Math.abs(dy), Math.abs(dz)];
  let axisIndex = 0;
  for (let i = 1; i < 3; i += 1) if (components[i]! > components[axisIndex]!) axisIndex = i;
  const axisName = (["x", "y", "z"] as const)[axisIndex]!;
  if (pullVector[axisIndex]! > 0) max[axisName] = targetBounds.max[axisName];
  else min[axisName] = targetBounds.min[axisName];
  for (const candidate of ["x", "y", "z"] as const) {
    if (candidate === axisName) continue;
    min[candidate] = Math.max(targetBounds.min[candidate], min[candidate] - padMm);
    max[candidate] = Math.min(targetBounds.max[candidate], max[candidate] + padMm);
  }
  return { min, max };
}

function containsSeed(outer: Bounds3, inner: Bounds3): boolean {
  return (
    outer.min.x <= inner.min.x + 1e-6 && outer.min.y <= inner.min.y + 1e-6 && outer.min.z <= inner.min.z + 1e-6 &&
    outer.max.x >= inner.max.x - 1e-6 && outer.max.y >= inner.max.y - 1e-6 && outer.max.z >= inner.max.z - 1e-6
  );
}

/**
 * Derives localized-core candidate regions from lock evidence: the exact
 * release-collision region (when the failed sweep reported one) plus bounded
 * sampled inaccessible patch clusters, each grown into a pull column.
 */
export function deriveLockRegions(
  castTarget: MasterCastTarget,
  pullDirection: MasterMoldDirection,
  collisionBounds: Bounds3 | null,
): LockEvidence {
  const pullVector = DIRECTION_VECTORS[pullDirection];
  const targetBounds = castTarget.bounds;
  const span = {
    x: targetBounds.max.x - targetBounds.min.x,
    y: targetBounds.max.y - targetBounds.min.y,
    z: targetBounds.max.z - targetBounds.min.z,
  };
  const maxSpan = Math.max(span.x, span.y, span.z);
  const cellMm = maxSpan / LOCK_EVIDENCE_LIMITS.gridDivisions;
  const regions: LockRegion[] = [];

  if (collisionBounds !== null) {
    regions.push({
      seedBounds: collisionBounds,
      bounds: growPullColumn(collisionBounds, targetBounds, pullVector, cellMm),
      evidence: "release-collision",
    });
  }

  // Sampled undercut patches: facing against the pull AND blocked along it.
  const geometry = buildMeshGeometry(castTarget.mesh);
  let lockedSampleCount = 0;
  let sampledTriangleCount = 0;
  try {
    const bvh = new MeshBVH(geometry);
    const indices = castTarget.mesh.indices;
    const positions = castTarget.mesh.positions;
    const triangleCount = indices.length / 3;
    const stride = Math.max(1, Math.floor(triangleCount / LOCK_EVIDENCE_LIMITS.sampleCap));
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const ab = new Vector3();
    const ac = new Vector3();
    const normal = new Vector3();
    const centroid = new Vector3();
    const ray = new Vector3(pullVector[0], pullVector[1], pullVector[2]);

    const lockedPoints: { x: number; y: number; z: number }[] = [];
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
      if (area2 <= 0) continue;
      normal.divideScalar(area2);
      // Undercut w.r.t. the pull: the patch faces against it. Patches facing
      // along or parallel to the pull slide free (their sweep is parallel).
      if (normal.x * pullVector[0] + normal.y * pullVector[1] + normal.z * pullVector[2] >= -1e-3) continue;
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      const probe = centroid.clone().addScaledVector(normal, 1e-3);
      sampledTriangleCount += 1;
      if (countUniqueForwardIntersections(bvh, probe, ray) > 0) {
        lockedSampleCount += 1;
        lockedPoints.push({ x: centroid.x, y: centroid.y, z: centroid.z });
      }
    }

    // Grid-cluster the locked points into 6-connected components.
    const cellOf = (point: { readonly x: number; readonly y: number; readonly z: number }): readonly [number, number, number] => [
      Math.min(LOCK_EVIDENCE_LIMITS.gridDivisions - 1, Math.floor((point.x - targetBounds.min.x) / cellMm)),
      Math.min(LOCK_EVIDENCE_LIMITS.gridDivisions - 1, Math.floor((point.y - targetBounds.min.y) / cellMm)),
      Math.min(LOCK_EVIDENCE_LIMITS.gridDivisions - 1, Math.floor((point.z - targetBounds.min.z) / cellMm)),
    ];
    const cells = new Map<string, { count: number; points: { x: number; y: number; z: number }[] }>();
    for (const point of lockedPoints) {
      const [ix, iy, iz] = cellOf(point);
      const key = `${ix},${iy},${iz}`;
      const cell = cells.get(key) ?? { count: 0, points: [] };
      cell.count += 1;
      cell.points.push(point);
      cells.set(key, cell);
    }
    const visited = new Set<string>();
    const neighborsOf = ([ix, iy, iz]: readonly [number, number, number]): readonly (readonly [number, number, number])[] => [
      [ix - 1, iy, iz], [ix + 1, iy, iz],
      [ix, iy - 1, iz], [ix, iy + 1, iz],
      [ix, iy, iz - 1], [ix, iy, iz + 1],
    ];
    type ClusterCell = { count: number; points: { x: number; y: number; z: number }[] };
    for (const [key, startCell] of cells) {
      if (visited.has(key)) continue;
      // Flood-fill one connected component, accumulating its point bounds.
      const componentCells: { key: string; cell: ClusterCell }[] = [];
      const stack: { key: string; cell: ClusterCell }[] = [{ key, cell: startCell }];
      visited.add(key);
      while (stack.length > 0) {
        const entry = stack.pop()!;
        componentCells.push(entry);
        const [ix, iy, iz] = entry.key.split(",").map(Number) as [number, number, number];
        for (const neighbor of neighborsOf([ix, iy, iz])) {
          const neighborKey = `${neighbor[0]},${neighbor[1]},${neighbor[2]}`;
          const neighborCell = cells.get(neighborKey);
          if (neighborCell === undefined || visited.has(neighborKey)) continue;
          visited.add(neighborKey);
          stack.push({ key: neighborKey, cell: neighborCell });
        }
      }
      let min = { x: Infinity, y: Infinity, z: Infinity };
      let max = { x: -Infinity, y: -Infinity, z: -Infinity };
      let count = 0;
      for (const { cell } of componentCells) {
        count += cell.count;
        for (const point of cell.points) {
          min = { x: Math.min(min.x, point.x), y: Math.min(min.y, point.y), z: Math.min(min.z, point.z) };
          max = { x: Math.max(max.x, point.x), y: Math.max(max.y, point.y), z: Math.max(max.z, point.z) };
        }
      }
      if (count === 0) continue;
      const seedBounds: Bounds3 = { min, max };
      const bounds = growPullColumn(seedBounds, targetBounds, pullVector, cellMm);
      if (regions.some((region) => containsSeed(region.bounds, seedBounds))) continue;
      regions.push({ seedBounds, bounds, evidence: "inaccessible-patch-cluster", lockedSampleCount: count });
    }
  } finally {
    geometry.dispose();
  }

  // Exact evidence first, then denser clusters; cap the exact-CSG shortlist.
  const evidenceRank = (region: LockRegion): number =>
    region.evidence === "release-collision" ? Number.MAX_SAFE_INTEGER : region.lockedSampleCount ?? 0;
  regions.sort((left, right) => evidenceRank(right) - evidenceRank(left));

  return {
    pullDirection,
    pullVector,
    regions: regions.slice(0, LOCK_EVIDENCE_LIMITS.maxRegions),
    lockedSampleCount,
    sampledTriangleCount,
  };
}
