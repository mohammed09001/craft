import type { AccessibilityAnalysis, PlanningMesh, PlanningVector3, SurfaceRegion, SurfaceRegionGraph } from "./masterMoldPlanning.contracts";
import { angleBetweenDeg } from "./candidateDirections";
import { summarizeRegionAccessibility } from "./surfaceRegions";

/**
 * Execution 08 LOOP 12: subdivide partially moldable regions.
 *
 * A LOOP 05 region is built from pure surface geometry (normal continuity),
 * independent of any candidate direction -- so a single region can
 * legitimately straddle a visibility transition: part of it fully visible
 * along some direction, part not. Rejecting the WHOLE region because one
 * part is blocked (the pre-LOOP-15 "one-bad-patch" mistake, now generalized
 * to regions) throws away real, usable moldable surface. This splits such
 * a region along its own visibility boundary into a resolvable child and a
 * remaining child, bounded by a minimum child area/patch count and a
 * maximum refinement depth so fragmentation cannot run away.
 */

const DEFAULT_MAX_REFINEMENT_DEPTH = 2;
const DEFAULT_MIN_REGION_AREA_FRACTION = 0.02;
const DEFAULT_MIN_REGION_PATCH_COUNT = 3;

export interface RegionSubdivisionOptions {
  readonly maxRefinementDepth?: number;
  /** A child region below this fraction of the ORIGINAL region's area is not worth splitting out (fragmentation control). */
  readonly minRegionAreaFraction?: number;
  readonly minRegionPatchCount?: number;
}

export interface RegionSubdivisionResult {
  readonly regionGraph: SurfaceRegionGraph;
  /** How many original regions were split at least once. */
  readonly subdividedRegionCount: number;
}

interface MutableGroup {
  patches: number[];
}

function connectedComponents(patchIndexes: readonly number[], planningMesh: PlanningMesh): number[][] {
  const members = new Set(patchIndexes);
  const visited = new Set<number>();
  const components: number[][] = [];
  for (const start of patchIndexes) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    const component: number[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of planningMesh.adjacency[current] ?? []) {
        if (members.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function areaOf(patchIndexes: readonly number[], planningMesh: PlanningMesh): number {
  return patchIndexes.reduce((sum, patchIndex) => sum + planningMesh.patches[patchIndex]!.areaMm2, 0);
}

/**
 * One subdivision pass: for every UNRESOLVED region with SOME (not zero)
 * coverage from its best direction, split it into the patches that
 * direction sees versus the rest, provided both sides -- broken into their
 * own connected components -- clear the minimum size. Regions already
 * fully resolved, or with no partial coverage at all (subdivision cannot
 * help a region no direction sees any part of), are left untouched.
 */
function subdivideOnce(
  groups: readonly MutableGroup[],
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  totalAreaMm2: number,
  minRegionPatchCount: number,
  minRegionAreaFraction: number,
): { groups: MutableGroup[]; splitCount: number } {
  // Build a temporary region graph view purely to reuse summarizeRegionAccessibility's math.
  const regionOfPatch = new Array<number>(planningMesh.patches.length).fill(-1);
  groups.forEach((group, index) => {
    for (const patchIndex of group.patches) regionOfPatch[patchIndex] = index;
  });
  const pseudoRegions: SurfaceRegion[] = groups.map((group, index) => ({
    regionId: `pseudo:${index}`,
    regionIndex: index,
    sourceTriangleIds: [],
    patchIndexes: group.patches,
    areaMm2: areaOf(group.patches, planningMesh),
    centroid: { x: 0, y: 0, z: 0 },
    averageNormal: { x: 0, y: 0, z: 1 },
    normalConeHalfAngleDeg: 0,
    boundaryPatchIndexes: [],
    adjacentRegionIndexes: [],
    hasSharpBoundary: false,
  }));
  const summaries = summarizeRegionAccessibility({ regions: pseudoRegions, regionOfPatch }, planningMesh, analysis);

  const minAreaMm2 = totalAreaMm2 * minRegionAreaFraction;
  const nextGroups: MutableGroup[] = [];
  let splitCount = 0;

  groups.forEach((group, index) => {
    const summary = summaries[index]!;
    if (summary.bestVisibleAreaFraction >= 0.999 || summary.bestVisibleAreaFraction <= 0 || summary.bestDirectionId === null) {
      nextGroups.push(group);
      return;
    }
    const directionIndex = analysis.directions.findIndex((direction) => direction.directionId === summary.bestDirectionId);
    if (directionIndex === -1) {
      nextGroups.push(group);
      return;
    }
    const visible = analysis.perDirection[directionIndex]!.visible;
    const visiblePatches = group.patches.filter((patchIndex) => visible[patchIndex] === 1);
    const invisiblePatches = group.patches.filter((patchIndex) => visible[patchIndex] !== 1);
    if (visiblePatches.length === 0 || invisiblePatches.length === 0) {
      nextGroups.push(group);
      return;
    }

    const visibleComponents = connectedComponents(visiblePatches, planningMesh);
    const invisibleComponents = connectedComponents(invisiblePatches, planningMesh);
    const survivingVisible = visibleComponents.filter(
      (component) => component.length >= minRegionPatchCount && areaOf(component, planningMesh) >= minAreaMm2,
    );
    const survivingInvisible = invisibleComponents.filter(
      (component) => component.length >= minRegionPatchCount && areaOf(component, planningMesh) >= minAreaMm2,
    );
    const survivingPatchCount = survivingVisible.reduce((sum, c) => sum + c.length, 0) + survivingInvisible.reduce((sum, c) => sum + c.length, 0);
    // A split that would strand a meaningful share of the region's patches
    // in too-small fragments is not worth taking -- keep the region whole.
    if (survivingVisible.length === 0 || survivingInvisible.length === 0 || survivingPatchCount < group.patches.length * 0.9) {
      nextGroups.push(group);
      return;
    }

    for (const component of [...survivingVisible, ...survivingInvisible]) nextGroups.push({ patches: component });
    splitCount += 1;
  });

  return { groups: nextGroups, splitCount };
}

function centroidKey(centroid: PlanningVector3): string {
  return `${centroid.x.toFixed(6)}:${centroid.y.toFixed(6)}:${centroid.z.toFixed(6)}`;
}

/** Rebuilds full SurfaceRegion stats (centroid, average normal, cone, boundaries, adjacency) for an arbitrary final patch grouping -- the same contract buildSurfaceRegionGraph produces, generalized to groups that are not necessarily normal-cone-capped. */
function materializeRegionGraph(groups: readonly MutableGroup[], planningMesh: PlanningMesh, ridgeAngleDeg: number): SurfaceRegionGraph {
  const patches = planningMesh.patches;
  const ordered = [...groups]
    .map((group) => group.patches)
    .filter((members) => members.length > 0)
    .sort((a, b) => {
      const keyOf = (members: readonly number[]) => members.map((patchIndex) => centroidKey(patches[patchIndex]!.centroid)).sort()[0] ?? "";
      return keyOf(a).localeCompare(keyOf(b));
    });

  const regionOfPatch = new Array<number>(patches.length).fill(-1);
  ordered.forEach((members, regionIndex) => {
    for (const patchIndex of members) regionOfPatch[patchIndex] = regionIndex;
  });

  const adjacentRegionSets: Set<number>[] = ordered.map(() => new Set());
  const boundaryPatchSets: Set<number>[] = ordered.map(() => new Set());
  const sharpBoundary: boolean[] = ordered.map(() => false);
  for (let patchIndex = 0; patchIndex < patches.length; patchIndex += 1) {
    const ownRegion = regionOfPatch[patchIndex]!;
    if (ownRegion === -1) continue;
    for (const neighbor of planningMesh.adjacency[patchIndex] ?? []) {
      const neighborRegion = regionOfPatch[neighbor]!;
      if (neighborRegion === -1 || neighborRegion === ownRegion) continue;
      adjacentRegionSets[ownRegion]!.add(neighborRegion);
      boundaryPatchSets[ownRegion]!.add(patchIndex);
      if (angleBetweenDeg(patches[patchIndex]!.normal, patches[neighbor]!.normal) >= ridgeAngleDeg) sharpBoundary[ownRegion] = true;
    }
  }

  const regions: SurfaceRegion[] = ordered.map((members, regionIndex) => {
    let areaMm2 = 0, cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
    for (const patchIndex of members) {
      const patch = patches[patchIndex]!;
      areaMm2 += patch.areaMm2;
      cx += patch.centroid.x * patch.areaMm2;
      cy += patch.centroid.y * patch.areaMm2;
      cz += patch.centroid.z * patch.areaMm2;
      nx += patch.normal.x * patch.areaMm2;
      ny += patch.normal.y * patch.areaMm2;
      nz += patch.normal.z * patch.areaMm2;
    }
    const areaSafe = Math.max(areaMm2, 1e-12);
    const centroid = { x: cx / areaSafe, y: cy / areaSafe, z: cz / areaSafe };
    const normalLength = Math.hypot(nx, ny, nz) || 1;
    const averageNormal = { x: nx / normalLength, y: ny / normalLength, z: nz / normalLength };
    let normalConeHalfAngleDeg = 0;
    for (const patchIndex of members) {
      const angle = angleBetweenDeg(patches[patchIndex]!.normal, averageNormal);
      if (angle > normalConeHalfAngleDeg) normalConeHalfAngleDeg = angle;
    }
    const sortedMembers = [...members].sort((a, b) => a - b);
    return {
      regionId: `region:subdivided:${centroidKey(centroid)}`,
      regionIndex,
      sourceTriangleIds: sortedMembers.map((patchIndex) => patches[patchIndex]!.sourceTriangle).sort((a, b) => a - b),
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
 * Refines a region graph by visibility-driven subdivision, bounded by
 * `maxRefinementDepth` rounds and a minimum child size (area fraction AND
 * patch count -- Article 15/41: every expansion paired with pruning).
 */
export function refineRegionGraphByVisibility(
  regionGraph: SurfaceRegionGraph,
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  options: RegionSubdivisionOptions = {},
): RegionSubdivisionResult {
  const maxRefinementDepth = options.maxRefinementDepth ?? DEFAULT_MAX_REFINEMENT_DEPTH;
  const minRegionAreaFraction = options.minRegionAreaFraction ?? DEFAULT_MIN_REGION_AREA_FRACTION;
  const minRegionPatchCount = options.minRegionPatchCount ?? DEFAULT_MIN_REGION_PATCH_COUNT;
  const totalAreaMm2 = regionGraph.regions.reduce((sum, region) => sum + region.areaMm2, 0);
  const ridgeAngleDeg = 45;

  let groups: MutableGroup[] = regionGraph.regions.map((region) => ({ patches: [...region.patchIndexes] }));
  let totalSplits = 0;
  for (let round = 0; round < maxRefinementDepth; round += 1) {
    const result = subdivideOnce(groups, planningMesh, analysis, totalAreaMm2, minRegionPatchCount, minRegionAreaFraction);
    groups = result.groups;
    totalSplits += result.splitCount;
    if (result.splitCount === 0) break;
  }

  if (totalSplits === 0) return { regionGraph, subdividedRegionCount: 0 };
  return { regionGraph: materializeRegionGraph(groups, planningMesh, ridgeAngleDeg), subdividedRegionCount: totalSplits };
}
