import {
  runPullDirectionEvaluationPipeline,
  type PullDirectionEvaluationPipelineResult,
} from "./pullDirectionEvaluationPipeline";
import type {
  PullDirectionCandidateEvaluation,
  PullDirectionEvaluationDecision,
  PullDirectionEvaluationResult,
  PullDirectionVector3,
} from "./pullDirectionEvaluation.types";
import type {
  PullDirectionEvaluationSummary,
  PullDirectionEvaluationSummaryMessage,
} from "./pullDirectionEvaluationSummary";
import type { PullDirectionRankedCandidateLike } from "./pullDirectionEvaluationAdapter";

export type PullDirectionEvaluationReportStatus =
  | "ready"
  | "review_required"
  | "blocked";

export interface PullDirectionEvaluationReportInput {
  readonly rankedCandidates: readonly PullDirectionRankedCandidateLike[];
}

export interface PullDirectionEvaluationBestCandidate {
  readonly candidateId: string;
  readonly score: number;
  readonly decision: PullDirectionEvaluationDecision;
  readonly normalizedDirection: PullDirectionVector3 | null;
}

export interface PullDirectionEvaluationReportSection {
  readonly status: PullDirectionEvaluationReportStatus;
  readonly summary: PullDirectionEvaluationSummary;
  readonly evaluations: readonly PullDirectionCandidateEvaluation[];
  readonly bestCandidate: PullDirectionEvaluationBestCandidate | null;
  readonly messages: readonly PullDirectionEvaluationSummaryMessage[];
}

export const resolvePullDirectionEvaluationReportStatus = (
  summary: PullDirectionEvaluationSummary,
): PullDirectionEvaluationReportStatus => {
  if (summary.bestCandidateDecision === null) {
    return "blocked";
  }

  if (
    summary.bestCandidateDecision === "weak" ||
    summary.rejectedCandidates > 0
  ) {
    return "review_required";
  }

  return "ready";
};

const findBestCandidateEvaluation = (
  evaluationResult: PullDirectionEvaluationResult,
): PullDirectionCandidateEvaluation | null => {
  if (evaluationResult.bestCandidateId === null) {
    return null;
  }

  return (
    evaluationResult.evaluations.find((evaluation) => {
      return evaluation.candidateId === evaluationResult.bestCandidateId;
    }) ?? null
  );
};

const createBestCandidate = (
  evaluationResult: PullDirectionEvaluationResult,
): PullDirectionEvaluationBestCandidate | null => {
  const bestEvaluation = findBestCandidateEvaluation(evaluationResult);

  if (bestEvaluation === null) {
    return null;
  }

  return {
    candidateId: bestEvaluation.candidateId,
    score: bestEvaluation.score,
    decision: bestEvaluation.decision,
    normalizedDirection: bestEvaluation.normalizedDirection,
  };
};

export const createPullDirectionEvaluationReportSection = (
  pipelineResult: PullDirectionEvaluationPipelineResult,
): PullDirectionEvaluationReportSection => {
  return {
    status: resolvePullDirectionEvaluationReportStatus(pipelineResult.summary),
    summary: pipelineResult.summary,
    evaluations: pipelineResult.evaluationResult.evaluations,
    bestCandidate: createBestCandidate(pipelineResult.evaluationResult),
    messages: pipelineResult.summary.messages,
  };
};

export const buildPullDirectionEvaluationReportSection = (
  input: PullDirectionEvaluationReportInput,
): PullDirectionEvaluationReportSection => {
  const pipelineResult = runPullDirectionEvaluationPipeline({
    rankedCandidates: input.rankedCandidates,
  });

  return createPullDirectionEvaluationReportSection(pipelineResult);
};

