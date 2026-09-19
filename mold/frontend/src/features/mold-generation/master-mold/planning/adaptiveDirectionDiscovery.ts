import type {
  AccessibilityAnalysis,
  PlanningCandidateDirection,
  PlanningMesh,
  PlanningVector3,
  SurfaceRegion,
  SurfaceRegionGraph,
} from "./masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { angleBetweenDeg, normalize, principalAxesOfCovariance } from "./candidateDirections";
import { analyzeDirectionAccessibility } from "./accessibility";
import { buildSurfaceRegionGraph, summarizeRegionAccessibility, unresolvedSurfaceRegions } from "./surfaceRegions";

/**
 * Execution 08 LOOP 08: adaptive direction discovery.
 *
 * The bounded, geometry-derived candidate set (Article 04) can still miss a
 * genuinely necessary release direction -- Article 04's own greedy,
 * 8-seed-bounded normal-cluster source is dominated by a large curved
 * body's continuum of surface normals before it ever reaches a small
 * locked feature's exact axis (the real failure this execution starts
 * from). Rather than accepting that gap, this stage closes the loop:
 *
 *   find an unresolved region (LOOP 05/07's region graph + coverage math)
 *   -> derive new candidate directions FROM that region's own geometry
 *   -> test accessibility for ONLY the new directions (never re-testing
 *      the existing set)
 *   -> merge/deduplicate against everything already known
 *   -> repeat, bounded (Article 15: every expansion paired with pruning)
 */

export interface AdaptiveDirectionDiscoveryResult {
  readonly analysis: AccessibilityAnalysis;
  readonly discoveredDirections: readonly PlanningCandidateDirection[];
  readonly roundsRun: number;
}

function canonicalPolarity(v: PlanningVector3): PlanningVector3 {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  const flip = ax >= ay && ax >= az ? v.x < 0 : ay >= az ? v.y < 0 : v.z < 0;
  return flip ? { x: -v.x, y: -v.y, z: -v.z } : v;
}

/** Local PCA over a region's own member-patch centroids (never the whole mesh): its dominant SPATIAL elongation axis, a plausible sweep/release direction for an elongated pocket or rib. */
function localPcaAxis(region: SurfaceRegion, planningMesh: PlanningMesh): PlanningVector3 | null {
  if (region.patchIndexes.length < 3) return null;
  const points = region.patchIndexes.map((patchIndex) => planningMesh.patches[patchIndex]!.centroid);
  const n = points.length;
  let mx = 0, my = 0, mz = 0;
  for (const p of points) { mx += p.x; my += p.y; mz += p.z; }
  mx /= n; my /= n; mz /= n;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of points) {
    const dx = p.x - mx, dy = p.y - my, dz = p.z - mz;
    xx += dx * dx; xy += dx * dy; xz += dx * dz;
    yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  const axes = principalAxesOfCovariance([xx, xy, xz, xy, yy, yz, xz, yz, zz]);
  const dominant = axes[0];
  if (dominant === undefined) return null;
  return normalize(dominant);
}

/**
 * New candidate directions derived from one unresolved region's own
 * geometry (Article 04/LOOP 08 sources): the region's average normal, the
 * normal-cone extremum (its most-divergent member patch's own exact
 * normal), a local-PCA elongation axis over the region's own centroids, and
 * ridge-tangent cross normals at its boundary with each neighboring region
 * (a plausible silhouette-sweep direction along that ridge).
 */
function candidateDirectionsFromRegion(region: SurfaceRegion, regionGraph: SurfaceRegionGraph, planningMesh: PlanningMesh): PlanningCandidateDirection[] {
  const generated: PlanningCandidateDirection[] = [];
  const push = (vector: PlanningVector3 | null, subsource: string) => {
    const unit = vector === null ? null : normalize(vector);
    if (unit === null) return;
    generated.push({
      directionId: `adaptive:region-${region.regionIndex}:${subsource}`,
      vector: unit,
      source: "adaptive-region",
      origin: `adaptive-region-${region.regionIndex}-${subsource}`,
    });
  };

  push(region.averageNormal, "average-normal");

  let extremePatch = -1;
  let extremeAngle = -1;
  for (const patchIndex of region.patchIndexes) {
    const angle = angleBetweenDeg(planningMesh.patches[patchIndex]!.normal, region.averageNormal);
    if (angle > extremeAngle) {
      extremeAngle = angle;
      extremePatch = patchIndex;
    }
  }
  if (extremePatch >= 0 && extremeAngle > 1) push(planningMesh.patches[extremePatch]!.normal, "cone-extremum");

  push(localPcaAxis(region, planningMesh), "local-pca");

  for (const neighborIndex of region.adjacentRegionIndexes.slice(0, 2)) {
    const neighbor = regionGraph.regions[neighborIndex];
    if (neighbor === undefined) continue;
    const cross: PlanningVector3 = {
      x: region.averageNormal.y * neighbor.averageNormal.z - region.averageNormal.z * neighbor.averageNormal.y,
      y: region.averageNormal.z * neighbor.averageNormal.x - region.averageNormal.x * neighbor.averageNormal.z,
      z: region.averageNormal.x * neighbor.averageNormal.y - region.averageNormal.y * neighbor.averageNormal.x,
    };
    push(cross, `ridge-tangent-${neighborIndex}`);
  }

  return generated.slice(0, MASTER_PLANNER_LIMITS.maxAdaptiveDirectionsPerRegion).map((direction) => ({ ...direction, vector: canonicalPolarity(direction.vector) }));
}

/** Angle-based dedup against an existing direction set (Article 04's own dedup threshold). */
function isNearDuplicate(vector: PlanningVector3, existing: readonly PlanningCandidateDirection[]): boolean {
  return existing.some((candidate) => angleBetweenDeg(candidate.vector, vector) <= MASTER_PLANNER_LIMITS.directionDedupAngleDeg);
}

export function runAdaptiveDirectionDiscovery(params: {
  readonly planningMesh: PlanningMesh;
  readonly sourceMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array };
  readonly analysis: AccessibilityAnalysis;
}): AdaptiveDirectionDiscoveryResult {
  const { planningMesh, sourceMesh } = params;
  let analysis = params.analysis;
  const regionGraph = buildSurfaceRegionGraph(planningMesh);
  const discoveredDirections: PlanningCandidateDirection[] = [];
  let roundsRun = 0;

  if (regionGraph.regions.length === 0) return { analysis, discoveredDirections, roundsRun };

  for (let round = 0; round < MASTER_PLANNER_LIMITS.maxAdaptiveDirectionRounds; round += 1) {
    const summaries = summarizeRegionAccessibility(regionGraph, planningMesh, analysis);
    const unresolved = unresolvedSurfaceRegions(summaries, regionGraph)
      .slice()
      .sort((a, b) => b.areaMm2 - a.areaMm2)
      .slice(0, MASTER_PLANNER_LIMITS.maxAdaptiveRegionsPerRound);
    if (unresolved.length === 0) break;

    const newCandidates: PlanningCandidateDirection[] = [];
    for (const region of unresolved) {
      for (const candidate of candidateDirectionsFromRegion(region, regionGraph, planningMesh)) {
        if (isNearDuplicate(candidate.vector, analysis.directions) || isNearDuplicate(candidate.vector, newCandidates)) continue;
        newCandidates.push(candidate);
      }
    }
    if (newCandidates.length === 0) break; // Nothing new to try: genuinely exhausted, not silently retried forever.

    roundsRun += 1;
    const additionalAnalysis = analyzeDirectionAccessibility(sourceMesh, planningMesh, newCandidates);
    analysis = {
      directions: [...analysis.directions, ...newCandidates],
      perDirection: [...analysis.perDirection, ...additionalAnalysis.perDirection],
      dominantPatchOrder: analysis.dominantPatchOrder,
    };
    discoveredDirections.push(...newCandidates);
  }

  return { analysis, discoveredDirections, roundsRun };
}
