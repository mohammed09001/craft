import type {
  SegmentationContext,
  SegmentationObjectiveWeights,
  SplitCandidate,
} from "./segmentation.contracts";

/**
 * Shared, mode-neutral formula turning a strategy's own objective weights
 * into a single lower-is-better score for one candidate. The weights
 * (what matters, and how much) are strategy-owned; this function only
 * supplies the arithmetic so One Mold and More Molds don't each reimplement
 * it slightly differently.
 *
 * - pieceCountWeight * segmentCount -- fewer pieces is better.
 * - riskWeight * declaredRisk -- fewer/less-severe issues is better.
 * - sectionQualityWeight * |segmentCount - estimatedMinimumSegmentCount| --
 *   candidates closer to the algorithm's own estimated-useful section count
 *   score better; meaningless (weight 0) for strategies that don't care
 *   about logical section quality.
 * - marginWeight * minimumPrintableMarginMm -- larger margin is better, so
 *   it is subtracted (more margin lowers the score).
 */
export function computeWeightedObjectiveScore(
  candidate: SplitCandidate,
  context: SegmentationContext,
  weights: SegmentationObjectiveWeights,
): number {
  const sectionCountDeviation = Math.abs(
    candidate.score.segmentCount - context.estimatedMinimumSegmentCount,
  );
  return (
    weights.pieceCountWeight * candidate.score.segmentCount +
    weights.riskWeight * candidate.score.declaredRisk +
    weights.sectionQualityWeight * sectionCountDeviation -
    weights.marginWeight * candidate.score.minimumPrintableMarginMm
  );
}
