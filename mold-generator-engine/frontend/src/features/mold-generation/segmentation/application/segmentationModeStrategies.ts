import type {
  ModeExtensionOutput,
  SegmentationMode,
  SegmentationModeStrategy,
  SegmentationObjectiveWeights,
} from "../domain/segmentation.contracts";
import { computeWeightedObjectiveScore } from "../domain/segmentationObjectiveScoring";

function extension(
  mode: SegmentationMode,
  obligations: readonly string[],
): ModeExtensionOutput {
  return { mode, status: "deferred", obligations };
}

// One Mold: after hard constraints, prioritize minimum practical piece
// count and coherent/stable reassembly (margin, risk) over logical section
// quality -- there are no independently-useful "sections" to reward here.
const ONE_MOLD_OBJECTIVE_WEIGHTS: SegmentationObjectiveWeights = {
  pieceCountWeight: 10,
  marginWeight: 1,
  riskWeight: 5,
  sectionQualityWeight: 0,
};

// More Molds Automatic: after hard constraints, prioritize logical section
// quality (closeness to the algorithm's own estimated-useful section count,
// which folds in independent mold usefulness/accessibility) over raw piece
// count -- "minimum unnecessary pieces" still matters, but least.
const MORE_MOLDS_OBJECTIVE_WEIGHTS: SegmentationObjectiveWeights = {
  pieceCountWeight: 1,
  marginWeight: 2,
  riskWeight: 5,
  sectionQualityWeight: 10,
};

const oneMoldStrategy: SegmentationModeStrategy = {
  mode: "make-as-one-mold",
  policyId: "mode-neutral-baseline",
  policyVersion: 1,
  considerSectionDrivenSegmentation: false,
  objectiveWeights: ONE_MOLD_OBJECTIVE_WEIGHTS,
  adjustCandidate: (candidate, context) => ({
    ...candidate,
    score: {
      ...candidate.score,
      weightedObjectiveScore: computeWeightedObjectiveScore(
        candidate,
        context,
        ONE_MOLD_OBJECTIVE_WEIGHTS,
      ),
    },
  }),
  validatePlan: () => [],
  createExtensionOutput: () =>
    extension("make-as-one-mold", [
      "assembly-joint-planning",
      "alignment-and-sealing-validation",
      "assembly-sequence-planning",
    ]),
};

const moreMoldsStrategy: SegmentationModeStrategy = {
  mode: "make-as-more-molds",
  policyId: "mode-neutral-baseline",
  policyVersion: 1,
  considerSectionDrivenSegmentation: true,
  objectiveWeights: MORE_MOLDS_OBJECTIVE_WEIGHTS,
  adjustCandidate: (candidate, context) => ({
    ...candidate,
    score: {
      ...candidate.score,
      weightedObjectiveScore: computeWeightedObjectiveScore(
        candidate,
        context,
        MORE_MOLDS_OBJECTIVE_WEIGHTS,
      ),
    },
  }),
  validatePlan: () => [],
  createExtensionOutput: () =>
    extension("make-as-more-molds", [
      "independent-mold-regeneration",
      "per-mold-cavity-sprue-registration",
      "independent-manufacturing-output",
    ]),
};

const STRATEGIES: Readonly<
  Record<SegmentationMode, SegmentationModeStrategy>
> = {
  "make-as-one-mold": oneMoldStrategy,
  "make-as-more-molds": moreMoldsStrategy,
};

export function resolveSegmentationModeStrategy(
  mode: SegmentationMode,
): SegmentationModeStrategy {
  return STRATEGIES[mode];
}
