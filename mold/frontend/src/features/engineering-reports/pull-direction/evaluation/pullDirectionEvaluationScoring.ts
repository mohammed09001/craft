import type { PullDirectionEvaluationDecision } from "./pullDirectionEvaluation.types";

export interface PullDirectionEvaluationScoreThresholds {
  readonly recommended: number;
  readonly usable: number;
  readonly weak: number;
}

export interface PullDirectionEvaluationScoreWeights {
  readonly baseScore: number;
  readonly confidenceContribution: number;
  readonly sourcePriorityContribution: number;
}

export interface PullDirectionEvaluationScoreProfile {
  readonly minScore: number;
  readonly maxScore: number;
  readonly minVectorLength: number;
  readonly defaultConfidence: number;
  readonly precisionDecimals: number;
  readonly thresholds: PullDirectionEvaluationScoreThresholds;
  readonly weights: PullDirectionEvaluationScoreWeights;
}

export interface PullDirectionEvaluationScoreProfileInput {
  readonly minScore?: number;
  readonly maxScore?: number;
  readonly minVectorLength?: number;
  readonly defaultConfidence?: number;
  readonly precisionDecimals?: number;
  readonly thresholds?: Partial<PullDirectionEvaluationScoreThresholds>;
  readonly weights?: Partial<PullDirectionEvaluationScoreWeights>;
}

export const DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE: PullDirectionEvaluationScoreProfile =
  {
    minScore: 0,
    maxScore: 100,
    minVectorLength: 1e-9,
    defaultConfidence: 0.5,
    precisionDecimals: 2,
    thresholds: {
      recommended: 85,
      usable: 65,
      weak: 35,
    },
    weights: {
      baseScore: 55,
      confidenceContribution: 35,
      sourcePriorityContribution: 10,
    },
  };

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const readFiniteNumber = (value: unknown, fallback: number): number => {
  return isFiniteNumber(value) ? value : fallback;
};

export const createPullDirectionEvaluationScoreProfile = (
  input: PullDirectionEvaluationScoreProfileInput = {},
): PullDirectionEvaluationScoreProfile => {
  const defaultProfile = DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE;

  return {
    minScore: readFiniteNumber(input.minScore, defaultProfile.minScore),
    maxScore: readFiniteNumber(input.maxScore, defaultProfile.maxScore),
    minVectorLength: readFiniteNumber(
      input.minVectorLength,
      defaultProfile.minVectorLength,
    ),
    defaultConfidence: readFiniteNumber(
      input.defaultConfidence,
      defaultProfile.defaultConfidence,
    ),
    precisionDecimals: readFiniteNumber(
      input.precisionDecimals,
      defaultProfile.precisionDecimals,
    ),
    thresholds: {
      recommended: readFiniteNumber(
        input.thresholds?.recommended,
        defaultProfile.thresholds.recommended,
      ),
      usable: readFiniteNumber(
        input.thresholds?.usable,
        defaultProfile.thresholds.usable,
      ),
      weak: readFiniteNumber(
        input.thresholds?.weak,
        defaultProfile.thresholds.weak,
      ),
    },
    weights: {
      baseScore: readFiniteNumber(
        input.weights?.baseScore,
        defaultProfile.weights.baseScore,
      ),
      confidenceContribution: readFiniteNumber(
        input.weights?.confidenceContribution,
        defaultProfile.weights.confidenceContribution,
      ),
      sourcePriorityContribution: readFiniteNumber(
        input.weights?.sourcePriorityContribution,
        defaultProfile.weights.sourcePriorityContribution,
      ),
    },
  };
};

export const clampPullDirectionEvaluationScore = (
  value: number,
  profile: PullDirectionEvaluationScoreProfile = DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE,
): number => {
  if (!Number.isFinite(value)) {
    return profile.minScore;
  }

  return Math.min(profile.maxScore, Math.max(profile.minScore, value));
};

export const roundPullDirectionEvaluationScore = (
  value: number,
  profile: PullDirectionEvaluationScoreProfile = DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE,
): number => {
  const precision = 10 ** Math.max(0, profile.precisionDecimals);
  const clampedValue = clampPullDirectionEvaluationScore(value, profile);

  return Math.round(clampedValue * precision) / precision;
};

export const calculatePullDirectionEvaluationScore = (
  confidenceScore: number,
  sourcePriorityScore: number,
  profile: PullDirectionEvaluationScoreProfile = DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE,
): number => {
  const rawScore =
    profile.weights.baseScore +
    confidenceScore * profile.weights.confidenceContribution +
    sourcePriorityScore * profile.weights.sourcePriorityContribution;

  return roundPullDirectionEvaluationScore(rawScore, profile);
};

export const resolvePullDirectionEvaluationDecision = (
  score: number,
  profile: PullDirectionEvaluationScoreProfile = DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE,
): PullDirectionEvaluationDecision => {
  if (score >= profile.thresholds.recommended) {
    return "recommended";
  }

  if (score >= profile.thresholds.usable) {
    return "usable";
  }

  if (score >= profile.thresholds.weak) {
    return "weak";
  }

  return "rejected";
};

