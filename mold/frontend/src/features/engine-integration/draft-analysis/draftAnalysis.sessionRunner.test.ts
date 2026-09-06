import { describe, expect, it } from "vitest";

import type {
  DraftAnalysisEngine,
  DraftAnalysisInput,
  DraftAnalysisResult,
} from "./draftAnalysis.contracts";
import { runDraftAnalysisForSession } from "./draftAnalysis.sessionRunner";

describe("runDraftAnalysisForSession", () => {
  it("runs the Draft Analysis foundation flow from an Analysis Session-like object", () => {
    const result = runDraftAnalysisForSession({
      sessionId: "stage-8a-session-runner",
      geometry: {
        modelId: "runner-model",
        fileName: "runner.stl",
        triangleCount: 64,
        vertexCount: 48,
        units: "mm",
      },
      pullDirection: {
        direction: { x: 1, y: 0, z: 0 },
        confidence: 0.75,
      },
    });

    expect(result.kind).toBe("draft_analysis");
    expect(result.status).toBe("pending_algorithm");
    expect(result.input.analysisSessionId).toBe("stage-8a-session-runner");
    expect(result.input.geometry).toEqual({
      source: "analysis_session",
      modelId: "runner-model",
      fileName: "runner.stl",
      triangleCount: 64,
      vertexCount: 48,
      units: "mm",
    });
    expect(result.input.pullDirection).toEqual({
      vector: { x: 1, y: 0, z: 0 },
      source: "pull_direction_engine",
      confidence: 0.75,
    });
    expect(result.draftAnalysisSummarySignals.algorithmCompleted).toBe(false);
  });

  it("completes Draft Analysis when the Analysis Session provides face inputs", () => {
    const result = runDraftAnalysisForSession({
      sessionId: "stage-8c-session-with-faces",
      pullDirection: {
        vector: { x: 0, y: 0, z: 1 },
        confidence: 1,
      },
      faces: [
        {
          faceId: "positive-face",
          normal: { x: 0, y: 0, z: 1 },
        },
        {
          faceId: "zero-face",
          normal: { x: 1, y: 0, z: 0 },
        },
        {
          faceId: "negative-face",
          normal: { x: 0, y: 0, z: -1 },
        },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.input.analysisSessionId).toBe("stage-8c-session-with-faces");
    expect(result.input.faces).toHaveLength(3);

    expect(result.faceSamples).toHaveLength(3);
    expect(result.summary.totalFaceCount).toBe(3);
    expect(result.summary.positiveDraftFaceCount).toBe(1);
    expect(result.summary.zeroDraftFaceCount).toBe(1);
    expect(result.summary.negativeDraftFaceCount).toBe(1);
    expect(result.summary.undeterminedFaceCount).toBe(0);

    expect(result.draftAnalysisSummarySignals).toEqual({
      hasNegativeDraftFaces: true,
      hasUndeterminedFaces: false,
      algorithmCompleted: true,
    });
  });

  it("allows a custom engine to be injected for future replacement", () => {
    const customEngine: DraftAnalysisEngine = {
      analyze(input: DraftAnalysisInput): DraftAnalysisResult {
        return {
          kind: "draft_analysis",
          schemaVersion: "draft-analysis/v1",
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
          errors: ["custom-engine-marker"],
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
    };

    const result = runDraftAnalysisForSession(
      {
        sessionId: "custom-engine-session",
      },
      {
        engine: customEngine,
      },
    );

    expect(result.errors).toEqual(["custom-engine-marker"]);
    expect(result.input.analysisSessionId).toBe("custom-engine-session");
  });
});
