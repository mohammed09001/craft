import {
  PULL_DIRECTION_ANALYSIS_ENGINE_ID,
  PULL_DIRECTION_ANALYSIS_ENGINE_VERSION,
  type PullDirectionAnalysisEngine,
  type PullDirectionAnalysisFoundationReport,
  type PullDirectionAnalysisInput,
  type PullDirectionAnalysisPipeline,
  type PullDirectionAnalysisResult,
  type PullDirectionReportOutputPort,
} from "./pullDirectionAnalysisEngine.contracts";
import { createPullDirectionAnalysisPipeline } from "./pullDirectionAnalysisPipeline";

export interface PullDirectionAnalysisEngineDependencies<TReport> {
  readonly pipeline?: PullDirectionAnalysisPipeline;
  readonly reportOutputPort?: PullDirectionReportOutputPort<TReport>;
  readonly clock?: () => string;
}

export const createPullDirectionFoundationReportOutputPort =
  (): PullDirectionReportOutputPort<PullDirectionAnalysisFoundationReport> => ({
    buildReport: ({
      input,
      trace,
      candidateGeneration,
      candidateValidation,
      candidateFiltering,
      candidateRanking,
      completedAt,
    }): PullDirectionAnalysisFoundationReport => ({
      reportKind: "PullDirectionReport",
      status: "Analysis Ready",
      success: true,
      algorithm: {
        implemented: false,
        candidateGeneration: true,
        candidateNormalization: true,
        candidateValidation: true,
        candidateFiltering: true,
        candidateRanking: true,
        ranking: false,
        scoring: false,
        bestDirectionSelection: false,
      },
      input: {
        ...(input.analysisSessionId !== undefined
          ? { analysisSessionId: input.analysisSessionId }
          : {}),
        modelId: input.model.modelId,
        ...(input.model.fileName !== undefined ? { fileName: input.model.fileName } : {}),
        source: input.source,
        hasGeometryPayload: input.model.geometry !== undefined,
      },
      candidates: candidateGeneration.candidates,
      validatedCandidates: candidateValidation.validCandidates,
      invalidCandidates: candidateValidation.invalidCandidates,
      filteredCandidates: candidateFiltering.candidates,
      includedCandidates: candidateFiltering.includedCandidates,
      excludedCandidates: candidateFiltering.excludedCandidates,
      rankedCandidates: candidateRanking.rankedCandidates,
      unrankedCandidates: candidateRanking.unrankedCandidates,
      selectedDirection: null,
      pipelineTrace: trace,
      metadata: {
        engineId: PULL_DIRECTION_ANALYSIS_ENGINE_ID,
        engineVersion: PULL_DIRECTION_ANALYSIS_ENGINE_VERSION,
        executionMode: "candidate-filter-pipeline-integration",
        candidateGenerationStrategy: candidateGeneration.strategy,
        candidateFilteringStrategy: candidateFiltering.strategy,
        candidateRankingStrategy: candidateRanking.strategy,
        candidateCount: candidateGeneration.candidates.length,
        validatedCandidateCount: candidateValidation.candidates.length,
        validCandidateCount: candidateValidation.validCandidates.length,
        invalidCandidateCount: candidateValidation.invalidCandidates.length,
        filteredCandidateCount: candidateFiltering.candidates.length,
        includedCandidateCount: candidateFiltering.includedCandidates.length,
        excludedCandidateCount: candidateFiltering.excludedCandidates.length,
        rankedCandidateCount: candidateRanking.rankedCandidates.length,
        unrankedCandidateCount: candidateRanking.unrankedCandidates.length,
        usesRealScoring: candidateRanking.usesRealScoring,
        duplicateCandidateCount: candidateValidation.duplicateCandidateIds.length,
        normalized: candidateValidation.normalized,
        inspectedMesh: candidateFiltering.inspectedMesh,
        inspectedFaceNormals: candidateFiltering.inspectedFaceNormals,
        computedScores: candidateRanking.computedScores,
        rankedCandidates: candidateRanking.computedScores,
        selectedBestDirection: candidateRanking.selectedBestDirection,
        completedAt,
        stage: "Chapter 9 - Stage 5D-D",
      },
    }),
  });

export const createPullDirectionAnalysisEngine = <
  TReport = PullDirectionAnalysisFoundationReport,
>(
  dependencies: PullDirectionAnalysisEngineDependencies<TReport> = {},
): PullDirectionAnalysisEngine<TReport> => {
  const pipeline = dependencies.pipeline ?? createPullDirectionAnalysisPipeline();
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const reportOutputPort =
    dependencies.reportOutputPort ??
    (createPullDirectionFoundationReportOutputPort() as PullDirectionReportOutputPort<TReport>);

  return {
    execute: (input: PullDirectionAnalysisInput): PullDirectionAnalysisResult<TReport> => {
      const pipelineOutput = pipeline.execute(input);
      const report = reportOutputPort.buildReport({
        input,
        trace: pipelineOutput.trace,
        candidateGeneration: pipelineOutput.candidateGeneration,
        candidateValidation: pipelineOutput.candidateValidation,
        candidateFiltering: pipelineOutput.candidateFiltering,
        candidateRanking: pipelineOutput.candidateRanking,
        completedAt: clock(),
      });

      return {
        status: "analysis-ready",
        report,
        trace: pipelineOutput.trace,
      };
    },
  };
};

