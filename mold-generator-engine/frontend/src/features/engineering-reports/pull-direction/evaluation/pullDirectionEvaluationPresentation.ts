import type {
  PullDirectionCandidateEvaluationSnapshot,
  PullDirectionEvaluationReportSnapshot,
  PullDirectionEvaluationSummaryMessageSnapshot,
  PullDirectionEvaluationVectorSnapshot,
} from "./pullDirectionEvaluationSnapshot";
import type {
  PullDirectionEvaluationDecision,
} from "./pullDirectionEvaluation.types";
import type {
  PullDirectionEvaluationReportStatus,
} from "./pullDirectionEvaluationReportBridge";

export type PullDirectionEvaluationPresentationTone =
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export interface PullDirectionEvaluationPresentationBadge {
  readonly label: string;
  readonly tone: PullDirectionEvaluationPresentationTone;
}

export interface PullDirectionEvaluationPresentationMessage {
  readonly label: string;
  readonly tone: PullDirectionEvaluationPresentationTone;
}

export interface PullDirectionEvaluationCandidatePresentation {
  readonly candidateId: string;
  readonly decision: PullDirectionEvaluationDecision;
  readonly decisionBadge: PullDirectionEvaluationPresentationBadge;
  readonly scoreLabel: string;
  readonly originalDirectionLabel: string;
  readonly normalizedDirectionLabel: string;
  readonly vectorLengthLabel: string;
  readonly reasonLabels: readonly string[];
}

export interface PullDirectionEvaluationPresentationSummary {
  readonly title: string;
  readonly subtitle: string;
  readonly statusBadge: PullDirectionEvaluationPresentationBadge;
  readonly bestCandidateLabel: string;
  readonly countLabel: string;
  readonly messages: readonly PullDirectionEvaluationPresentationMessage[];
}

export interface PullDirectionEvaluationPresentation {
  readonly summary: PullDirectionEvaluationPresentationSummary;
  readonly candidates: readonly PullDirectionEvaluationCandidatePresentation[];
}

const formatNumber = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return "N/A";
  }

  return Number.parseFloat(value.toFixed(6)).toString();
};

const formatScore = (value: number): string => {
  return `${formatNumber(value)}/100`;
};

const formatVector = (
  vector: PullDirectionEvaluationVectorSnapshot | null,
): string => {
  if (vector === null) {
    return "N/A";
  }

  return `(${formatNumber(vector.x)}, ${formatNumber(vector.y)}, ${formatNumber(
    vector.z,
  )})`;
};

const getStatusBadge = (
  status: PullDirectionEvaluationReportStatus,
): PullDirectionEvaluationPresentationBadge => {
  if (status === "ready") {
    return {
      label: "Ready",
      tone: "success",
    };
  }

  if (status === "review_required") {
    return {
      label: "Review required",
      tone: "warning",
    };
  }

  return {
    label: "Blocked",
    tone: "danger",
  };
};

const getDecisionBadge = (
  decision: PullDirectionEvaluationDecision,
): PullDirectionEvaluationPresentationBadge => {
  if (decision === "recommended") {
    return {
      label: "Recommended",
      tone: "success",
    };
  }

  if (decision === "usable") {
    return {
      label: "Usable",
      tone: "neutral",
    };
  }

  if (decision === "weak") {
    return {
      label: "Weak",
      tone: "warning",
    };
  }

  return {
    label: "Rejected",
    tone: "danger",
  };
};

const getMessageTone = (
  message: PullDirectionEvaluationSummaryMessageSnapshot,
): PullDirectionEvaluationPresentationTone => {
  if (message.severity === "error") {
    return "danger";
  }

  if (message.severity === "warning") {
    return "warning";
  }

  return "neutral";
};

const createSubtitle = (
  snapshot: PullDirectionEvaluationReportSnapshot,
): string => {
  if (snapshot.status === "ready") {
    return "Pull direction evaluation is ready for downstream engineering analysis.";
  }

  if (snapshot.status === "review_required") {
    return "Pull direction evaluation completed, but engineering review is required.";
  }

  return "Pull direction evaluation is blocked because no usable candidate is available.";
};

const createBestCandidateLabel = (
  snapshot: PullDirectionEvaluationReportSnapshot,
): string => {
  if (snapshot.bestCandidate === null) {
    return "No best candidate";
  }

  return `${snapshot.bestCandidate.candidateId} · ${
    getDecisionBadge(snapshot.bestCandidate.decision).label
  } · ${formatScore(snapshot.bestCandidate.score)}`;
};

const createCountLabel = (
  snapshot: PullDirectionEvaluationReportSnapshot,
): string => {
  return [
    `${snapshot.summary.totalCandidates} total`,
    `${snapshot.summary.recommendedCandidates} recommended`,
    `${snapshot.summary.usableCandidates} usable`,
    `${snapshot.summary.weakCandidates} weak`,
    `${snapshot.summary.rejectedCandidates} rejected`,
  ].join(" · ");
};

const createPresentationMessages = (
  snapshot: PullDirectionEvaluationReportSnapshot,
): PullDirectionEvaluationPresentationMessage[] => {
  return snapshot.messages.map((message) => {
    return {
      label: message.message,
      tone: getMessageTone(message),
    };
  });
};

const createCandidatePresentation = (
  candidate: PullDirectionCandidateEvaluationSnapshot,
): PullDirectionEvaluationCandidatePresentation => {
  return {
    candidateId: candidate.candidateId,
    decision: candidate.decision,
    decisionBadge: getDecisionBadge(candidate.decision),
    scoreLabel: formatScore(candidate.score),
    originalDirectionLabel: formatVector(candidate.originalDirection),
    normalizedDirectionLabel: formatVector(candidate.normalizedDirection),
    vectorLengthLabel: formatNumber(candidate.vectorLength),
    reasonLabels: candidate.reasons.map((reason) => {
      return `${reason.impact}: ${reason.message}`;
    }),
  };
};

export const createPullDirectionEvaluationPresentation = (
  snapshot: PullDirectionEvaluationReportSnapshot,
): PullDirectionEvaluationPresentation => {
  return {
    summary: {
      title: "Pull Direction Evaluation",
      subtitle: createSubtitle(snapshot),
      statusBadge: getStatusBadge(snapshot.status),
      bestCandidateLabel: createBestCandidateLabel(snapshot),
      countLabel: createCountLabel(snapshot),
      messages: createPresentationMessages(snapshot),
    },
    candidates: snapshot.evaluations.map(createCandidatePresentation),
  };
};

