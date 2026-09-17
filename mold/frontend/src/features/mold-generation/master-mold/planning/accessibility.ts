import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import { buildMeshGeometry, countUniqueForwardIntersections } from "../../geometry/meshBvh";
import type {
  AccessibilityAnalysis,
  DirectionAccessibility,
  PlanningCandidateDirection,
  PlanningMesh,
  UndercutRegion,
} from "./masterMoldPlanning.contracts";

/**
 * Execution 06 Article 05: global accessibility is the authority for mold
 * decomposition.
 *
 * For every candidate direction, each sampled patch is classified by BVH ray
 * occlusion against the FULL-resolution mesh (never the normal sign alone,
 * never a Manifold Boolean). Adjacent invisible patches are grouped into
 * coherent undercut regions with area and severity. The output answers:
 * "which connected surface regions can be formed by a single mold piece
 * moving along direction d?"
 *
 * No Manifold Boolean is allowed in this stage.
 */

const SURFACE_PROBE_OFFSET_MM = 1e-3;

/** Connected-component grouping of invisible patches via planning adjacency (breadth-first, deterministic order). */
function undercutRegionsFor(invisible: ReadonlySet<number>, planningMesh: PlanningMesh): UndercutRegion[] {
  const visited = new Set<number>();
  const regions: UndercutRegion[] = [];
  for (const start of invisible) {
    if (visited.has(start)) continue;
    const queue = [start];
    const members: number[] = [];
    visited.add(start);
    while (queue.length > 0) {
      const patchIndex = queue.shift()!;
      members.push(patchIndex);
      for (const neighbor of planningMesh.adjacency[patchIndex] ?? []) {
        if (invisible.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    regions.push({
      regionIndex: regions.length,
      patchIndexes: members,
      areaMm2: members.reduce((sum, patchIndex) => sum + planningMesh.patches[patchIndex]!.areaMm2, 0),
    });
  }
  return regions;
}

export function analyzeDirectionAccessibility(
  fullMesh: { readonly positions: readonly number[]; readonly indices: readonly number[] },
  planningMesh: PlanningMesh,
  directions: readonly PlanningCandidateDirection[],
): AccessibilityAnalysis {
  const patchCount = planningMesh.patches.length;
  const visiblePerDirection: Uint8Array[] = directions.map(() => new Uint8Array(patchCount));

  let geometry: ReturnType<typeof buildMeshGeometry> | null = null;
  try {
    geometry = buildMeshGeometry({ positions: [...fullMesh.positions], indices: [...fullMesh.indices] });
    const bvh = new MeshBVH(geometry);
    const directionVectors = directions.map((direction) => new Vector3(direction.vector.x, direction.vector.y, direction.vector.z));

    for (const patch of planningMesh.patches) {
      // Probe just outside the solid along the outward normal so grazing
      // surfaces are classified by occlusion, not by offsetting luck.
      const probe = new Vector3(
        patch.centroid.x + patch.normal.x * SURFACE_PROBE_OFFSET_MM,
        patch.centroid.y + patch.normal.y * SURFACE_PROBE_OFFSET_MM,
        patch.centroid.z + patch.normal.z * SURFACE_PROBE_OFFSET_MM,
      );
      for (let d = 0; d < directionVectors.length; d += 1) {
        const crossings = countUniqueForwardIntersections(bvh, probe, directionVectors[d]!);
        if (crossings === 0) visiblePerDirection[d]![patch.patchIndex] = 1;
      }
    }
  } finally {
    geometry?.dispose();
  }

  const perDirection: DirectionAccessibility[] = directions.map((direction, d) => {
    const visible = visiblePerDirection[d]!;
    let accessibleAreaMm2 = 0;
    let inaccessibleAreaMm2 = 0;
    const invisible = new Set<number>();
    for (const patch of planningMesh.patches) {
      if (visible[patch.patchIndex] === 1) accessibleAreaMm2 += patch.areaMm2;
      else {
        inaccessibleAreaMm2 += patch.areaMm2;
        invisible.add(patch.patchIndex);
      }
    }
    const regions = undercutRegionsFor(invisible, planningMesh);
    return {
      directionId: direction.directionId,
      visible: Array.from(visible),
      accessibleAreaMm2,
      inaccessibleAreaMm2,
      undercutRegionCount: regions.length,
      largestUndercutAreaMm2: regions.reduce((largest, region) => Math.max(largest, region.areaMm2), 0),
    };
  });

  const dominantPatchOrder = [...planningMesh.patches]
    .sort((a, b) => b.areaMm2 - a.areaMm2 || a.patchIndex - b.patchIndex)
    .map((patch) => patch.patchIndex);

  return { directions, perDirection, dominantPatchOrder };
}

/**
 * Preliminary direction score (Article 04): cheap ranking from the
 * accessibility statistics alone, used to prune dominated directions before
 * decomposition search. Lower is better.
 */
export function directionPreliminaryScore(accessibility: DirectionAccessibility, planningMesh: PlanningMesh): number {
  const totalArea = Math.max(planningMesh.totalAreaMm2, 1e-9);
  const inaccessibleFraction = accessibility.inaccessibleAreaMm2 / totalArea;
  return (
    inaccessibleFraction * 10 +
    accessibility.undercutRegionCount * 0.1 +
    (accessibility.largestUndercutAreaMm2 / totalArea) * 5
  );
}

/**
 * Prunes dominated directions: keeps at most `keep` directions ranked by the
 * preliminary score, always retaining the world axes (baseline candidates).
 */
export function pruneDirections(
  directions: readonly PlanningCandidateDirection[],
  analysis: AccessibilityAnalysis,
  planningMesh: PlanningMesh,
  keep: number,
): { directions: PlanningCandidateDirection[]; analysis: AccessibilityAnalysis } {
  const scored = directions.map((direction, index) => ({
    direction,
    index,
    score: directionPreliminaryScore(analysis.perDirection[index]!, planningMesh),
  }));
  const worldAxes = scored.filter((entry) => entry.direction.source === "world-axis");
  const others = scored
    .filter((entry) => entry.direction.source !== "world-axis")
    .sort((a, b) => a.score - b.score || a.direction.directionId.localeCompare(b.direction.directionId));
  const kept = [...worldAxes, ...others].slice(0, Math.max(keep, worldAxes.length));
  // Rank the kept directions best-first so the bounded combination budget
  // (top-N used by multi-piece search) contains the strongest candidates,
  // geometry-derived directions included.
  const ranked = [...kept].sort((a, b) => a.score - b.score || a.direction.directionId.localeCompare(b.direction.directionId));
  return {
    directions: ranked.map((entry) => entry.direction),
    analysis: {
      ...analysis,
      directions: ranked.map((entry) => entry.direction),
      perDirection: ranked.map((entry) => analysis.perDirection[entry.index]!),
    },
  };
}
