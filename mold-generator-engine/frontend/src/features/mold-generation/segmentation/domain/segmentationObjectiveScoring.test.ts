import { computeWeightedObjectiveScore } from "./segmentationObjectiveScoring";
import type {
  SegmentationContext,
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

function context(estimatedMinimumSegmentCount: number): SegmentationContext {
  return {
    request: {} as SegmentationContext["request"],
    source: {} as SegmentationContext["source"],
    sourceSize: { x: 1, y: 1, z: 1 },
    printableFit: {
      status: "FITS",
      axisFit: { x: true, y: true, z: true },
    } as SegmentationContext["printableFit"],
    requiredAxes: ["x"],
    perAxisSegmentCount: { x: 2, y: 1, z: 1 },
    estimatedMinimumSegmentCount,
    protectedRegions: [],
  };
}

const NEUTRAL_WEIGHTS: SegmentationObjectiveWeights = {
  pieceCountWeight: 0,
  marginWeight: 0,
  riskWeight: 0,
  sectionQualityWeight: 0,
};

describe("computeWeightedObjectiveScore", () => {
  it("penalizes a higher segment count when pieceCountWeight is set", () => {
    const fewer = candidate({ segmentCount: 2, minimumPrintableMarginMm: 0, declaredRisk: 0 });
    const more = candidate({ segmentCount: 5, minimumPrintableMarginMm: 0, declaredRisk: 0 });
    const weights = { ...NEUTRAL_WEIGHTS, pieceCountWeight: 1 };
    const ctx = context(2);
    expect(computeWeightedObjectiveScore(fewer, ctx, weights)).toBeLessThan(
      computeWeightedObjectiveScore(more, ctx, weights),
    );
  });

  it("rewards a larger printable margin when marginWeight is set", () => {
    const lowMargin = candidate({ segmentCount: 2, minimumPrintableMarginMm: 1, declaredRisk: 0 });
    const highMargin = candidate({ segmentCount: 2, minimumPrintableMarginMm: 50, declaredRisk: 0 });
    const weights = { ...NEUTRAL_WEIGHTS, marginWeight: 1 };
    const ctx = context(2);
    expect(computeWeightedObjectiveScore(highMargin, ctx, weights)).toBeLessThan(
      computeWeightedObjectiveScore(lowMargin, ctx, weights),
    );
  });

  it("penalizes declared risk when riskWeight is set", () => {
    const lowRisk = candidate({ segmentCount: 2, minimumPrintableMarginMm: 0, declaredRisk: 0 });
    const highRisk = candidate({ segmentCount: 2, minimumPrintableMarginMm: 0, declaredRisk: 3 });
    const weights = { ...NEUTRAL_WEIGHTS, riskWeight: 1 };
    const ctx = context(2);
    expect(computeWeightedObjectiveScore(lowRisk, ctx, weights)).toBeLessThan(
      computeWeightedObjectiveScore(highRisk, ctx, weights),
    );
  });

  it("rewards a segment count closer to the estimated minimum when sectionQualityWeight is set", () => {
    const closeToTarget = candidate({ segmentCount: 2, minimumPrintableMarginMm: 0, declaredRisk: 0 });
    const farFromTarget = candidate({ segmentCount: 8, minimumPrintableMarginMm: 0, declaredRisk: 0 });
    const weights = { ...NEUTRAL_WEIGHTS, sectionQualityWeight: 1 };
    const ctx = context(2);
    expect(
      computeWeightedObjectiveScore(closeToTarget, ctx, weights),
    ).toBeLessThan(computeWeightedObjectiveScore(farFromTarget, ctx, weights));
  });

  it("changing which weights are active changes which candidate ranks best", () => {
    // fewestPieces: minimum possible segment count (1), but far from the
    // algorithm's own estimated-useful target of 4.
    // atTarget: exactly matches the estimated-useful target (4 segments),
    // but has more pieces than the bare minimum.
    const fewestPieces = candidate({
      segmentCount: 1,
      minimumPrintableMarginMm: 1,
      declaredRisk: 0,
    });
    const atTarget = candidate({
      segmentCount: 4,
      minimumPrintableMarginMm: 1,
      declaredRisk: 0,
    });
    const ctx = context(4);

    const pieceCountDominant: SegmentationObjectiveWeights = {
      ...NEUTRAL_WEIGHTS,
      pieceCountWeight: 10,
    };
    const sectionQualityDominant: SegmentationObjectiveWeights = {
      ...NEUTRAL_WEIGHTS,
      sectionQualityWeight: 10,
    };

    // Under piece-count-dominant weights (One-Mold-like), the fewest-pieces
    // candidate wins.
    expect(
      computeWeightedObjectiveScore(fewestPieces, ctx, pieceCountDominant),
    ).toBeLessThan(
      computeWeightedObjectiveScore(atTarget, ctx, pieceCountDominant),
    );

    // Under section-quality-dominant weights (More-Molds-like), the
    // ranking flips: the candidate matching the estimated-useful target
    // wins instead, even though it has more pieces -- proof that the
    // active strategy's weights (not a fixed rule) drive the ranking.
    expect(
      computeWeightedObjectiveScore(atTarget, ctx, sectionQualityDominant),
    ).toBeLessThan(
      computeWeightedObjectiveScore(
        fewestPieces,
        ctx,
        sectionQualityDominant,
      ),
    );
  });
});
