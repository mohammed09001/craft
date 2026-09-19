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
 * Construction is connected components of a FILTERED adjacency graph (an
 * edge survives only when its two patches' normals are within
 * `surfaceRegionMergeAngleDeg` of each other). Connected components are a
 * property of the graph's content, not of traversal order, so region
 * membership is inherently triangle-array-order invariant; the only
 * order-sensitive step is REGION LABELING (which component becomes region
 * 0, 1, 2...), which this module fixes by sorting components on a
 * content-derived key (their lexicographically smallest rounded centroid)
 * rather than encounter order.
 */

interface UnionFind {
  find(x: number): number;
  union(a: number, b: number): void;
}

function createUnionFind(size: number): UnionFind {
  const parent = new Int32Array(size);
  for (let index = 0; index < size; index += 1) parent[index] = index;
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    let cursor = x;
    while (parent[cursor] !== root) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  return {
    find,
    union(a: number, b: number): void {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent[rootA] = rootB;
    },
  };
}

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
  const unionFind = createUnionFind(patchCount);

  for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
    for (const neighbor of planningMesh.adjacency[patchIndex] ?? []) {
      if (neighbor <= patchIndex) continue;
      const angle = angleBetweenDeg(patches[patchIndex]!.normal, patches[neighbor]!.normal);
      if (angle <= mergeAngleDeg) unionFind.union(patchIndex, neighbor);
    }
  }

  const membersByRoot = new Map<number, number[]>();
  for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
    const root = unionFind.find(patchIndex);
    let members = membersByRoot.get(root);
    if (members === undefined) {
      members = [];
      membersByRoot.set(root, members);
    }
    members.push(patchIndex);
  }

  // Deterministic, content-derived region ordering (never encounter order,
  // which follows Map insertion order = triangle array order).
  const orderedGroups = [...membersByRoot.values()].sort((a, b) => canonicalGroupKey(a, patches).localeCompare(canonicalGroupKey(b, patches)));

  const regionOfPatch = new Array<number>(patchCount).fill(-1);
  orderedGroups.forEach((members, regionIndex) => {
    for (const patchIndex of members) regionOfPatch[patchIndex] = regionIndex;
  });

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
