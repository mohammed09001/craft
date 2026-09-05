import type { DraftVector3 } from "./draftAnalysis.contracts";

export const DRAFT_ANALYSIS_VECTOR_EPSILON = 1e-9;

export interface DraftNormalizedVectorResult {
  readonly vector: DraftVector3 | null;
  readonly length: number;
}

export const getDraftVectorLength = (vector: DraftVector3): number =>
  Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);

export const normalizeDraftVector = (
  vector: DraftVector3,
): DraftNormalizedVectorResult => {
  const length = getDraftVectorLength(vector);

  if (length <= DRAFT_ANALYSIS_VECTOR_EPSILON) {
    return {
      vector: null,
      length,
    };
  }

  return {
    vector: {
      x: vector.x / length,
      y: vector.y / length,
      z: vector.z / length,
    },
    length,
  };
};

export const dotDraftVectors = (
  first: DraftVector3,
  second: DraftVector3,
): number => first.x * second.x + first.y * second.y + first.z * second.z;

export const clampDraftCosine = (value: number): number => {
  if (value < -1) {
    return -1;
  }

  if (value > 1) {
    return 1;
  }

  return value;
};

export const radiansToDraftDegrees = (radians: number): number =>
  radians * (180 / Math.PI);

export interface DraftNormalPullAngleResult {
  readonly angleDegrees: number | null;
  readonly normalLength: number;
  readonly pullDirectionLength: number;
}

/**
 * Computes the angle between a face normal and the pull direction.
 *
 * Result range:
 * - 0 degrees: normal points with pull direction.
 * - 90 degrees: normal is perpendicular to pull direction.
 * - 180 degrees: normal points opposite pull direction.
 */
export const computeNormalPullAngleDegrees = (
  normal: DraftVector3,
  pullDirection: DraftVector3,
): DraftNormalPullAngleResult => {
  const normalizedNormal = normalizeDraftVector(normal);
  const normalizedPullDirection = normalizeDraftVector(pullDirection);

  if (
    normalizedNormal.vector === null ||
    normalizedPullDirection.vector === null
  ) {
    return {
      angleDegrees: null,
      normalLength: normalizedNormal.length,
      pullDirectionLength: normalizedPullDirection.length,
    };
  }

  const cosine = clampDraftCosine(
    dotDraftVectors(normalizedNormal.vector, normalizedPullDirection.vector),
  );

  return {
    angleDegrees: radiansToDraftDegrees(Math.acos(cosine)),
    normalLength: normalizedNormal.length,
    pullDirectionLength: normalizedPullDirection.length,
  };
};

/**
 * Computes a signed draft-angle foundation from a face normal and pull direction.
 *
 * Interpretation:
 * - Around 0 degrees: side wall / neutral draft baseline.
 * - Positive values: normal leans toward the pull direction.
 * - Negative values: normal leans away from the pull direction.
 *
 * This is still an internal algorithm primitive.
 * User-facing decisions are not created in Stage 8B-A.
 */
export const computeSignedDraftAngleDegrees = (
  normal: DraftVector3,
  pullDirection: DraftVector3,
): DraftNormalPullAngleResult => {
  const angleResult = computeNormalPullAngleDegrees(normal, pullDirection);

  if (angleResult.angleDegrees === null) {
    return angleResult;
  }

  return {
    ...angleResult,
    angleDegrees: 90 - angleResult.angleDegrees,
  };
};
