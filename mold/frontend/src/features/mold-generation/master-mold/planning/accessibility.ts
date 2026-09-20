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
import { refineRegionGraphByVisibility } from "./regionSubdivision";

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
 * Execution 08 LOOP 07: for every surface region, every direction (by
 * index) that fully covers it on its own. Checked against the REFINED
 * (subdivided, LOOP 12) region graph, since that is what the real
 * downstream planning search (masterMoldEngine.ts, workingMoldPlanner.ts)
 * actually runs region-cover against, not the raw one -- a refined
 * sub-region's own full-coverer set can genuinely differ from its
 * unrefined parent's.
 */
function fullCoveringDirectionIndexesPerRegion(
  directions: readonly PlanningCandidateDirection[],
  analysis: AccessibilityAnalysis,
  planningMesh: PlanningMesh,
): readonly (readonly number[])[] {
  const regionGraph = refineRegionGraphByVisibility(buildSurfaceRegionGraph(planningMesh), planningMesh, analysis).regionGraph;
  if (regionGraph.regions.length === 0) return [];
  const summaries = summarizeRegionAccessibility(regionGraph, planningMesh, analysis);
  return summaries.map((summary) => {
    const coverers: number[] = [];
    for (let d = 0; d < directions.length; d += 1) {
      const fraction = summary.visibleAreaFractionByDirectionId.get(directions[d]!.directionId) ?? 0;
      if (fraction >= REGION_FULL_COVERAGE_FRACTION) coverers.push(d);
    }
    return coverers;
  });
}

/**
 * Prunes dominated directions: keeps at most `keep` directions ranked by
 * the preliminary score, always retaining the world axes (baseline
 * candidates).
 *
 * Coverage correctness (Execution 08 LOOP 07) is enforced in TWO passes,
 * not one: (1) a region with exactly ONE full-coverer overall makes that
 * direction mandatory from the start -- the original, narrower check; (2) a
 * validation pass AFTER score-based trimming, that catches the case (1)
 * alone misses -- a region with SEVERAL possible full-coverers, none
 * individually "critical" since any one would do, whose ENTIRE coverer set
 * still gets eliminated together by score-based trimming (nothing in a
 * pass-1-only design checks whether at least one candidate survives).
 * Measured directly against the real free-form regression fixture at a
 * deliberately tight prune budget: a region with 5 distinct full-coverers
 * (none "critical" under pass 1 alone) lost all 5 to score-based trimming
 * simultaneously, leaving it uncovered even though the full direction set
 * could reach it. Pass 2 adds back the single best-scoring survivor for
 * any region left with none. A region with ZERO full-coverers at all (only
 * coverable via a multi-direction COMBINATION) is not this function's
 * concern -- greedyRegionCover's own combination search handles that
 * downstream, and forcing every partial contributor to survive here would
 * defeat pruning's whole purpose.
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
  const perRegionCoverers = fullCoveringDirectionIndexesPerRegion(directions, analysis, planningMesh);

  const mandatoryIndexSet = new Set<number>();
  for (const entry of scored) if (entry.direction.source === "world-axis") mandatoryIndexSet.add(entry.index);
  for (const coverers of perRegionCoverers) {
    if (coverers.length === 1) mandatoryIndexSet.add(coverers[0]!);
  }

  const mandatory = scored.filter((entry) => mandatoryIndexSet.has(entry.index));
  const others = scored
    .filter((entry) => !mandatoryIndexSet.has(entry.index))
    .sort((a, b) => a.score - b.score || a.direction.directionId.localeCompare(b.direction.directionId));
  const remainingBudget = Math.max(0, Math.max(keep, mandatory.length) - mandatory.length);
  const keptIndexSet = new Set<number>([...mandatoryIndexSet, ...others.slice(0, remainingBudget).map((entry) => entry.index)]);

  // Pass 2: a region with several full-coverers, none individually
  // mandatory, can still lose ALL of them to score-based trimming at once.
  // Restore just the single best-scoring one for any region left with no
  // surviving coverer -- never the whole set, so this stays a minimal,
  // targeted repair rather than defeating the budget.
  for (const coverers of perRegionCoverers) {
    if (coverers.length < 2) continue; // 0: no single coverer exists at all (a combination-only region, not this pass's job). 1: already mandatory above.
    if (coverers.some((index) => keptIndexSet.has(index))) continue;
    const best = coverers.reduce((bestIndex, index) => (scored[index]!.score < scored[bestIndex]!.score ? index : bestIndex), coverers[0]!);
    keptIndexSet.add(best);
  }

  const kept = scored.filter((entry) => keptIndexSet.has(entry.index));
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
