import { describe, expect, it } from "vitest";

import {
  DEFAULT_DRAFT_ANALYSIS_OPTIONS,
  DRAFT_ANALYSIS_SCHEMA_VERSION,
  type DraftAnalysisInput,
  type DraftAnalysisResult,
} from "./draftAnalysis.contracts";

const createContractsTestInput = (): DraftAnalysisInput => ({
  analysisSessionId: "stage-8a-test-session",
  geometry: {
    source: "analysis_session",
    modelId: "stage-8a-test-model",
    fileName: "sample.stl",
    triangleCount: 12,
    vertexCount: 8,
    units: "mm",
  },
  pullDirection: {
    vector: { x: 0, y: 0, z: 1 },
    source: "pull_direction_engine",
    confidence: 1,
  },
  options: DEFAULT_DRAFT_ANALYSIS_OPTIONS,
});

describe("Draft Analysis contracts", () => {
  it("supports a valid Stage 8A pending result shape", () => {
    const input = createContractsTestInput();

    const result: DraftAnalysisResult = {
      kind: "draft_analysis",
      schemaVersion: DRAFT_ANALYSIS_SCHEMA_VERSION,
      status: "pending_algorithm",
      input,
      summary: {
        totalFaceCount: 0,
        analyzedFaceCount: 0,
        positiveDraftFaceCount: 0,
        zeroDraftFaceCount: 0,
        negativeDraftFaceCount: 0,
        undeterminedFaceCount: 0,
      },
      faceSamples: [],
      draftAnalysisSummarySignals: {
        hasNegativeDraftFaces: false,
        hasUndeterminedFaces: false,
        algorithmCompleted: false,
      },
      errors: [],
      createdAt: new Date().toISOString(),
    };

    expect(result.kind).toBe("draft_analysis");
    expect(result.schemaVersion).toBe("draft-analysis/v1");
    expect(result.status).toBe("pending_algorithm");
    expect(result.draftAnalysisSummarySignals.algorithmCompleted).toBe(false);
    expect(result.faceSamples).toEqual([]);
  });
});
