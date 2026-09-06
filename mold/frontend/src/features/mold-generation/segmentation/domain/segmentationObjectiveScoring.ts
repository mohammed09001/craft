import type {
  SegmentationObjectiveWeights,
  SplitCandidate,
} from "./segmentation.contracts";

/**
 * The single hard-coded planning objective policy: after hard constraints,
 * prioritize minimum practical piece count and coherent/stable reassembly
 * (margin, risk). Segmentation is printer-fit-driven only; there are no
 * independently-useful "sections" to reward.
 */
export const SEGMENTATION_OBJECTIVE_WEIGHTS: SegmentationObjectiveWeights = {
  pieceCountWeight: 10,
  marginWeight: 1,
  riskWeight: 5,
};

/**
 * Turns the planning objective weights into a single lower-is-better score
 * for one candidate.
 *
 * - pieceCountWeight * segmentCount -- fewer pieces is better.
 * - riskWeight * declaredRisk -- fewer/less-severe issues is better.
 * - marginWeight * minimumPrintableMarginMm -- larger margin is better, so
 *   it is subtracted (more margin lowers the score).
 */
export function computeWeightedObjectiveScore(
  candidate: SplitCandidate,
  weights: SegmentationObjectiveWeights,
): number {
  return (
    weights.pieceCountWeight * candidate.score.segmentCount +
    weights.riskWeight * candidate.score.declaredRisk -
    weights.marginWeight * candidate.score.minimumPrintableMarginMm
  );
}
