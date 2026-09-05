import {
  createPullDirectionEvaluationInput,
  type PullDirectionEvaluationAdapterInput,
} from "./pullDirectionEvaluationAdapter";
import { evaluatePullDirectionCandidates } from "./pullDirectionEvaluation";
import {
  summarizePullDirectionEvaluation,
  type PullDirectionEvaluationSummary,
} from "./pullDirectionEvaluationSummary";
import type {
  PullDirectionEvaluationInput,
  PullDirectionEvaluationResult,
} from "./pullDirectionEvaluation.types";

export type PullDirectionEvaluationPipelineInput =
  PullDirectionEvaluationAdapterInput;

export interface PullDirectionEvaluationPipelineResult {
  readonly evaluationInput: PullDirectionEvaluationInput;
  readonly evaluationResult: PullDirectionEvaluationResult;
  readonly summary: PullDirectionEvaluationSummary;
}

export const runPullDirectionEvaluationPipeline = (
  input: PullDirectionEvaluationPipelineInput,
): PullDirectionEvaluationPipelineResult => {
  const evaluationInput = createPullDirectionEvaluationInput(input);
  const evaluationResult = evaluatePullDirectionCandidates(evaluationInput);
  const summary = summarizePullDirectionEvaluation(evaluationResult);

  return {
    evaluationInput,
    evaluationResult,
    summary,
  };
};

