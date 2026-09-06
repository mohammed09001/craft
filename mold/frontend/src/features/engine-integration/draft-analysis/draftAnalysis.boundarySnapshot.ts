import type {
  DraftAnalysisResult,
  DraftAnalysisStatus,
} from "./draftAnalysis.contracts";

export interface DraftAnalysisBoundarySnapshot {
  readonly source: "draft_analysis";
  readonly status: DraftAnalysisStatus;
  readonly algorithmCompleted: boolean;
  readonly hasNegativeDraftFaces: boolean;
  readonly hasUndeterminedFaces: boolean;
  readonly totalFaceCount: number;
  readonly analyzedFaceCount: number;
  readonly positiveDraftFaceCount: number;
  readonly zeroDraftFaceCount: number;
  readonly negativeDraftFaceCount: number;
  readonly undeterminedFaceCount: number;
  readonly minimumDraftAngleDegrees?: number;
  readonly maximumDraftAngleDegrees?: number;
  readonly meanDraftAngleDegrees?: number;
}

const assignIfDefined = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void => {
  if (value !== undefined) {
    target[key] = value;
  }
};

export const createDraftAnalysisBoundarySnapshot = (
  result: DraftAnalysisResult,
): DraftAnalysisBoundarySnapshot => {
  const signals = result.draftAnalysisSummarySignals;
  const snapshot: Record<string, unknown> = {
    source: "draft_analysis",
    status: result.status,
    algorithmCompleted: signals.algorithmCompleted,
    hasNegativeDraftFaces: signals.hasNegativeDraftFaces,
    hasUndeterminedFaces: signals.hasUndeterminedFaces,
    totalFaceCount: result.summary.totalFaceCount,
    analyzedFaceCount: result.summary.analyzedFaceCount,
    positiveDraftFaceCount: result.summary.positiveDraftFaceCount,
    zeroDraftFaceCount: result.summary.zeroDraftFaceCount,
    negativeDraftFaceCount: result.summary.negativeDraftFaceCount,
    undeterminedFaceCount: result.summary.undeterminedFaceCount,
  };

  assignIfDefined(
    snapshot,
    "minimumDraftAngleDegrees",
    result.summary.minimumDraftAngleDegrees,
  );
  assignIfDefined(
    snapshot,
    "maximumDraftAngleDegrees",
    result.summary.maximumDraftAngleDegrees,
  );
  assignIfDefined(
    snapshot,
    "meanDraftAngleDegrees",
    result.summary.meanDraftAngleDegrees,
  );

  return snapshot as unknown as DraftAnalysisBoundarySnapshot;
};

