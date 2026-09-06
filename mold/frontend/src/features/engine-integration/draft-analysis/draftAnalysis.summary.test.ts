import { describe, expect, it } from "vitest";

import type { DraftFaceSample } from "./draftAnalysis.contracts";
import { createDraftAnalysisSummaryFromFaceSamples } from "./draftAnalysis.summary";

describe("createDraftAnalysisSummaryFromFaceSamples", () => {
  it("creates an empty summary when no face samples exist", () => {
    expect(createDraftAnalysisSummaryFromFaceSamples([])).toEqual({
      totalFaceCount: 0,
      analyzedFaceCount: 0,
      positiveDraftFaceCount: 0,
      zeroDraftFaceCount: 0,
      negativeDraftFaceCount: 0,
      undeterminedFaceCount: 0,
    });
  });

  it("counts face bands and computes draft-angle statistics", () => {
    const samples: readonly DraftFaceSample[] = [
      {
        faceId: "face-positive",
        draftAngleDegrees: 5,
        band: "positive_draft",
      },
      {
        faceId: "face-zero",
        draftAngleDegrees: 0.1,
        band: "zero_draft",
      },
      {
        faceId: "face-negative",
        draftAngleDegrees: -3,
        band: "negative_draft",
      },
      {
        faceId: "face-undetermined",
        band: "undetermined",
      },
    ];

    const summary = createDraftAnalysisSummaryFromFaceSamples(samples);

    expect(summary.totalFaceCount).toBe(4);
    expect(summary.analyzedFaceCount).toBe(3);
    expect(summary.positiveDraftFaceCount).toBe(1);
    expect(summary.zeroDraftFaceCount).toBe(1);
    expect(summary.negativeDraftFaceCount).toBe(1);
    expect(summary.undeterminedFaceCount).toBe(1);
    expect(summary.minimumDraftAngleDegrees).toBe(-3);
    expect(summary.maximumDraftAngleDegrees).toBe(5);
    expect(summary.meanDraftAngleDegrees).toBeCloseTo(0.7);
  });

  it("ignores NaN draft angles in numeric statistics", () => {
    const samples: readonly DraftFaceSample[] = [
      {
        faceId: "face-nan",
        draftAngleDegrees: Number.NaN,
        band: "undetermined",
      },
      {
        faceId: "face-valid",
        draftAngleDegrees: 2,
        band: "positive_draft",
      },
    ];

    expect(createDraftAnalysisSummaryFromFaceSamples(samples)).toEqual({
      totalFaceCount: 2,
      analyzedFaceCount: 1,
      positiveDraftFaceCount: 1,
      zeroDraftFaceCount: 0,
      negativeDraftFaceCount: 0,
      undeterminedFaceCount: 1,
      minimumDraftAngleDegrees: 2,
      maximumDraftAngleDegrees: 2,
      meanDraftAngleDegrees: 2,
    });
  });
});
