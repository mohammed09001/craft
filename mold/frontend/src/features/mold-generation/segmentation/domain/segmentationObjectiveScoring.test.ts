import { computeWeightedObjectiveScore } from "./segmentationObjectiveScoring";
import type {
  SegmentationObjectiveWeights,
  SplitCandidate,
} from "./segmentation.contracts";

function candidate(overrides: {
  segmentCount: number;
  minimumPrintableMarginMm: number;
  declaredRisk: number;
}): SplitCandidate {
  return {
    id: "candidate",
    algorithmId: "test-algorithm",
    algorithmVersion: 1,
    planningBasis: "bounds-only",
    requiredAxes: ["x"],
    boundaries: [],
    segments: [],
    protectedRegionConflicts: [],
    issues: [],
    score: {
      hardFailureCount: 0,
      segmentCount: overrides.segmentCount,
      minimumPrintableMarginMm: overrides.minimumPrintableMarginMm,
      declaredRisk: overrides.declaredRisk,
      weightedObjectiveScore: 0,
    },
  };
}

const NEUTRAL_WEIGHTS: SegmentationObjectiveWeights = {
  pieceCountWeight: 0,
  marginWeight: 0,
  riskWeight: 0,
};

describe("computeWeightedObjectiveScore", () => {
  it("penalizes a higher segment count when pieceCountWeight is set", () => {
    const fewer = candidate({ segmentCount: 2, minimumPrintableMarginMm: 0, declaredRisk: 0 });
    const more = candidate({ segmentCount: 5, minimumPrintableMarginMm: 0, declaredRisk: 0 });
    const weights = { ...NEUTRAL_WEIGHTS, pieceCountWeight: 1 };
    expect(computeWeightedObjectiveScore(fewer, weights)).toBeLessThan(
      computeWeightedObjectiveScore(more, weights),
    );
  });

  it("rewards a larger printable margin when marginWeight is set", () => {
    const lowMargin = candidate({ segmentCount: 2, minimumPrintableMarginMm: 1, declaredRisk: 0 });
    const highMargin = candidate({ segmentCount: 2, minimumPrintableMarginMm: 50, declaredRisk: 0 });
    const weights = { ...NEUTRAL_WEIGHTS, marginWeight: 1 };
    expect(computeWeightedObjectiveScore(highMargin, weights)).toBeLessThan(
      computeWeightedObjectiveScore(lowMargin, weights),
    );
  });

  it("penalizes declared risk when riskWeight is set", () => {
    const lowRisk = candidate({ segmentCount: 2, minimumPrintableMarginMm: 0, declaredRisk: 0 });
    const highRisk = candidate({ segmentCount: 2, minimumPrintableMarginMm: 0, declaredRisk: 3 });
    const weights = { ...NEUTRAL_WEIGHTS, riskWeight: 1 };
    expect(computeWeightedObjectiveScore(lowRisk, weights)).toBeLessThan(
      computeWeightedObjectiveScore(highRisk, weights),
    );
  });
});
