import { describe, expect, it } from "vitest";

import type { DraftAnalysisResult } from "./draftAnalysis.contracts";
import { createDraftAnalysisBoundarySnapshot } from "./draftAnalysis.boundarySnapshot";

const createBaseDraftAnalysisResult = (): DraftAnalysisResult => ({
  kind: "draft_analysis",
  schemaVersion: "draft-analysis/v1",
  status: "completed",
  input: {
    geometry: {
      source: "analysis_session",
    },
    pullDirection: {
      vector: { x: 0, y: 0, z: 1 },
      source: "pull_direction_engine",
    },
    options: {
      zeroDraftToleranceDegrees: 0.25,
      maxStoredFaceSamples: 250,
    },
  },
  summary: {
    totalFaceCount: 3,
    analyzedFaceCount: 3,
    positiveDraftFaceCount: 1,
    zeroDraftFaceCount: 1,
    negativeDraftFaceCount: 1,
    undeterminedFaceCount: 0,
    minimumDraftAngleDegrees: -90,
    maximumDraftAngleDegrees: 90,
    meanDraftAngleDegrees: 0,
  },
  faceSamples: [],
  draftAnalysisSummarySignals: {
    hasNegativeDraftFaces: true,
    hasUndeterminedFaces: false,
    algorithmCompleted: true,
  },
  errors: [],
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("createDraftAnalysisBoundarySnapshot", () => {
  it("creates a boundary snapshot from a completed Draft Analysis result", () => {
    const snapshot = createDraftAnalysisBoundarySnapshot(
      createBaseDraftAnalysisResult(),
    );

    expect(snapshot).toEqual({
      source: "draft_analysis",
      status: "completed",
      algorithmCompleted: true,
      hasNegativeDraftFaces: true,
      hasUndeterminedFaces: false,
      totalFaceCount: 3,
      analyzedFaceCount: 3,
      positiveDraftFaceCount: 1,
      zeroDraftFaceCount: 1,
      negativeDraftFaceCount: 1,
      undeterminedFaceCount: 0,
      minimumDraftAngleDegrees: -90,
      maximumDraftAngleDegrees: 90,
      meanDraftAngleDegrees: 0,
    });
  });

  it("omits optional draft angle statistics when they are unavailable", () => {
    const result: DraftAnalysisResult = {
      ...createBaseDraftAnalysisResult(),
      status: "pending_algorithm",
      summary: {
        totalFaceCount: 0,
        analyzedFaceCount: 0,
        positiveDraftFaceCount: 0,
        zeroDraftFaceCount: 0,
        negativeDraftFaceCount: 0,
        undeterminedFaceCount: 0,
      },
      draftAnalysisSummarySignals: {
        hasNegativeDraftFaces: false,
        hasUndeterminedFaces: false,
        algorithmCompleted: false,
      },
    };

    const snapshot = createDraftAnalysisBoundarySnapshot(result);

    expect(snapshot).toEqual({
      source: "draft_analysis",
      status: "pending_algorithm",
      algorithmCompleted: false,
      hasNegativeDraftFaces: false,
      hasUndeterminedFaces: false,
      totalFaceCount: 0,
      analyzedFaceCount: 0,
      positiveDraftFaceCount: 0,
      zeroDraftFaceCount: 0,
      negativeDraftFaceCount: 0,
      undeterminedFaceCount: 0,
    });
  });
});
