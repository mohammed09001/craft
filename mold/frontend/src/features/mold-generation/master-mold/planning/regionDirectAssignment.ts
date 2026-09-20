import type { AccessibilityAnalysis, PlanningMesh, SurfaceRegionGraph } from "./masterMoldPlanning.contracts";
import { summarizeRegionAccessibility } from "./surfaceRegions";
import type { RegionSetCoverStep } from "./regionSetCover";

/**
 * Execution 08 LOOP 14 (real-regression root cause fix): the ordered
 * half-space search's assignment rule -- `dot(patch.centroid, direction) >=
 * offset`, claimed in a fixed prism sequence -- is a DIFFERENT, weaker
 * criterion than "this region is fully VISIBLE from direction D", which is
 * all `greedyRegionCover` (Loop 11) proves. Verified directly against the
 * real free-form regression fixture: even trying region set-cover's own
 * proven-sufficient 5-direction combination, in set-cover's own order, as
 * an ordered prism sequence with each direction's tightest threshold,
 * still left 198 patches unassigned. Set-cover's own region-to-direction
 * proof was never actually used to drive real patch assignment -- the
 * search just tries geometric offsets and hopes they align with
 * visibility.
 *
 * This assigns patches DIRECTLY from set-cover's own proof: for each
 * region, walk the cover steps in ORDER (matching greedy's own claim
 * order) and assign the region's patches to the FIRST step whose
 * direction fully sees it. No geometric threshold, no offset search --
 * by construction, `unassignedPatchCount` is 0 whenever `coverSteps`
 * covers every region (verify with `greedyRegionCover`'s own
 * `uncoveredRegionIndexes` first).
 *
 * The resulting piece boundaries are NOT half-space planes in general
 * (that is exactly the gap this sidesteps), so construction from this
 * assignment needs `extractPartingInterfaces`'s real per-neighbor curves
 * and the height-field/multi-neighbor construction (this file only
 * produces the assignment, not geometry).
 */

const FULL_COVERAGE_FRACTION = 0.999;

export interface RegionDirectAssignmentResult {
  /** Patch index -> piece index (0-based, matching `pieceDirectionIndexes`'s own order). -1 for a patch whose region no cover step reaches. */
  readonly assignment: Int32Array;
  /** Piece index -> candidate direction index (into `analysis.directions`), in `coverSteps`' own order. */
  readonly pieceDirectionIndexes: readonly number[];
  /** Patches left at -1: a region no supplied cover step fully sees (should be 0 whenever `coverSteps` came from a set-cover result with no `uncoveredRegionIndexes`). */
  readonly unassignedPatchCount: number;
}

export function buildRegionDirectAssignment(
  regionGraph: SurfaceRegionGraph,
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  coverSteps: readonly RegionSetCoverStep[],
  fullCoverageFraction: number = FULL_COVERAGE_FRACTION,
): RegionDirectAssignmentResult {
  const summaries = summarizeRegionAccessibility(regionGraph, planningMesh, analysis);
  const pieceDirectionIndexes = coverSteps.map((step) => step.directionIndex);
  const assignment = new Int32Array(planningMesh.patches.length).fill(-1);
  let unassignedPatchCount = 0;

  for (const summary of summaries) {
    const region = regionGraph.regions[summary.regionIndex]!;
    let ownerPiece = -1;
    for (let pieceIndex = 0; pieceIndex < pieceDirectionIndexes.length; pieceIndex += 1) {
      const directionId = analysis.directions[pieceDirectionIndexes[pieceIndex]!]!.directionId;
      const fraction = summary.visibleAreaFractionByDirectionId.get(directionId) ?? 0;
      if (fraction >= fullCoverageFraction) {
        ownerPiece = pieceIndex;
        break;
      }
    }
    if (ownerPiece === -1) {
      unassignedPatchCount += region.patchIndexes.length;
      continue;
    }
    for (const patchIndex of region.patchIndexes) assignment[patchIndex] = ownerPiece;
  }

  return { assignment, pieceDirectionIndexes, unassignedPatchCount };
}
