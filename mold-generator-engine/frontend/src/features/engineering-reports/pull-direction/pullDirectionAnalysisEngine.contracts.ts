export const PULL_DIRECTION_ANALYSIS_ENGINE_ID = "pull-direction-analysis-engine";
export const PULL_DIRECTION_ANALYSIS_ENGINE_VERSION = "0.5.0-candidate-ranking-pipeline-report";

export type PullDirectionAnalysisSource =
  | "analysis-session"
  | "engine-bridge"
  | "mock"
  | "test";

export type PullDirectionAnalysisExecutionMode =
  | "candidate-generation-foundation"
  | "candidate-validator-pipeline-integration"
  | "candidate-filter-pipeline-integration"
  | "candidate-ranking-pipeline-report";

export type PullDirectionAnalysisStatus = "analysis-ready";

export type PullDirectionAnalysisPipelineStage =
  | "initialize"
  | "read-model-input"
  | "generate-seed-candidates"
  | "normalize-candidates"
  | "validate-candidates"
  | "filter-candidates"
  | "rank-candidates"
  | "build-report";

export type PullDirectionCandidateGenerationStrategy = "canonical-axis-seed";

export type PullDirectionAnalysisCandidateSource = "canonical-axis-seed";

export type PullDirectionCandidateValidationStatus = "valid" | "invalid";

export type PullDirectionCandidateValidationIssueCode =
  | "non-finite-vector-component"
  | "zero-length-vector"
  | "duplicate-direction";

export type PullDirectionCandidateFilteringStrategy = "validation-status-filter";

export type PullDirectionCandidateFilteringReasonCode =
  | "valid-candidate-included"
  | "invalid-candidate-excluded";

export interface PullDirectionAnalysisVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PullDirectionGeometryModelRef {
  readonly modelId: string;
  readonly fileName?: string;
  readonly unit?: string;
  readonly geometry?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PullDirectionAnalysisInput {
  readonly analysisSessionId?: string;
  readonly model: PullDirectionGeometryModelRef;
  readonly source: PullDirectionAnalysisSource;
  readonly mode?: PullDirectionAnalysisExecutionMode;
  readonly requestedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PullDirectionAnalysisStepTrace {
  readonly stage: PullDirectionAnalysisPipelineStage;
  readonly status: "completed";
  readonly message: string;
  readonly allowsRealGeometryComputation: false;
}

export interface PullDirectionAnalysisTrace {
  readonly engineId: typeof PULL_DIRECTION_ANALYSIS_ENGINE_ID;
  readonly engineVersion: typeof PULL_DIRECTION_ANALYSIS_ENGINE_VERSION;
  readonly mode: PullDirectionAnalysisExecutionMode;
  readonly steps: readonly PullDirectionAnalysisStepTrace[];
  readonly warnings: readonly string[];
}

export interface PullDirectionCandidateDirection {
  readonly id: string;
  readonly label: string;
  readonly vector: PullDirectionAnalysisVector3;
  readonly source: PullDirectionAnalysisCandidateSource;
  readonly strategy: PullDirectionCandidateGenerationStrategy;
  readonly coordinateSystem: "model-space";
  readonly requiresGeometryInspection: false;
  readonly score: null;
  readonly rank: null;
}

export interface PullDirectionCandidateGenerationInput {
  readonly model: PullDirectionGeometryModelRef;
  readonly strategy: PullDirectionCandidateGenerationStrategy;
}

export interface PullDirectionCandidateGenerationResult {
  readonly strategy: PullDirectionCandidateGenerationStrategy;
  readonly candidates: readonly PullDirectionCandidateDirection[];
  readonly inspectedMesh: false;
  readonly inspectedFaceNormals: false;
  readonly computedScores: false;
  readonly selectedBestDirection: false;
}

export interface PullDirectionCandidateGenerator {
  generate(input: PullDirectionCandidateGenerationInput): PullDirectionCandidateGenerationResult;
}

export interface PullDirectionCandidateValidationIssue {
  readonly code: PullDirectionCandidateValidationIssueCode;
  readonly message: string;
  readonly severity: "error";
}

export interface PullDirectionValidatedCandidate {
  readonly candidate: PullDirectionCandidateDirection;
  readonly normalizedVector: PullDirectionAnalysisVector3 | null;
  readonly magnitude: number;
  readonly status: PullDirectionCandidateValidationStatus;
  readonly issues: readonly PullDirectionCandidateValidationIssue[];
  readonly excludedFromFutureScoring: boolean;
}

export interface PullDirectionCandidateValidationInput {
  readonly candidates: readonly PullDirectionCandidateDirection[];
}

export interface PullDirectionCandidateValidationResult {
  readonly candidates: readonly PullDirectionValidatedCandidate[];
  readonly validCandidates: readonly PullDirectionValidatedCandidate[];
  readonly invalidCandidates: readonly PullDirectionValidatedCandidate[];
  readonly duplicateCandidateIds: readonly string[];
  readonly normalized: true;
  readonly inspectedMesh: false;
  readonly inspectedFaceNormals: false;
  readonly computedScores: false;
  readonly rankedCandidates: false;
  readonly selectedBestDirection: false;
}

export interface PullDirectionCandidateValidator {
  validate(input: PullDirectionCandidateValidationInput): PullDirectionCandidateValidationResult;
}

export interface PullDirectionFilteredCandidate {
  readonly validatedCandidate: PullDirectionValidatedCandidate;
  readonly includedForFutureScoring: boolean;
  readonly reasonCode: PullDirectionCandidateFilteringReasonCode;
  readonly message: string;
}

export interface PullDirectionCandidateFilteringInput {
  readonly validation: PullDirectionCandidateValidationResult;
  readonly strategy: PullDirectionCandidateFilteringStrategy;
}

export interface PullDirectionCandidateFilteringResult {
  readonly strategy: PullDirectionCandidateFilteringStrategy;
  readonly candidates: readonly PullDirectionFilteredCandidate[];
  readonly includedCandidates: readonly PullDirectionFilteredCandidate[];
  readonly excludedCandidates: readonly PullDirectionFilteredCandidate[];
  readonly inspectedMesh: false;
  readonly inspectedFaceNormals: false;
  readonly computedScores: false;
  readonly rankedCandidates: false;
  readonly selectedBestDirection: false;
}

export interface PullDirectionCandidateFilter {
  filter(input: PullDirectionCandidateFilteringInput): PullDirectionCandidateFilteringResult;
}

export interface PullDirectionAnalysisPipelineOutput {
  readonly trace: PullDirectionAnalysisTrace;
  readonly candidateGeneration: PullDirectionCandidateGenerationResult;
  readonly candidateValidation: PullDirectionCandidateValidationResult;
  readonly candidateFiltering: PullDirectionCandidateFilteringResult;
  readonly candidateRanking: PullDirectionCandidateRankingResult;
}

export interface PullDirectionAnalysisPipeline {
  execute(input: PullDirectionAnalysisInput): PullDirectionAnalysisPipelineOutput;
}

export interface PullDirectionReportBuildInput {
  readonly input: PullDirectionAnalysisInput;
  readonly trace: PullDirectionAnalysisTrace;
  readonly candidateGeneration: PullDirectionCandidateGenerationResult;
  readonly candidateValidation: PullDirectionCandidateValidationResult;
  readonly candidateFiltering: PullDirectionCandidateFilteringResult;
  readonly candidateRanking: PullDirectionCandidateRankingResult;
  readonly completedAt: string;
}

export interface PullDirectionReportOutputPort<TReport> {
  buildReport(input: PullDirectionReportBuildInput): TReport;
}

export interface PullDirectionAnalysisFoundationReport {
  readonly reportKind: "PullDirectionReport";
  readonly status: "Analysis Ready";
  readonly success: true;
  readonly algorithm: {
    readonly implemented: false;
    readonly candidateGeneration: true;
    readonly candidateNormalization: true;
    readonly candidateValidation: true;
    readonly candidateFiltering: true;
    readonly candidateRanking: true;
    readonly ranking: false;
    readonly scoring: false;
    readonly bestDirectionSelection: false;
  };
  readonly input: {
    readonly analysisSessionId?: string;
    readonly modelId: string;
    readonly fileName?: string;
    readonly source: PullDirectionAnalysisSource;
    readonly hasGeometryPayload: boolean;
  };
  readonly candidates: readonly PullDirectionCandidateDirection[];
  readonly validatedCandidates: readonly PullDirectionValidatedCandidate[];
  readonly invalidCandidates: readonly PullDirectionValidatedCandidate[];
  readonly filteredCandidates: readonly PullDirectionFilteredCandidate[];
  readonly includedCandidates: readonly PullDirectionFilteredCandidate[];
  readonly excludedCandidates: readonly PullDirectionFilteredCandidate[];
  readonly rankedCandidates: readonly PullDirectionRankedCandidate[];
  readonly unrankedCandidates: readonly PullDirectionRankedCandidate[];
  readonly selectedDirection: null;
  readonly pipelineTrace: PullDirectionAnalysisTrace;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PullDirectionAnalysisResult<TReport> {
  readonly status: PullDirectionAnalysisStatus;
  readonly report: TReport;
  readonly trace: PullDirectionAnalysisTrace;
}

export interface PullDirectionAnalysisEngine<TReport> {
  execute(input: PullDirectionAnalysisInput): PullDirectionAnalysisResult<TReport>;
}

export type PullDirectionCandidateRankingStrategy = "preserve-filtered-order";

export type PullDirectionCandidateRankingReasonCode =
  | "included-candidate-ranked"
  | "excluded-candidate-not-ranked";

export interface PullDirectionRankedCandidate {
  readonly filteredCandidate: PullDirectionFilteredCandidate;
  readonly rank: number | null;
  readonly score: null;
  readonly reasonCode: PullDirectionCandidateRankingReasonCode;
  readonly message: string;
  readonly selectedAsBestDirection: false;
}

export interface PullDirectionCandidateRankingInput {
  readonly filtering: PullDirectionCandidateFilteringResult;
  readonly strategy: PullDirectionCandidateRankingStrategy;
}

export interface PullDirectionCandidateRankingResult {
  readonly strategy: PullDirectionCandidateRankingStrategy;
  readonly candidates: readonly PullDirectionRankedCandidate[];
  readonly rankedCandidates: readonly PullDirectionRankedCandidate[];
  readonly unrankedCandidates: readonly PullDirectionRankedCandidate[];
  readonly preservesInputOrder: true;
  readonly usesRealScoring: false;
  readonly inspectedMesh: false;
  readonly inspectedFaceNormals: false;
  readonly computedScores: false;
  readonly selectedBestDirection: false;
}

export interface PullDirectionCandidateRanker {
  rank(input: PullDirectionCandidateRankingInput): PullDirectionCandidateRankingResult;
}



