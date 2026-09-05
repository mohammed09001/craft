import {
  buildPullDirectionEvaluationReportSection,
  createPullDirectionEvaluationReportSection,
  type PullDirectionEvaluationReportSection,
} from "./pullDirectionEvaluationReportBridge";
import {
  createPullDirectionEvaluationInput,
  type PullDirectionRankedCandidateLike,
} from "./pullDirectionEvaluationAdapter";
import { evaluatePullDirectionCandidates } from "./pullDirectionEvaluation";
import type { PullDirectionEvaluationScoreProfile } from "./pullDirectionEvaluationScoring";
import { summarizePullDirectionEvaluation } from "./pullDirectionEvaluationSummary";

export interface PullDirectionEvaluationFacadeInput {
  readonly rankedCandidates: readonly PullDirectionRankedCandidateLike[];
  readonly scoreProfile?: PullDirectionEvaluationScoreProfile | undefined;
}

export interface PullDirectionEvaluationFacadeResult {
  readonly reportSection: PullDirectionEvaluationReportSection;
}

export const evaluatePullDirectionForEngineeringReport = (
  input: PullDirectionEvaluationFacadeInput,
): PullDirectionEvaluationFacadeResult => {
  if (input.scoreProfile === undefined) {
    return {
      reportSection: buildPullDirectionEvaluationReportSection({
        rankedCandidates: input.rankedCandidates,
      }),
    };
  }

  const evaluationInput = createPullDirectionEvaluationInput({
    rankedCandidates: input.rankedCandidates,
  });
  const evaluationResult = evaluatePullDirectionCandidates(evaluationInput, {
    scoreProfile: input.scoreProfile,
  });
  const summary = summarizePullDirectionEvaluation(evaluationResult);

  return {
    reportSection: createPullDirectionEvaluationReportSection({
      evaluationInput,
      evaluationResult,
      summary,
    }),
  };
};

