import type {
  PullDirectionCandidateEvaluation,
  PullDirectionEvaluationReason,
  PullDirectionVector3,
} from "./pullDirectionEvaluation.types";
import type {
  PullDirectionEvaluationBestCandidate,
  PullDirectionEvaluationReportSection,
  PullDirectionEvaluationReportStatus,
} from "./pullDirectionEvaluationReportBridge";
import type {
  PullDirectionEvaluationSummary,
  PullDirectionEvaluationSummaryMessage,
} from "./pullDirectionEvaluationSummary";

export interface PullDirectionEvaluationVectorSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PullDirectionEvaluationReasonSnapshot {
  readonly code: PullDirectionEvaluationReason["code"];
  readonly impact: PullDirectionEvaluationReason["impact"];
  readonly message: string;
}

export interface PullDirectionCandidateEvaluationSnapshot {
  readonly candidateId: string;
  readonly originalDirection: PullDirectionEvaluationVectorSnapshot;
  readonly normalizedDirection: PullDirectionEvaluationVectorSnapshot | null;
  readonly vectorLength: number | null;
  readonly score: number;
  readonly decision: PullDirectionCandidateEvaluation["decision"];
  readonly reasons: readonly PullDirectionEvaluationReasonSnapshot[];
}

export interface PullDirectionEvaluationBestCandidateSnapshot {
  readonly candidateId: string;
  readonly score: number;
  readonly decision: PullDirectionEvaluationBestCandidate["decision"];
  readonly normalizedDirection: PullDirectionEvaluationVectorSnapshot | null;
}

export interface PullDirectionEvaluationSummaryMessageSnapshot {
  readonly severity: PullDirectionEvaluationSummaryMessage["severity"];
  readonly code: PullDirectionEvaluationSummaryMessage["code"];
  readonly message: string;
}

export interface PullDirectionEvaluationSummarySnapshot {
  readonly totalCandidates: number;
  readonly evaluatedCandidates: number;
  readonly recommendedCandidates: number;
  readonly usableCandidates: number;
  readonly weakCandidates: number;
  readonly rejectedCandidates: number;
  readonly bestCandidateId: string | null;
  readonly bestCandidateScore: number | null;
  readonly bestCandidateDecision: PullDirectionEvaluationSummary["bestCandidateDecision"];
  readonly decisionCounts: PullDirectionEvaluationSummary["decisionCounts"];
  readonly messages: readonly PullDirectionEvaluationSummaryMessageSnapshot[];
}

export interface PullDirectionEvaluationReportSnapshot {
  readonly status: PullDirectionEvaluationReportStatus;
  readonly summary: PullDirectionEvaluationSummarySnapshot;
  readonly bestCandidate: PullDirectionEvaluationBestCandidateSnapshot | null;
  readonly evaluations: readonly PullDirectionCandidateEvaluationSnapshot[];
  readonly messages: readonly PullDirectionEvaluationSummaryMessageSnapshot[];
}

const roundSnapshotNumber = (value: number): number => {
  return Math.round(value * 1_000_000) / 1_000_000;
};

const toVectorSnapshot = (
  vector: PullDirectionVector3,
): PullDirectionEvaluationVectorSnapshot => {
  return {
    x: roundSnapshotNumber(vector.x),
    y: roundSnapshotNumber(vector.y),
    z: roundSnapshotNumber(vector.z),
  };
};

const toNullableVectorSnapshot = (
  vector: PullDirectionVector3 | null,
): PullDirectionEvaluationVectorSnapshot | null => {
  if (vector === null) {
    return null;
  }

  return toVectorSnapshot(vector);
};

const toReasonSnapshot = (
  reason: PullDirectionEvaluationReason,
): PullDirectionEvaluationReasonSnapshot => {
  return {
    code: reason.code,
    impact: reason.impact,
    message: reason.message,
  };
};

const toMessageSnapshot = (
  message: PullDirectionEvaluationSummaryMessage,
): PullDirectionEvaluationSummaryMessageSnapshot => {
  return {
    severity: message.severity,
    code: message.code,
    message: message.message,
  };
};

const toCandidateEvaluationSnapshot = (
  evaluation: PullDirectionCandidateEvaluation,
): PullDirectionCandidateEvaluationSnapshot => {
  return {
    candidateId: evaluation.candidateId,
    originalDirection: toVectorSnapshot(evaluation.originalDirection),
    normalizedDirection: toNullableVectorSnapshot(evaluation.normalizedDirection),
    vectorLength:
      evaluation.vectorLength === null
        ? null
        : roundSnapshotNumber(evaluation.vectorLength),
    score: roundSnapshotNumber(evaluation.score),
    decision: evaluation.decision,
    reasons: evaluation.reasons.map(toReasonSnapshot),
  };
};

const toBestCandidateSnapshot = (
  bestCandidate: PullDirectionEvaluationBestCandidate | null,
): PullDirectionEvaluationBestCandidateSnapshot | null => {
  if (bestCandidate === null) {
    return null;
  }

  return {
    candidateId: bestCandidate.candidateId,
    score: roundSnapshotNumber(bestCandidate.score),
    decision: bestCandidate.decision,
    normalizedDirection: toNullableVectorSnapshot(bestCandidate.normalizedDirection),
  };
};

const toSummarySnapshot = (
  summary: PullDirectionEvaluationSummary,
): PullDirectionEvaluationSummarySnapshot => {
  return {
    totalCandidates: summary.totalCandidates,
    evaluatedCandidates: summary.evaluatedCandidates,
    recommendedCandidates: summary.recommendedCandidates,
    usableCandidates: summary.usableCandidates,
    weakCandidates: summary.weakCandidates,
    rejectedCandidates: summary.rejectedCandidates,
    bestCandidateId: summary.bestCandidateId,
    bestCandidateScore:
      summary.bestCandidateScore === null
        ? null
        : roundSnapshotNumber(summary.bestCandidateScore),
    bestCandidateDecision: summary.bestCandidateDecision,
    decisionCounts: summary.decisionCounts,
    messages: summary.messages.map(toMessageSnapshot),
  };
};

export const createPullDirectionEvaluationReportSnapshot = (
  reportSection: PullDirectionEvaluationReportSection,
): PullDirectionEvaluationReportSnapshot => {
  return {
    status: reportSection.status,
    summary: toSummarySnapshot(reportSection.summary),
    bestCandidate: toBestCandidateSnapshot(reportSection.bestCandidate),
    evaluations: reportSection.evaluations.map(toCandidateEvaluationSnapshot),
    messages: reportSection.messages.map(toMessageSnapshot),
  };
};

