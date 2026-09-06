/**
 * Draft Analysis Contracts
 *
 * Chapter 9 / Stage 8A-8B:
 * - Internal Draft Analysis data contracts.
 * - No heatmap.
 * - No Engineering Report.
 * - No dashboard.
 * - No user recommendation.
 * - Data is prepared for Chapter 10 integration.
 */

export const DRAFT_ANALYSIS_SCHEMA_VERSION = "draft-analysis/v1" as const;

export type DraftAnalysisSchemaVersion = typeof DRAFT_ANALYSIS_SCHEMA_VERSION;

export type DraftAnalysisStatus =
  | "pending_algorithm"
  | "completed"
  | "failed";

export type DraftAnalysisGeometrySource =
  | "stl_mesh"
  | "analysis_session"
  | "unknown";

export type DraftAnalysisDirectionSource =
  | "pull_direction_engine"
  | "manual"
  | "fallback"
  | "unknown";

export type DraftFaceBand =
  | "positive_draft"
  | "zero_draft"
  | "negative_draft"
  | "undetermined";

export interface DraftVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DraftAnalysisGeometryReference {
  readonly source: DraftAnalysisGeometrySource;
  readonly modelId?: string;
  readonly fileName?: string;
  readonly triangleCount?: number;
  readonly vertexCount?: number;
  readonly units?: string;
}

export interface DraftAnalysisPullDirection {
  readonly vector: DraftVector3;
  readonly source: DraftAnalysisDirectionSource;
  readonly confidence?: number;
}

export interface DraftAnalysisOptions {
  readonly zeroDraftToleranceDegrees: number;
  readonly maxStoredFaceSamples: number;
}

export interface DraftAnalysisFaceInput {
  readonly faceId: string;
  readonly normal: DraftVector3;
  readonly centroid?: DraftVector3;
  readonly area?: number;
}

export interface DraftAnalysisInput {
  readonly analysisSessionId?: string;
  readonly geometry: DraftAnalysisGeometryReference;
  readonly pullDirection: DraftAnalysisPullDirection;
  readonly options: DraftAnalysisOptions;
  readonly faces?: readonly DraftAnalysisFaceInput[];
}

export interface DraftFaceSample {
  readonly faceId: string;
  readonly normal?: DraftVector3;
  readonly centroid?: DraftVector3;
  readonly area?: number;
  readonly draftAngleDegrees?: number;
  readonly band: DraftFaceBand;
}

export interface DraftAnalysisSummary {
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

export interface DraftAnalysisSummarySignals {
  readonly hasNegativeDraftFaces: boolean;
  readonly hasUndeterminedFaces: boolean;
  readonly algorithmCompleted: boolean;
}

export interface DraftAnalysisResult {
  readonly kind: "draft_analysis";
  readonly schemaVersion: DraftAnalysisSchemaVersion;
  readonly status: DraftAnalysisStatus;
  readonly input: DraftAnalysisInput;
  readonly summary: DraftAnalysisSummary;
  readonly faceSamples: readonly DraftFaceSample[];
  readonly draftAnalysisSummarySignals: DraftAnalysisSummarySignals;
  readonly errors: readonly string[];
  readonly createdAt: string;
}

export interface DraftAnalysisEngine {
  analyze(input: DraftAnalysisInput): DraftAnalysisResult;
}

export const DEFAULT_DRAFT_ANALYSIS_OPTIONS: DraftAnalysisOptions = {
  zeroDraftToleranceDegrees: 0.25,
  maxStoredFaceSamples: 250,
};
