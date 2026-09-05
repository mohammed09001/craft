import type {
  PullDirectionCandidateEvaluation,
  PullDirectionEvaluationCandidate,
  PullDirectionEvaluationInput,
  PullDirectionEvaluationReason,
  PullDirectionEvaluationResult,
  PullDirectionVector3,
} from "./pullDirectionEvaluation.types";
import {
  calculatePullDirectionEvaluationScore,
  clampPullDirectionEvaluationScore,
  DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE,
  resolvePullDirectionEvaluationDecision,
  type PullDirectionEvaluationScoreProfile,
} from "./pullDirectionEvaluationScoring";

export interface PullDirectionEvaluationOptions {
  readonly scoreProfile?: PullDirectionEvaluationScoreProfile | undefined;
}

const calculateVectorLength = (direction: PullDirectionVector3): number | null => {
  const { x, y, z } = direction;

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return Math.sqrt(x * x + y * y + z * z);
};

const normalizeDirection = (
  direction: PullDirectionVector3,
  length: number,
): PullDirectionVector3 => {
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
};

const createReason = (
  code: PullDirectionEvaluationReason["code"],
  message: string,
  impact: PullDirectionEvaluationReason["impact"],
): PullDirectionEvaluationReason => {
  return {
    code,
    message,
    impact,
  };
};

const evaluateConfidence = (
  candidate: PullDirectionEvaluationCandidate,
  reasons: PullDirectionEvaluationReason[],
  scoreProfile: PullDirectionEvaluationScoreProfile,
): number => {
  if (candidate.confidence === undefined) {
    reasons.push(
      createReason(
        "confidence_missing",
        "No confidence value was provided for this pull direction candidate.",
        "neutral",
      ),
    );

    return scoreProfile.defaultConfidence;
  }

  const clampedConfidence = clampPullDirectionEvaluationScore(
    candidate.confidence,
    {
      ...scoreProfile,
      minScore: 0,
      maxScore: 1,
    },
  );

  if (clampedConfidence !== candidate.confidence) {
    reasons.push(
      createReason(
        "confidence_clamped",
        "The candidate confidence value was outside the 0..1 range and was clamped.",
        "neutral",
      ),
    );
  } else {
    reasons.push(
      createReason(
        "confidence_available",
        "A confidence value was available for this candidate.",
        "positive",
      ),
    );
  }

  return clampedConfidence;
};

const evaluateSourcePriority = (
  candidate: PullDirectionEvaluationCandidate,
  reasons: PullDirectionEvaluationReason[],
  scoreProfile: PullDirectionEvaluationScoreProfile,
): number => {
  if (candidate.sourcePriority === undefined) {
    return 0;
  }

  const sourcePriority = clampPullDirectionEvaluationScore(
    candidate.sourcePriority,
    {
      ...scoreProfile,
      minScore: 0,
      maxScore: 1,
    },
  );

  if (sourcePriority > 0) {
    reasons.push(
      createReason(
        "source_priority_applied",
        "A source priority value was applied during evaluation.",
        "positive",
      ),
    );
  }

  return sourcePriority;
};

export const evaluatePullDirectionCandidate = (
  candidate: PullDirectionEvaluationCandidate,
  options: PullDirectionEvaluationOptions = {},
): PullDirectionCandidateEvaluation => {
  const scoreProfile =
    options.scoreProfile ?? DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE;
  const reasons: PullDirectionEvaluationReason[] = [];

  if (candidate.isValid === false) {
    reasons.push(
      createReason(
        "candidate_invalid",
        "The candidate was marked invalid by an earlier validation stage.",
        "negative",
      ),
    );

    return {
      candidateId: candidate.id,
      originalDirection: candidate.direction,
      normalizedDirection: null,
      vectorLength: null,
      score: scoreProfile.minScore,
      decision: "rejected",
      reasons,
    };
  }

  reasons.push(
    createReason(
      "candidate_valid",
      "The candidate is available for pull direction evaluation.",
      "positive",
    ),
  );

  const vectorLength = calculateVectorLength(candidate.direction);

  if (vectorLength === null) {
    reasons.push(
      createReason(
        "direction_vector_not_finite",
        "The direction vector contains a non-finite numeric value.",
        "negative",
      ),
    );

    return {
      candidateId: candidate.id,
      originalDirection: candidate.direction,
      normalizedDirection: null,
      vectorLength: null,
      score: scoreProfile.minScore,
      decision: "rejected",
      reasons,
    };
  }

  if (vectorLength <= scoreProfile.minVectorLength) {
    reasons.push(
      createReason(
        "direction_vector_zero_length",
        "The direction vector length is too small to be evaluated safely.",
        "negative",
      ),
    );

    return {
      candidateId: candidate.id,
      originalDirection: candidate.direction,
      normalizedDirection: null,
      vectorLength,
      score: scoreProfile.minScore,
      decision: "rejected",
      reasons,
    };
  }

  reasons.push(
    createReason(
      "direction_vector_valid",
      "The direction vector is finite and has a usable length.",
      "positive",
    ),
  );

  const normalizedDirection = normalizeDirection(candidate.direction, vectorLength);

  reasons.push(
    createReason(
      "normalized_direction_created",
      "A normalized direction vector was created for stable downstream evaluation.",
      "positive",
    ),
  );

  const confidenceScore = evaluateConfidence(candidate, reasons, scoreProfile);
  const sourcePriorityScore = evaluateSourcePriority(
    candidate,
    reasons,
    scoreProfile,
  );
  const finalScore = calculatePullDirectionEvaluationScore(
    confidenceScore,
    sourcePriorityScore,
    scoreProfile,
  );

  return {
    candidateId: candidate.id,
    originalDirection: candidate.direction,
    normalizedDirection,
    vectorLength,
    score: finalScore,
    decision: resolvePullDirectionEvaluationDecision(finalScore, scoreProfile),
    reasons,
  };
};

export const evaluatePullDirectionCandidates = (
  input: PullDirectionEvaluationInput,
  options: PullDirectionEvaluationOptions = {},
): PullDirectionEvaluationResult => {
  const evaluations = input.candidates
    .map((candidate) => evaluatePullDirectionCandidate(candidate, options))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.candidateId.localeCompare(right.candidateId);
    });

  const bestCandidate = evaluations.find(
    (evaluation) => evaluation.decision !== "rejected",
  );

  return {
    evaluations,
    bestCandidateId: bestCandidate?.candidateId ?? null,
    recommendedCandidateIds: evaluations
      .filter((evaluation) => evaluation.decision === "recommended")
      .map((evaluation) => evaluation.candidateId),
  };
};

