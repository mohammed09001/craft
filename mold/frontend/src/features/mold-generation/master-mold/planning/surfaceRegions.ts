import type { AccessibilityAnalysis, PlanningMesh, PlanningPatch, PlanningVector3, SurfaceRegion, SurfaceRegionGraph } from "./masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { angleBetweenDeg } from "./candidateDirections";

/**
 * Execution 08 LOOP 05: a true surface region graph.
 *
 * Undercut grouping and (in later loops) direction discovery, coverage, and
 * subdivision all need coherent mold-planning REGIONS, not sparse triangle
 * incidence: a connected patch of surface that shares a stable normal
 * neighborhood, with real curvature/planarity evidence and sharp-boundary
 * provenance. This is direction-INDEPENDENT (pure geometry/topology) -- it
 * runs once, before any candidate direction or accessibility pass, and every
 * later stage (Articles 04/05 onward) consumes its output.
 *
 * Construction is SEED-ANCHORED, cone-capped region growing, not plain
 * connected components of a locally-filtered graph. An earlier version used
 * plain connected components (an edge survives only when its two patches'
 * normals are within `surfaceRegionMergeAngleDeg` of each other): on a
 * smoothly curved CLOSED body (a sphere, an organic blob) that lets normal
 * drift accumulate transitively all the way around the surface -- every
 * single hop stays under the threshold, but the whole closed surface still
 * collapses into one region with a normal cone approaching 180 degrees,
 * which is not a "coherent" region by any useful definition and makes the
 * average normal/cone-extremum direction sources meaningless. Seed-anchored
 * growth fixes this: each region's membership test is the angle to its own
 * FIXED seed normal (not to whichever neighbor discovered it), so a
 * region's cone half-angle is bounded by `surfaceRegionMergeAngleDeg` by
 * construction, regardless of how the underlying surface curves.
 *
 * This still depends on which patch seeds each region, and seed order is
 * therefore fixed to a purely CONTENT-derived canonical order (patches
 * sorted by rounded centroid) rather than array/index order, and BFS
 * expansion within a region visits neighbors in that same canonical order
 * -- so region membership is triangle-array-order invariant even though
 * growth order now matters (unlike a pure connected-components construction
 * where order genuinely does not matter at all).
 */

function centroidKey(centroid: PlanningVector3): string {
  return `${centroid.x.toFixed(6)}:${centroid.y.toFixed(6)}:${centroid.z.toFixed(6)}`;
}

/** Canonical, content-derived, order-independent key for a group of patches: its lexicographically smallest rounded member centroid. */
function canonicalGroupKey(memberPatchIndexes: readonly number[], patches: readonly PlanningPatch[]): string {
  let best: string | null = null;
  for (const patchIndex of memberPatchIndexes) {
    const key = centroidKey(patches[patchIndex]!.centroid);
    if (best === null || key < best) best = key;
  }
  return best ?? "";
}

/**
 * Builds the surface region graph over a PlanningMesh's patches. Note on
 * `sourceTriangleIds`: below the full-resolution triangle budget (LOOP 04),
 * each patch is exactly one source triangle, so this is a complete,
 * gap-free triangle covering. At/above that budget (the bounded clustering
 * path), each patch carries only its cluster's representative triangle, so
 * `sourceTriangleIds` is a representative sample for those large meshes,
 * not a complete enumeration -- documented here rather than silently
 * overstated.
 */
export function buildSurfaceRegionGraph(planningMesh: PlanningMesh): SurfaceRegionGraph {
  const patches = planningMesh.patches;
  const patchCount = patches.length;
  if (patchCount === 0) return { regions: [], regionOfPatch: [] };

  const mergeAngleDeg = MASTER_PLANNER_LIMITS.surfaceRegionMergeAngleDeg;
  const ridgeAngleDeg = MASTER_PLANNER_LIMITS.surfaceRegionRidgeAngleDeg;

  // Canonical, content-derived processing order: never raw patch/array
  // index (which follows triangle array order for the full-resolution
  // path -- LOOP 04).
  const canonicalOrder = patches
    .map((patch) => patch.patchIndex)
    .sort((a, b) => centroidKey(patches[a]!.centroid).localeCompare(centroidKey(patches[b]!.centroid)));
  const neighborsOf = (patchIndex: number): readonly number[] =>
    [...(planningMesh.adjacency[patchIndex] ?? [])].sort((a, b) => centroidKey(patches[a]!.centroid).localeCompare(centroidKey(patches[b]!.centroid)));

  const regionOfPatch = new Array<number>(patchCount).fill(-1);
  const orderedGroups: number[][] = [];
  for (const seedPatchIndex of canonicalOrder) {
    if (regionOfPatch[seedPatchIndex] !== -1) continue;
    const seedNormal = patches[seedPatchIndex]!.normal;
    const regionIndex = orderedGroups.length;
    const members: number[] = [];
    const queue: number[] = [seedPatchIndex];
    regionOfPatch[seedPatchIndex] = regionIndex;
    let head = 0;
    while (head < queue.length) {
      const current = queue[head]!;
      head += 1;
      members.push(current);
      for (const neighbor of neighborsOf(current)) {
        if (regionOfPatch[neighbor] !== -1) continue;
        // Bounded to the SEED's normal (not the discovering neighbor's):
        // this is what caps the region's cone half-angle by construction.
        if (angleBetweenDeg(patches[neighbor]!.normal, seedNormal) > mergeAngleDeg) continue;
        regionOfPatch[neighbor] = regionIndex;
        queue.push(neighbor);
      }
    }
    orderedGroups.push(members);
  }

  // Boundary/adjacency evidence: any adjacency edge crossing a region boundary.
  const adjacentRegionSets: Set<number>[] = orderedGroups.map(() => new Set());
  const boundaryPatchSets: Set<number>[] = orderedGroups.map(() => new Set());
  const sharpBoundary: boolean[] = orderedGroups.map(() => false);
  for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
    const ownRegion = regionOfPatch[patchIndex]!;
    for (const neighbor of planningMesh.adjacency[patchIndex] ?? []) {
      const neighborRegion = regionOfPatch[neighbor]!;
      if (neighborRegion === ownRegion) continue;
      adjacentRegionSets[ownRegion]!.add(neighborRegion);
      boundaryPatchSets[ownRegion]!.add(patchIndex);
      const angle = angleBetweenDeg(patches[patchIndex]!.normal, patches[neighbor]!.normal);
      if (angle >= ridgeAngleDeg) sharpBoundary[ownRegion] = true;
    }
  }

  const regions: SurfaceRegion[] = orderedGroups.map((members, regionIndex) => {
    let areaMm2 = 0;
    let centroidX = 0, centroidY = 0, centroidZ = 0;
    let normalX = 0, normalY = 0, normalZ = 0;
    for (const patchIndex of members) {
      const patch = patches[patchIndex]!;
      areaMm2 += patch.areaMm2;
      centroidX += patch.centroid.x * patch.areaMm2;
      centroidY += patch.centroid.y * patch.areaMm2;
      centroidZ += patch.centroid.z * patch.areaMm2;
      normalX += patch.normal.x * patch.areaMm2;
      normalY += patch.normal.y * patch.areaMm2;
      normalZ += patch.normal.z * patch.areaMm2;
    }
    const areaSafe = Math.max(areaMm2, 1e-12);
    const centroid: PlanningVector3 = { x: centroidX / areaSafe, y: centroidY / areaSafe, z: centroidZ / areaSafe };
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
    const averageNormal: PlanningVector3 = { x: normalX / normalLength, y: normalY / normalLength, z: normalZ / normalLength };

    let normalConeHalfAngleDeg = 0;
    for (const patchIndex of members) {
      const angle = angleBetweenDeg(patches[patchIndex]!.normal, averageNormal);
      if (angle > normalConeHalfAngleDeg) normalConeHalfAngleDeg = angle;
    }

    const sortedMembers = [...members].sort((a, b) => a - b);
    const sourceTriangleIds = sortedMembers.map((patchIndex) => patches[patchIndex]!.sourceTriangle).sort((a, b) => a - b);

    return {
      regionId: `region:${canonicalGroupKey(members, patches)}`,
      regionIndex,
      sourceTriangleIds,
      patchIndexes: sortedMembers,
      areaMm2,
      centroid,
      averageNormal,
      normalConeHalfAngleDeg,
      boundaryPatchIndexes: [...boundaryPatchSets[regionIndex]!].sort((a, b) => a - b),
      adjacentRegionIndexes: [...adjacentRegionSets[regionIndex]!].sort((a, b) => a - b),
      hasSharpBoundary: sharpBoundary[regionIndex]!,
    };
  });

  return { regions, regionOfPatch };
}

/**
 * Per-region accessibility summary against a set of directions: what
 * fraction of the region's own area is visible along each direction, and
 * the best (maximum) coverage any single kept direction achieves.
 *
 * This is the region-level replacement for reasoning about "unresolved
 * patches" one sparse patch at a time (Article 05/20): a region is the unit
 * that later loops (LOOP 08 adaptive direction discovery, LOOP 11 region
 * cover) reason about, not scattered patch indexes.
 */
export interface SurfaceRegionAccessibilitySummary {
  readonly regionIndex: number;
  /** directionId -> fraction of this region's area visible along that direction (0..1). */
  readonly visibleAreaFractionByDirectionId: ReadonlyMap<string, number>;
  readonly bestDirectionId: string | null;
  readonly bestVisibleAreaFraction: number;
}

export function summarizeRegionAccessibility(
  regionGraph: SurfaceRegionGraph,
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
): readonly SurfaceRegionAccessibilitySummary[] {
  return regionGraph.regions.map((region) => {
    const visibleAreaFractionByDirectionId = new Map<string, number>();
    let bestDirectionId: string | null = null;
    let bestVisibleAreaFraction = -1;
    for (let directionIndex = 0; directionIndex < analysis.directions.length; directionIndex += 1) {
      const direction = analysis.directions[directionIndex]!;
      const visible = analysis.perDirection[directionIndex]!.visible;
      let visibleArea = 0;
      for (const patchIndex of region.patchIndexes) {
        if (visible[patchIndex] === 1) visibleArea += planningMesh.patches[patchIndex]!.areaMm2;
      }
      const fraction = region.areaMm2 > 0 ? visibleArea / region.areaMm2 : 0;
      visibleAreaFractionByDirectionId.set(direction.directionId, fraction);
      if (fraction > bestVisibleAreaFraction) {
        bestVisibleAreaFraction = fraction;
        bestDirectionId = direction.directionId;
      }
    }
    return {
      regionIndex: region.regionIndex,
      visibleAreaFractionByDirectionId,
      bestDirectionId,
      bestVisibleAreaFraction: Math.max(0, bestVisibleAreaFraction),
    };
  });
}

/**
 * Regions no single kept candidate direction can fully release (Article 05
 * undercut grouping, promoted from sparse per-patch incidence to whole
 * regions): the direct input LOOP 08's adaptive direction discovery acts
 * on, and a truthful machine-readable answer to "which coherent surface
 * areas does this candidate set fail to cover?"
 */
export function unresolvedSurfaceRegions(
  summaries: readonly SurfaceRegionAccessibilitySummary[],
  regionGraph: SurfaceRegionGraph,
  fullCoverageFraction = 0.999,
): readonly SurfaceRegion[] {
  const unresolved: SurfaceRegion[] = [];
  for (const summary of summaries) {
    if (summary.bestVisibleAreaFraction < fullCoverageFraction) unresolved.push(regionGraph.regions[summary.regionIndex]!);
  }
  return unresolved;
}
