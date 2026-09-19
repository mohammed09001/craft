import type { AccessibilityAnalysis, PlanningMesh, SurfaceRegionGraph } from "./masterMoldPlanning.contracts";
import { summarizeRegionAccessibility } from "./surfaceRegions";

/**
 * Execution 08 LOOP 11: moldable region set-cover optimization.
 *
 * "Select the minimum number of release-direction groups that cover all
 * moldable regions" is a set-cover problem: for each LOOP 05 region, which
 * candidate directions release it fully? Exact minimum set cover is
 * NP-hard, but the candidate-direction count is bounded (Article 13), so a
 * standard greedy approximation (repeatedly pick the direction that covers
 * the most still-uncovered regions) gives a fast, deterministic, BOUNDED
 * answer: an honest count of how many directions genuinely close out every
 * region, and an explicit list of any region no direction can reach at
 * all -- never silently dropped.
 *
 * Greedy set cover is a constructive UPPER bound on the true minimum (it
 * can use more directions than an optimal choice would), so its pick count
 * is used here to INFORM and SEED the search (Article 06's beam), not to
 * declare a lower count impossible outright -- that would risk exactly the
 * "search failure equated with physical impossibility" mistake Article 41
 * forbids. What it DOES prove outright: a region left uncovered after
 * greedy exhausts every candidate direction has no release direction in
 * the current set at all, regardless of piece count or ordering.
 */

const REGION_FULL_COVERAGE_FRACTION = 0.999;

export interface RegionSetCoverStep {
  readonly directionIndex: number;
  readonly directionId: string;
  readonly newlyCoveredRegionCount: number;
  readonly cumulativeCoveredRegionCount: number;
}

export interface RegionSetCoverResult {
  /** Ordered greedy picks -- step i is chosen because it covers the most regions still uncovered after steps 0..i-1. */
  readonly steps: readonly RegionSetCoverStep[];
  /** Region indexes no direction in the candidate set can fully release, even given unlimited picks. */
  readonly uncoveredRegionIndexes: readonly number[];
  readonly totalRegionCount: number;
}

/**
 * Greedy minimum-region-cover over the FULL candidate direction set (not
 * capped to a piece-count budget): this answers "how many directions does
 * covering every region actually take" and "which regions can no direction
 * reach", independent of any particular piece-count attempt.
 */
export function greedyRegionCover(
  regionGraph: SurfaceRegionGraph,
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  fullCoverageFraction: number = REGION_FULL_COVERAGE_FRACTION,
): RegionSetCoverResult {
  const totalRegionCount = regionGraph.regions.length;
  if (totalRegionCount === 0 || analysis.directions.length === 0) {
    return { steps: [], uncoveredRegionIndexes: regionGraph.regions.map((region) => region.regionIndex), totalRegionCount };
  }

  const summaries = summarizeRegionAccessibility(regionGraph, planningMesh, analysis);
  // directionIndex -> Set of region indexes it fully covers.
  const coverageByDirection: Set<number>[] = analysis.directions.map(() => new Set());
  for (const summary of summaries) {
    for (let d = 0; d < analysis.directions.length; d += 1) {
      const directionId = analysis.directions[d]!.directionId;
      const fraction = summary.visibleAreaFractionByDirectionId.get(directionId) ?? 0;
      if (fraction >= fullCoverageFraction) coverageByDirection[d]!.add(summary.regionIndex);
    }
  }

  const uncovered = new Set<number>(regionGraph.regions.map((region) => region.regionIndex));
  const picked = new Set<number>();
  const steps: RegionSetCoverStep[] = [];

  for (;;) {
    let bestDirection = -1;
    let bestNewCoverage = 0;
    for (let d = 0; d < analysis.directions.length; d += 1) {
      if (picked.has(d)) continue;
      let newCoverage = 0;
      for (const regionIndex of coverageByDirection[d]!) if (uncovered.has(regionIndex)) newCoverage += 1;
      // Deterministic tie-break: earlier direction index wins (directions
      // are already ranked best-first by pruneDirections).
      if (newCoverage > bestNewCoverage) {
        bestNewCoverage = newCoverage;
        bestDirection = d;
      }
    }
    if (bestDirection === -1 || bestNewCoverage === 0) break; // no direction makes further progress.

    picked.add(bestDirection);
    for (const regionIndex of coverageByDirection[bestDirection]!) uncovered.delete(regionIndex);
    steps.push({
      directionIndex: bestDirection,
      directionId: analysis.directions[bestDirection]!.directionId,
      newlyCoveredRegionCount: bestNewCoverage,
      cumulativeCoveredRegionCount: totalRegionCount - uncovered.size,
    });
    if (uncovered.size === 0) break;
  }

  return { steps, uncoveredRegionIndexes: [...uncovered].sort((a, b) => a - b), totalRegionCount };
}
