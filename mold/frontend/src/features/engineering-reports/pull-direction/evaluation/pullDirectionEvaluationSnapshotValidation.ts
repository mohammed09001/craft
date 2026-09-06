import type {
  PullDirectionCandidateEvaluationSnapshot,
  PullDirectionEvaluationBestCandidateSnapshot,
  PullDirectionEvaluationReportSnapshot,
  PullDirectionEvaluationSummarySnapshot,
  PullDirectionEvaluationVectorSnapshot,
} from "./pullDirectionEvaluationSnapshot";

export type PullDirectionEvaluationSnapshotValidationSeverity =
  | "error"
  | "warning";

export interface PullDirectionEvaluationSnapshotValidationIssue {
  readonly severity: PullDirectionEvaluationSnapshotValidationSeverity;
  readonly path: string;
  readonly message: string;
}

export interface PullDirectionEvaluationSnapshotValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly PullDirectionEvaluationSnapshotValidationIssue[];
}

const createIssue = (
  severity: PullDirectionEvaluationSnapshotValidationSeverity,
  path: string,
  message: string,
): PullDirectionEvaluationSnapshotValidationIssue => {
  return {
    severity,
    path,
    message,
  };
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const validateFiniteNumber = (
  value: unknown,
  path: string,
  issues: PullDirectionEvaluationSnapshotValidationIssue[],
): void => {
  if (!isFiniteNumber(value)) {
    issues.push(
      createIssue("error", path, "Expected a finite numeric value."),
    );
  }
};

const validateNullableFiniteNumber = (
  value: unknown,
  path: string,
  issues: PullDirectionEvaluationSnapshotValidationIssue[],
): void => {
  if (value === null) {
    return;
  }

  validateFiniteNumber(value, path, issues);
};

const validateNonNegativeInteger = (
  value: unknown,
  path: string,
  issues: PullDirectionEvaluationSnapshotValidationIssue[],
): void => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    issues.push(
      createIssue("error", path, "Expected a non-negative integer value."),
    );
  }
};

const validateVectorSnapshot = (
  vector: PullDirectionEvaluationVectorSnapshot,
  path: string,
  issues: PullDirectionEvaluationSnapshotValidationIssue[],
): void => {
  validateFiniteNumber(vector.x, `${path}.x`, issues);
  validateFiniteNumber(vector.y, `${path}.y`, issues);
  validateFiniteNumber(vector.z, `${path}.z`, issues);
};

const validateNullableVectorSnapshot = (
  vector: PullDirectionEvaluationVectorSnapshot | null,
  path: string,
  issues: PullDirectionEvaluationSnapshotValidationIssue[],
): void => {
  if (vector === null) {
    return;
  }

  validateVectorSnapshot(vector, path, issues);
};

const validateBestCandidateSnapshot = (
  bestCandidate: PullDirectionEvaluationBestCandidateSnapshot | null,
  path: string,
  issues: PullDirectionEvaluationSnapshotValidationIssue[],
): void => {
  if (bestCandidate === null) {
    return;
  }

  if (bestCandidate.candidateId.trim().length === 0) {
    issues.push(
      createIssue("error", `${path}.candidateId`, "Expected a non-empty candidate id."),
    );
  }

  validateFiniteNumber(bestCandidate.score, `${path}.score`, issues);
  validateNullableVectorSnapshot(
    bestCandidate.normalizedDirection,
    `${path}.normalizedDirection`,
    issues,
  );
};

const validateSummarySnapshot = (
  summary: PullDirectionEvaluationSummarySnapshot,
  path: string,
  issues: PullDirectionEvaluationSnapshotValidationIssue[],
): void => {
  validateNonNegativeInteger(summary.totalCandidates, `${path}.totalCandidates`, issues);
  validateNonNegativeInteger(
    summary.evaluatedCandidates,
    `${path}.evaluatedCandidates`,
    issues,
  );
  validateNonNegativeInteger(
    summary.recommendedCandidates,
    `${path}.recommendedCandidates`,
    issues,
  );
  validateNonNegativeInteger(summary.usableCandidates, `${path}.usableCandidates`, issues);
  validateNonNegativeInteger(summary.weakCandidates, `${path}.weakCandidates`, issues);
  validateNonNegativeInteger(
    summary.rejectedCandidates,
    `${path}.rejectedCandidates`,
    issues,
  );
  validateNullableFiniteNumber(
    summary.bestCandidateScore,
    `${path}.bestCandidateScore`,
    issues,
  );

  validateNonNegativeInteger(
    summary.decisionCounts.recommended,
    `${path}.decisionCounts.recommended`,
    issues,
  );
  validateNonNegativeInteger(
    summary.decisionCounts.usable,
    `${path}.decisionCounts.usable`,
    issues,
  );
  validateNonNegativeInteger(
    summary.decisionCounts.weak,
    `${path}.decisionCounts.weak`,
    issues,
  );
  validateNonNegativeInteger(
    summary.decisionCounts.rejected,
    `${path}.decisionCounts.rejected`,
    issues,
  );

  const summedDecisionCounts =
    summary.decisionCounts.recommended +
    summary.decisionCounts.usable +
    summary.decisionCounts.weak +
    summary.decisionCounts.rejected;

  if (summedDecisionCounts !== summary.totalCandidates) {
    issues.push(
      createIssue(
        "warning",
        `${path}.decisionCounts`,
        "Decision counts do not add up to totalCandidates.",
      ),
    );
  }
};

const validateCandidateEvaluationSnapshot = (
  evaluation: PullDirectionCandidateEvaluationSnapshot,
  path: string,
  issues: PullDirectionEvaluationSnapshotValidationIssue[],
): void => {
  if (evaluation.candidateId.trim().length === 0) {
    issues.push(
      createIssue("error", `${path}.candidateId`, "Expected a non-empty candidate id."),
    );
  }

  validateVectorSnapshot(evaluation.originalDirection, `${path}.originalDirection`, issues);
  validateNullableVectorSnapshot(
    evaluation.normalizedDirection,
    `${path}.normalizedDirection`,
    issues,
  );
  validateNullableFiniteNumber(evaluation.vectorLength, `${path}.vectorLength`, issues);
  validateFiniteNumber(evaluation.score, `${path}.score`, issues);
};

export const validatePullDirectionEvaluationReportSnapshot = (
  snapshot: unknown,
): PullDirectionEvaluationSnapshotValidationResult => {
  const reportSnapshot = snapshot as PullDirectionEvaluationReportSnapshot;
  const issues: PullDirectionEvaluationSnapshotValidationIssue[] = [];

  validateSummarySnapshot(reportSnapshot.summary, "summary", issues);
  validateBestCandidateSnapshot(reportSnapshot.bestCandidate, "bestCandidate", issues);

  reportSnapshot.evaluations.forEach((evaluation, index) => {
    validateCandidateEvaluationSnapshot(
      evaluation,
      `evaluations.${index}`,
      issues,
    );
  });

  return {
    isValid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
};

