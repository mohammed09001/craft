import type {
  PullDirectionCandidateEvaluation,
  PullDirectionEvaluationDecision,
  PullDirectionEvaluationResult,
} from "./pullDirectionEvaluation.types";

export type PullDirectionEvaluationSummarySeverity =
  | "info"
  | "warning"
  | "error";

export interface PullDirectionEvaluationDecisionCounts {
  readonly recommended: number;
  readonly usable: number;
  readonly weak: number;
  readonly rejected: number;
}

export interface PullDirectionEvaluationSummaryMessage {
  readonly severity: PullDirectionEvaluationSummarySeverity;
  readonly code:
    | "no_candidates"
    | "no_usable_candidate"
    | "recommended_candidate_available"
    | "usable_candidate_available"
    | "weak_best_candidate"
    | "rejected_candidates_present";
  readonly message: string;
}

export interface PullDirectionEvaluationSummary {
  readonly totalCandidates: number;
  readonly evaluatedCandidates: number;
  readonly recommendedCandidates: number;
  readonly usableCandidates: number;
  readonly weakCandidates: number;
  readonly rejectedCandidates: number;
  readonly bestCandidateId: string | null;
  readonly bestCandidateScore: number | null;
  readonly bestCandidateDecision: PullDirectionEvaluationDecision | null;
  readonly decisionCounts: PullDirectionEvaluationDecisionCounts;
  readonly messages: readonly PullDirectionEvaluationSummaryMessage[];
}

const createEmptyDecisionCounts = (): PullDirectionEvaluationDecisionCounts => {
  return {
    recommended: 0,
    usable: 0,
    weak: 0,
    rejected: 0,
  };
};

const countDecisions = (
  evaluations: readonly PullDirectionCandidateEvaluation[],
): PullDirectionEvaluationDecisionCounts => {
  const counts = createEmptyDecisionCounts();

  return evaluations.reduce<PullDirectionEvaluationDecisionCounts>(
    (currentCounts, evaluation) => {
      return {
        ...currentCounts,
        [evaluation.decision]: currentCounts[evaluation.decision] + 1,
      };
    },
    counts,
  );
};

const findBestEvaluation = (
  result: PullDirectionEvaluationResult,
): PullDirectionCandidateEvaluation | null => {
  if (result.bestCandidateId === null) {
    return null;
  }

  return (
    result.evaluations.find(
      (evaluation) => evaluation.candidateId === result.bestCandidateId,
    ) ?? null
  );
};

const createSummaryMessages = (
  totalCandidates: number,
  decisionCounts: PullDirectionEvaluationDecisionCounts,
  bestEvaluation: PullDirectionCandidateEvaluation | null,
): PullDirectionEvaluationSummaryMessage[] => {
  const messages: PullDirectionEvaluationSummaryMessage[] = [];

  if (totalCandidates === 0) {
    messages.push({
      severity: "warning",
      code: "no_candidates",
      message: "No pull direction candidates were available for evaluation.",
    });

    return messages;
  }

  if (bestEvaluation === null) {
    messages.push({
      severity: "error",
      code: "no_usable_candidate",
      message:
        "No usable pull direction candidate was found. Additional geometric analysis is required.",
    });
  } else if (bestEvaluation.decision === "recommended") {
    messages.push({
      severity: "info",
      code: "recommended_candidate_available",
      message:
        "A recommended pull direction candidate is available for downstream engineering analysis.",
    });
  } else if (bestEvaluation.decision === "usable") {
    messages.push({
      severity: "info",
      code: "usable_candidate_available",
      message:
        "A usable pull direction candidate is available, but it is not yet classified as strongly recommended.",
    });
  } else if (bestEvaluation.decision === "weak") {
    messages.push({
      severity: "warning",
      code: "weak_best_candidate",
      message:
        "The best available pull direction candidate is weak and should be reviewed before downstream use.",
    });
  }

  if (decisionCounts.rejected > 0) {
    messages.push({
      severity: "warning",
      code: "rejected_candidates_present",
      message:
        "One or more pull direction candidates were rejected during evaluation.",
    });
  }

  return messages;
};

export const summarizePullDirectionEvaluation = (
  result: PullDirectionEvaluationResult,
): PullDirectionEvaluationSummary => {
  const totalCandidates = result.evaluations.length;
  const decisionCounts = countDecisions(result.evaluations);
  const bestEvaluation = findBestEvaluation(result);

  return {
    totalCandidates,
    evaluatedCandidates: totalCandidates,
    recommendedCandidates: decisionCounts.recommended,
    usableCandidates: decisionCounts.usable,
    weakCandidates: decisionCounts.weak,
    rejectedCandidates: decisionCounts.rejected,
    bestCandidateId: bestEvaluation?.candidateId ?? null,
    bestCandidateScore: bestEvaluation?.score ?? null,
    bestCandidateDecision: bestEvaluation?.decision ?? null,
    decisionCounts,
    messages: createSummaryMessages(
      totalCandidates,
      decisionCounts,
      bestEvaluation,
    ),
  };
};

