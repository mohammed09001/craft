import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import { buildMeshGeometry, countUniqueForwardIntersections } from "../../geometry/meshBvh";
import { buildGeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type {
  AccessibilityAnalysis,
  DirectionAccessibility,
  PatchAccessibilityClass,
  PlanningCandidateDirection,
  PlanningMesh,
  UndercutRegion,
} from "./masterMoldPlanning.contracts";
import { buildSurfaceRegionGraph, summarizeRegionAccessibility } from "./surfaceRegions";

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
 *
 * Execution 08 LOOP 06: the probe offset (how far outside the surface a
 * visibility ray starts) is scale-aware, not a fixed 1e-3mm. A fixed offset
 * is simultaneously too coarse for small parts (it can skip straight past a
 * genuine small-scale undercut) and numerically marginal for large parts
 * (Float32 rounding noise grows with coordinate magnitude) -- the same
 * Float32-ULP-aware tolerance policy used elsewhere in this codebase
 * (`buildGeometryTolerancePolicy`) keeps the probe consistent across scale.
 * Each patch is probed at three offsets (the scale-aware tolerance, and 4x
 * / 16x it); agreement across all three is a "clear"/"blocked" result,
 * disagreement between the first two but agreement at the third is
 * "grazing" (numerically borderline, resolved by stepping back further),
 * and persistent disagreement is "uncertain" (never silently resolved to a
 * confident answer).
 */

const PROBE_OFFSET_SCALE_STEPS = [1, 4, 16] as const;

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

/** Scale-aware base probe offset for a mesh occupying `bounds` (Execution 08 LOOP 06). */
function baseProbeOffsetMmFor(bounds: Bounds3): number {
  const sizeX = bounds.max.x - bounds.min.x;
  const sizeY = bounds.max.y - bounds.min.y;
  const sizeZ = bounds.max.z - bounds.min.z;
  if (![sizeX, sizeY, sizeZ].every((value) => Number.isFinite(value) && value > 0)) return 1e-3;
  try {
    return buildGeometryTolerancePolicy(bounds, 0).containmentToleranceMm;
  } catch {
    return 1e-3;
  }
}

function boundsOfPositions(positions: readonly number[] | Float32Array): Bounds3 {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!, y = positions[index + 1]!, z = positions[index + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

export function analyzeDirectionAccessibility(
  fullMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array },
  planningMesh: PlanningMesh,
  directions: readonly PlanningCandidateDirection[],
): AccessibilityAnalysis {
  const patchCount = planningMesh.patches.length;
  const visiblePerDirection: Uint8Array[] = directions.map(() => new Uint8Array(patchCount));
  const classificationPerDirection: PatchAccessibilityClass[][] = directions.map(() => new Array<PatchAccessibilityClass>(patchCount).fill("clear"));
  const baseOffsetMm = baseProbeOffsetMmFor(boundsOfPositions(fullMesh.positions));

  let geometry: ReturnType<typeof buildMeshGeometry> | null = null;
  try {
    geometry = buildMeshGeometry({ positions: [...fullMesh.positions], indices: [...fullMesh.indices] });
    const bvh = new MeshBVH(geometry);
    const directionVectors = directions.map((direction) => new Vector3(direction.vector.x, direction.vector.y, direction.vector.z));
    const probe = new Vector3();

    for (const patch of planningMesh.patches) {
      for (let d = 0; d < directionVectors.length; d += 1) {
        // Probe at increasing scale-aware offsets outside the solid: a
        // result that agrees at every step is unambiguous; one that
        // changes with the offset is exactly what "grazing" means
        // (Article 15/41: never silently resolved to a confident answer).
        const results: boolean[] = PROBE_OFFSET_SCALE_STEPS.map((scale) => {
          const offset = baseOffsetMm * scale;
          probe.set(
            patch.centroid.x + patch.normal.x * offset,
            patch.centroid.y + patch.normal.y * offset,
            patch.centroid.z + patch.normal.z * offset,
          );
          return countUniqueForwardIntersections(bvh, probe, directionVectors[d]!) === 0;
        });

        let classification: PatchAccessibilityClass;
        let isVisible: boolean;
        if (results[0] === results[1] && results[1] === results[2]) {
          classification = results[0]! ? "clear" : "blocked";
          isVisible = results[0]!;
        } else if (results[1] === results[2]) {
          // Resolved once stepped back far enough: numerically borderline
          // at the tightest offset, but stable and confident beyond it.
          classification = "grazing";
          isVisible = results[2]!;
        } else {
          // Even the widest offset didn't stabilize the result: do not
          // guess. `visible` conservatively defaults to inaccessible so an
          // uncertain patch cannot silently pass as a clean release.
          classification = "uncertain";
          isVisible = false;
        }
        if (isVisible) visiblePerDirection[d]![patch.patchIndex] = 1;
        classificationPerDirection[d]![patch.patchIndex] = classification;
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
      classification: classificationPerDirection[d]!,
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

const REGION_FULL_COVERAGE_FRACTION = 0.999;

/**
 * Execution 08 LOOP 07: the indexes of "coverage-critical" directions --
 * ones that are the ONLY candidate fully covering some surface region. A
 * region covered by exactly one direction has no substitute: dropping that
 * direction on score alone would make the region permanently unassignable
 * regardless of piece count, with no way for the search to recover it.
 */
function coverageCriticalDirectionIndexes(
  directions: readonly PlanningCandidateDirection[],
  analysis: AccessibilityAnalysis,
  planningMesh: PlanningMesh,
): ReadonlySet<number> {
  const regionGraph = buildSurfaceRegionGraph(planningMesh);
  const critical = new Set<number>();
  if (regionGraph.regions.length === 0) return critical;
  const summaries = summarizeRegionAccessibility(regionGraph, planningMesh, analysis);
  for (const summary of summaries) {
    let fullCoverageCount = 0;
    let soleDirectionIndex = -1;
    for (let d = 0; d < directions.length; d += 1) {
      const fraction = summary.visibleAreaFractionByDirectionId.get(directions[d]!.directionId) ?? 0;
      if (fraction >= REGION_FULL_COVERAGE_FRACTION) {
        fullCoverageCount += 1;
        soleDirectionIndex = d;
      }
    }
    if (fullCoverageCount === 1) critical.add(soleDirectionIndex);
  }
  return critical;
}

/**
 * Prunes dominated directions: keeps at most `keep` directions ranked by the
 * preliminary score, always retaining the world axes (baseline candidates)
 * PLUS every coverage-critical direction (Execution 08 LOOP 07), regardless
 * of score and regardless of the `keep` budget -- correctness beats budget
 * for a direction nothing else can substitute.
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
  const criticalIndexes = coverageCriticalDirectionIndexes(directions, analysis, planningMesh);
  const mandatoryIndexSet = new Set<number>(criticalIndexes);
  for (const entry of scored) if (entry.direction.source === "world-axis") mandatoryIndexSet.add(entry.index);

  const mandatory = scored.filter((entry) => mandatoryIndexSet.has(entry.index));
  const others = scored
    .filter((entry) => !mandatoryIndexSet.has(entry.index))
    .sort((a, b) => a.score - b.score || a.direction.directionId.localeCompare(b.direction.directionId));
  const remainingBudget = Math.max(0, Math.max(keep, mandatory.length) - mandatory.length);
  const kept = [...mandatory, ...others.slice(0, remainingBudget)];
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
