import { describe, expect, it } from "vitest";

import {
  DEFAULT_DRAFT_ANALYSIS_OPTIONS,
  DRAFT_ANALYSIS_SCHEMA_VERSION,
  type DraftAnalysisInput,
} from "./draftAnalysis.contracts";
import { createDraftAnalysisFoundationEngine } from "./draftAnalysis.foundation";

const createStage8AInput = (): DraftAnalysisInput => ({
  analysisSessionId: "stage-8a-foundation-test-session",
  geometry: {
    source: "analysis_session",
    modelId: "stage-8a-model",
    fileName: "stage-8a-sample.stl",
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

describe("DraftAnalysisFoundationEngine", () => {
  it("returns a stable pending Draft Analysis result when no face inputs exist", () => {
    const engine = createDraftAnalysisFoundationEngine();
    const input = createStage8AInput();

    const result = engine.analyze(input);

    expect(result.kind).toBe("draft_analysis");
    expect(result.schemaVersion).toBe(DRAFT_ANALYSIS_SCHEMA_VERSION);
    expect(result.status).toBe("pending_algorithm");
    expect(result.input).toBe(input);

    expect(result.summary).toEqual({
      totalFaceCount: 0,
      analyzedFaceCount: 0,
      positiveDraftFaceCount: 0,
      zeroDraftFaceCount: 0,
      negativeDraftFaceCount: 0,
      undeterminedFaceCount: 0,
    });

    expect(result.faceSamples).toEqual([]);
    expect(result.draftAnalysisSummarySignals).toEqual({
      hasNegativeDraftFaces: false,
      hasUndeterminedFaces: false,
      algorithmCompleted: false,
    });

    expect(result.errors).toEqual([]);
    expect(typeof result.createdAt).toBe("string");
  });

  it("runs internal draft analysis when face inputs are available", () => {
    const engine = createDraftAnalysisFoundationEngine();

    const input: DraftAnalysisInput = {
      ...createStage8AInput(),
      faces: [
        {
          faceId: "positive",
          normal: { x: 0, y: 0, z: 1 },
        },
        {
          faceId: "negative",
          normal: { x: 0, y: 0, z: -1 },
        },
      ],
    };

    const result = engine.analyze(input);

    expect(result.status).toBe("completed");
    expect(result.faceSamples).toHaveLength(2);
    expect(result.summary.totalFaceCount).toBe(2);
    expect(result.summary.positiveDraftFaceCount).toBe(1);
    expect(result.summary.negativeDraftFaceCount).toBe(1);
    expect(result.draftAnalysisSummarySignals).toEqual({
      hasNegativeDraftFaces: true,
      hasUndeterminedFaces: false,
      algorithmCompleted: true,
    });
  });
});
