import {
  PULL_DIRECTION_ANALYSIS_ENGINE_ID,
  PULL_DIRECTION_ANALYSIS_ENGINE_VERSION,
  type PullDirectionAnalysisInput,
  type PullDirectionAnalysisPipeline,
  type PullDirectionAnalysisPipelineOutput,
  type PullDirectionAnalysisPipelineStage,
  type PullDirectionAnalysisStepTrace,
  type PullDirectionCandidateFilter,
  type PullDirectionCandidateGenerator,
  type PullDirectionCandidateRanker,
  type PullDirectionCandidateValidator,
} from "./pullDirectionAnalysisEngine.contracts";
import { createValidationStatusCandidateFilter } from "./pullDirectionCandidateFilter";
import { createCanonicalAxisSeedCandidateGenerator } from "./pullDirectionCandidateGenerator";
import { createPreserveFilteredOrderCandidateRanker } from "./pullDirectionCandidateRanker";
import { createPullDirectionCandidateValidator } from "./pullDirectionCandidateValidator";

export interface PullDirectionAnalysisPipelineDependencies {
  readonly candidateGenerator?: PullDirectionCandidateGenerator;
  readonly candidateValidator?: PullDirectionCandidateValidator;
  readonly candidateFilter?: PullDirectionCandidateFilter;
  readonly candidateRanker?: PullDirectionCandidateRanker;
}

const createCompletedStep = (
  stage: PullDirectionAnalysisPipelineStage,
  message: string,
): PullDirectionAnalysisStepTrace => ({
  stage,
  status: "completed",
  message,
  allowsRealGeometryComputation: false,
});

export const createPullDirectionAnalysisPipeline = (
  dependencies: PullDirectionAnalysisPipelineDependencies = {},
): PullDirectionAnalysisPipeline => {
  const candidateGenerator =
    dependencies.candidateGenerator ?? createCanonicalAxisSeedCandidateGenerator();

  const candidateValidator =
    dependencies.candidateValidator ?? createPullDirectionCandidateValidator();

  const candidateFilter =
    dependencies.candidateFilter ?? createValidationStatusCandidateFilter();

  const candidateRanker =
    dependencies.candidateRanker ?? createPreserveFilteredOrderCandidateRanker();

  return {
    execute: (input: PullDirectionAnalysisInput): PullDirectionAnalysisPipelineOutput => {
      const candidateGeneration = candidateGenerator.generate({
        model: input.model,
        strategy: "canonical-axis-seed",
      });

      const candidateValidation = candidateValidator.validate({
        candidates: candidateGeneration.candidates,
      });

      const candidateFiltering = candidateFilter.filter({
        validation: candidateValidation,
        strategy: "validation-status-filter",
      });

      const candidateRanking = candidateRanker.rank({
        filtering: candidateFiltering,
        strategy: "preserve-filtered-order",
      });

      const steps: PullDirectionAnalysisStepTrace[] = [
        createCompletedStep("initialize", "Pull Direction analysis engine initialized."),
        createCompletedStep("read-model-input", "Model input reference accepted without mesh inspection."),
        createCompletedStep(
          "generate-seed-candidates",
          "Canonical axis seed candidates generated without mesh or face-normal analysis.",
        ),
        createCompletedStep(
          "normalize-candidates",
          "Candidate vectors normalized without geometry inspection.",
        ),
        createCompletedStep(
          "validate-candidates",
          "Candidate vectors validated without mesh or face-normal analysis.",
        ),
        createCompletedStep(
          "filter-candidates",
          "Candidate filtering separated included and excluded candidates without scoring.",
        ),
        createCompletedStep(
          "rank-candidates",
          "Candidate ranking foundation preserved filtered order without real scoring.",
        ),
        createCompletedStep("build-report", "Pipeline output prepared with ranking foundation output."),
      ];

      return {
        trace: {
          engineId: PULL_DIRECTION_ANALYSIS_ENGINE_ID,
          engineVersion: PULL_DIRECTION_ANALYSIS_ENGINE_VERSION,
          mode: "candidate-ranking-pipeline-report",
          steps,
          warnings: [],
        },
        candidateGeneration,
        candidateValidation,
        candidateFiltering,
        candidateRanking,
      };
    },
  };
};
