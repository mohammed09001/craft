import type {
  PullDirectionEvaluationCandidate,
  PullDirectionEvaluationInput,
  PullDirectionVector3,
} from "./pullDirectionEvaluation.types";

export interface PullDirectionRankedCandidateLike {
  readonly id?: string;
  readonly candidateId?: string;
  readonly direction?: Partial<PullDirectionVector3> | null;
  readonly vector?: Partial<PullDirectionVector3> | null;
  readonly pullDirection?: Partial<PullDirectionVector3> | null;
  readonly isValid?: boolean;
  readonly valid?: boolean;
  readonly confidence?: number;
  readonly score?: number;
  readonly rank?: number;
  readonly sourcePriority?: number;
}

export interface PullDirectionEvaluationAdapterInput {
  readonly rankedCandidates: readonly PullDirectionRankedCandidateLike[];
}

const DEFAULT_CONFIDENCE = 0.5;

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const readVectorComponent = (value: unknown): number | null => {
  if (!isFiniteNumber(value)) {
    return null;
  }

  return value;
};

const readDirection = (
  candidate: PullDirectionRankedCandidateLike,
): PullDirectionVector3 | null => {
  const rawDirection =
    candidate.direction ?? candidate.vector ?? candidate.pullDirection ?? null;

  if (rawDirection === null) {
    return null;
  }

  const x = readVectorComponent(rawDirection.x);
  const y = readVectorComponent(rawDirection.y);
  const z = readVectorComponent(rawDirection.z);

  if (x === null || y === null || z === null) {
    return null;
  }

  return { x, y, z };
};

const readCandidateId = (
  candidate: PullDirectionRankedCandidateLike,
  index: number,
): string => {
  const rawId = candidate.id ?? candidate.candidateId;

  if (typeof rawId === "string" && rawId.trim().length > 0) {
    return rawId.trim();
  }

  return `ranked-candidate-${index + 1}`;
};

const readValidity = (candidate: PullDirectionRankedCandidateLike): boolean => {
  if (candidate.isValid !== undefined) {
    return candidate.isValid;
  }

  if (candidate.valid !== undefined) {
    return candidate.valid;
  }

  return true;
};

const readConfidence = (
  candidate: PullDirectionRankedCandidateLike,
): number => {
  if (isFiniteNumber(candidate.confidence)) {
    return candidate.confidence;
  }

  if (isFiniteNumber(candidate.score)) {
    return candidate.score > 1 ? candidate.score / 100 : candidate.score;
  }

  return DEFAULT_CONFIDENCE;
};

const readSourcePriority = (
  candidate: PullDirectionRankedCandidateLike,
  index: number,
  totalCount: number,
): number => {
  if (isFiniteNumber(candidate.sourcePriority)) {
    return candidate.sourcePriority;
  }

  if (isFiniteNumber(candidate.rank) && candidate.rank > 0) {
    return 1 / candidate.rank;
  }

  if (totalCount <= 1) {
    return 1;
  }

  return 1 - index / Math.max(1, totalCount - 1);
};

export const createPullDirectionEvaluationInput = (
  input: PullDirectionEvaluationAdapterInput,
): PullDirectionEvaluationInput => {
  const totalCount = input.rankedCandidates.length;

  const candidates: PullDirectionEvaluationCandidate[] = input.rankedCandidates.map(
    (candidate, index) => {
      const direction = readDirection(candidate);

      return {
        id: readCandidateId(candidate, index),
        direction: direction ?? { x: 0, y: 0, z: 0 },
        isValid: direction !== null && readValidity(candidate),
        confidence: readConfidence(candidate),
        sourcePriority: readSourcePriority(candidate, index, totalCount),
      };
    },
  );

  return { candidates };
};

