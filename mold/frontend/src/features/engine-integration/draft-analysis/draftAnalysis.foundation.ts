import {
  DRAFT_ANALYSIS_SCHEMA_VERSION,
  type DraftAnalysisEngine,
  type DraftAnalysisInput,
  type DraftAnalysisResult,
  type DraftAnalysisSummary,
} from "./draftAnalysis.contracts";
import { analyzeDraftFaceCollection } from "./draftAnalysis.collection";

const createPendingDraftSummary = (): DraftAnalysisSummary => ({
  totalFaceCount: 0,
  analyzedFaceCount: 0,
  positiveDraftFaceCount: 0,
  zeroDraftFaceCount: 0,
  negativeDraftFaceCount: 0,
  undeterminedFaceCount: 0,
});

/**
 * Draft Analysis Foundation Engine
 *
 * Stage 8B responsibility:
 * - Keep pending behavior when no face inputs are available.
 * - Run the internal draft-face collection algorithm when face inputs exist.
 *
 * Not included:
 * - No heatmap.
 * - No engineering report.
 * - No dashboard.
 * - No user-facing recommendation.
 */
export class DraftAnalysisFoundationEngine implements DraftAnalysisEngine {
  analyze(input: DraftAnalysisInput): DraftAnalysisResult {
    if (input.faces === undefined || input.faces.length === 0) {
      return {
        kind: "draft_analysis",
        schemaVersion: DRAFT_ANALYSIS_SCHEMA_VERSION,
        status: "pending_algorithm",
        input,
        summary: createPendingDraftSummary(),
        faceSamples: [],
        draftAnalysisSummarySignals: {
          hasNegativeDraftFaces: false,
          hasUndeterminedFaces: false,
          algorithmCompleted: false,
        },
        errors: [],
        createdAt: new Date().toISOString(),
      };
    }

    const collectionResult = analyzeDraftFaceCollection({
      faces: input.faces,
      pullDirection: input.pullDirection,
      options: input.options,
    });

    return {
      kind: "draft_analysis",
      schemaVersion: DRAFT_ANALYSIS_SCHEMA_VERSION,
      status: "completed",
      input,
      summary: collectionResult.summary,
      faceSamples: collectionResult.faceSamples,
      draftAnalysisSummarySignals: collectionResult.draftAnalysisSummarySignals,
      errors: [],
      createdAt: new Date().toISOString(),
    };
  }
}

export const createDraftAnalysisFoundationEngine = (): DraftAnalysisEngine =>
  new DraftAnalysisFoundationEngine();
