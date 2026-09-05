import { resolveSegmentationModeStrategy } from "./segmentationModeStrategies";
import type { SegmentationContext, SplitCandidate } from "../domain/segmentation.contracts";

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

describe("resolveSegmentationModeStrategy", () => {
  it("One Mold never opts in to section-driven segmentation", () => {
    const strategy = resolveSegmentationModeStrategy("make-as-one-mold");
    expect(strategy.considerSectionDrivenSegmentation).toBe(false);
  });

  it("More Molds Automatic opts in to section-driven segmentation", () => {
    const strategy = resolveSegmentationModeStrategy("make-as-more-molds");
    expect(strategy.considerSectionDrivenSegmentation).toBe(true);
  });

  it("One Mold's objective weights prioritize piece count over section quality", () => {
    const strategy = resolveSegmentationModeStrategy("make-as-one-mold");
    expect(strategy.objectiveWeights.pieceCountWeight).toBeGreaterThan(
      strategy.objectiveWeights.sectionQualityWeight,
    );
  });

  it("More Molds Automatic's objective weights prioritize section quality over piece count", () => {
    const strategy = resolveSegmentationModeStrategy("make-as-more-molds");
    expect(strategy.objectiveWeights.sectionQualityWeight).toBeGreaterThan(
      strategy.objectiveWeights.pieceCountWeight,
    );
  });

  it("One Mold's adjustCandidate sets a real, weight-derived objective score", () => {
    const strategy = resolveSegmentationModeStrategy("make-as-one-mold");
    const fewer = candidate({ segmentCount: 1, minimumPrintableMarginMm: 5, declaredRisk: 0 });
    const more = candidate({ segmentCount: 10, minimumPrintableMarginMm: 5, declaredRisk: 0 });
    const ctx = context(1);
    const adjustedFewer = strategy.adjustCandidate(fewer, ctx);
    const adjustedMore = strategy.adjustCandidate(more, ctx);
    expect(adjustedFewer.score.weightedObjectiveScore).toBeLessThan(
      adjustedMore.score.weightedObjectiveScore,
    );
  });

  it("More Molds Automatic's adjustCandidate rewards proximity to the estimated section target over raw piece count", () => {
    const strategy = resolveSegmentationModeStrategy("make-as-more-molds");
    const fewestPieces = candidate({ segmentCount: 1, minimumPrintableMarginMm: 1, declaredRisk: 0 });
    const atTarget = candidate({ segmentCount: 4, minimumPrintableMarginMm: 1, declaredRisk: 0 });
    const ctx = context(4);
    const adjustedFewest = strategy.adjustCandidate(fewestPieces, ctx);
    const adjustedAtTarget = strategy.adjustCandidate(atTarget, ctx);
    expect(adjustedAtTarget.score.weightedObjectiveScore).toBeLessThan(
      adjustedFewest.score.weightedObjectiveScore,
    );
  });

  it("One Mold and More Molds diverge on the same candidate because their weights differ", () => {
    const oneMold = resolveSegmentationModeStrategy("make-as-one-mold");
    const moreMolds = resolveSegmentationModeStrategy("make-as-more-molds");
    const sameCandidate = candidate({ segmentCount: 6, minimumPrintableMarginMm: 3, declaredRisk: 1 });
    const ctx = context(2);
    const underOneMold = oneMold.adjustCandidate(sameCandidate, ctx).score
      .weightedObjectiveScore;
    const underMoreMolds = moreMolds.adjustCandidate(sameCandidate, ctx).score
      .weightedObjectiveScore;
    expect(underOneMold).not.toBe(underMoreMolds);
  });
});
