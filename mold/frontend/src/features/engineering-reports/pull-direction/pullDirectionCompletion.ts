export type PullDirectionCompletionStatus = 'Good' | 'Review' | 'Poor';

export type PullDirectionVector3 = readonly [number, number, number];

export interface PullDirectionCompletionCandidate {
  readonly id: string;
  readonly direction: PullDirectionVector3;
  readonly label?: string;
  readonly rank?: number | null;
  readonly score?: number | null;
  readonly preliminaryScore?: number | null;
  readonly engineeringScore?: number | null;
  readonly isValid?: boolean;
  readonly isFilteredOut?: boolean;
  readonly warnings?: readonly string[];
}

export interface PullDirectionCompletionResult {
  readonly status: PullDirectionCompletionStatus;
  readonly confidenceScore: number;
  readonly selectedCandidate: PullDirectionCompletionCandidate | null;
  readonly alternatives: readonly PullDirectionCompletionCandidate[];
  readonly warnings: readonly string[];
  readonly summary: string;
}

const HIGH_CONFIDENCE_THRESHOLD = 82;
const REVIEW_CONFIDENCE_THRESHOLD = 55;
const SMALL_MARGIN_THRESHOLD = 8;

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function isSelectableCandidate(
  candidate: PullDirectionCompletionCandidate,
): boolean {
  return candidate.isValid !== false && candidate.isFilteredOut !== true;
}

function resolveCandidateScore(
  candidate: PullDirectionCompletionCandidate,
): number {
  const score =
    candidate.score ??
    candidate.preliminaryScore ??
    candidate.engineeringScore ??
    null;

  if (score === null || !Number.isFinite(score)) {
    return 0;
  }

  return score;
}

function normalizeScoreToConfidence(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  if (score <= 1) {
    return clampConfidence(score * 100);
  }

  return clampConfidence(score);
}

function sortCandidates(
  candidates: readonly PullDirectionCompletionCandidate[],
): PullDirectionCompletionCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftRank = left.rank ?? Number.POSITIVE_INFINITY;
    const rightRank = right.rank ?? Number.POSITIVE_INFINITY;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return resolveCandidateScore(right) - resolveCandidateScore(left);
  });
}

function uniqueWarnings(warnings: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const warning of warnings) {
    const normalizedWarning = warning.trim();

    if (normalizedWarning.length === 0 || seen.has(normalizedWarning)) {
      continue;
    }

    seen.add(normalizedWarning);
    result.push(normalizedWarning);
  }

  return result;
}

function resolveStatus(confidenceScore: number): PullDirectionCompletionStatus {
  if (confidenceScore >= HIGH_CONFIDENCE_THRESHOLD) {
    return 'Good';
  }

  if (confidenceScore >= REVIEW_CONFIDENCE_THRESHOLD) {
    return 'Review';
  }

  return 'Poor';
}

function buildSummary(params: {
  status: PullDirectionCompletionStatus;
  selectedCandidate: PullDirectionCompletionCandidate | null;
  confidenceScore: number;
}): string {
  if (params.selectedCandidate === null) {
    return 'No usable pull direction could be selected.';
  }

  if (params.status === 'Good') {
    return `Best pull direction selected with ${params.confidenceScore}% confidence.`;
  }

  if (params.status === 'Review') {
    return `Pull direction selected with ${params.confidenceScore}% confidence. Review is recommended before mold generation.`;
  }

  return `Pull direction confidence is low at ${params.confidenceScore}%. Mold generation should proceed carefully.`;
}

export function completePullDirection(
  candidates: readonly PullDirectionCompletionCandidate[],
): PullDirectionCompletionResult {
  const selectableCandidates = sortCandidates(candidates.filter(isSelectableCandidate));

  if (selectableCandidates.length === 0) {
    return {
      status: 'Poor',
      confidenceScore: 0,
      selectedCandidate: null,
      alternatives: [],
      warnings: ['No valid pull direction candidates are available.'],
      summary: 'No usable pull direction could be selected.',
    };
  }

  const selectedCandidate = selectableCandidates[0]!;
  const alternatives = selectableCandidates.slice(1);
  const selectedConfidence = normalizeScoreToConfidence(
    resolveCandidateScore(selectedCandidate),
  );

  const runnerUp = alternatives[0] ?? null;
  const runnerUpConfidence =
    runnerUp === null
      ? null
      : normalizeScoreToConfidence(resolveCandidateScore(runnerUp));

  const warnings: string[] = [...(selectedCandidate.warnings ?? [])];

  if (runnerUpConfidence !== null) {
    const confidenceMargin = selectedConfidence - runnerUpConfidence;

    if (confidenceMargin < SMALL_MARGIN_THRESHOLD) {
      warnings.push(
        'Top pull direction is close to another candidate; manual review is recommended.',
      );
    }
  }

  if (selectedConfidence < REVIEW_CONFIDENCE_THRESHOLD) {
    warnings.push('Selected pull direction has low confidence.');
  }

  if (selectedConfidence < HIGH_CONFIDENCE_THRESHOLD) {
    warnings.push('Pull direction should be reviewed before final mold generation.');
  }

  const status = resolveStatus(selectedConfidence);

  return {
    status,
    confidenceScore: selectedConfidence,
    selectedCandidate,
    alternatives,
    warnings: uniqueWarnings(warnings),
    summary: buildSummary({
      status,
      selectedCandidate,
      confidenceScore: selectedConfidence,
    }),
  };
}



