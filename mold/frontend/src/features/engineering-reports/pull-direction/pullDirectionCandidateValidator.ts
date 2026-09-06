import {
  type PullDirectionAnalysisVector3,
  type PullDirectionCandidateDirection,
  type PullDirectionCandidateValidationIssue,
  type PullDirectionCandidateValidationResult,
  type PullDirectionCandidateValidator,
  type PullDirectionValidatedCandidate,
} from "./pullDirectionAnalysisEngine.contracts";

const VECTOR_EPSILON = 1e-9;
const VECTOR_KEY_PRECISION = 6;

const isFiniteVector = (vector: PullDirectionAnalysisVector3): boolean =>
  Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);

const getVectorMagnitude = (vector: PullDirectionAnalysisVector3): number =>
  Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);

const normalizeVector = (
  vector: PullDirectionAnalysisVector3,
  magnitude: number,
): PullDirectionAnalysisVector3 => ({
  x: vector.x / magnitude,
  y: vector.y / magnitude,
  z: vector.z / magnitude,
});

const createNormalizedVectorKey = (vector: PullDirectionAnalysisVector3): string =>
  [
    vector.x.toFixed(VECTOR_KEY_PRECISION),
    vector.y.toFixed(VECTOR_KEY_PRECISION),
    vector.z.toFixed(VECTOR_KEY_PRECISION),
  ].join(":");

const createValidationIssue = (
  code: PullDirectionCandidateValidationIssue["code"],
  message: string,
): PullDirectionCandidateValidationIssue => ({
  code,
  message,
  severity: "error",
});

const validateCandidate = (
  candidate: PullDirectionCandidateDirection,
  seenDirections: Map<string, string>,
): PullDirectionValidatedCandidate => {
  const issues: PullDirectionCandidateValidationIssue[] = [];

  if (!isFiniteVector(candidate.vector)) {
    issues.push(
      createValidationIssue(
        "non-finite-vector-component",
        "Candidate vector contains a non-finite component.",
      ),
    );
  }

  const magnitude = isFiniteVector(candidate.vector) ? getVectorMagnitude(candidate.vector) : 0;

  if (magnitude <= VECTOR_EPSILON) {
    issues.push(
      createValidationIssue(
        "zero-length-vector",
        "Candidate vector magnitude is zero or too small.",
      ),
    );
  }

  const normalizedVector = issues.length === 0 ? normalizeVector(candidate.vector, magnitude) : null;

  if (normalizedVector !== null) {
    const directionKey = createNormalizedVectorKey(normalizedVector);
    const existingCandidateId = seenDirections.get(directionKey);

    if (existingCandidateId !== undefined) {
      issues.push(
        createValidationIssue(
          "duplicate-direction",
          `Candidate direction duplicates ${existingCandidateId}.`,
        ),
      );
    } else {
      seenDirections.set(directionKey, candidate.id);
    }
  }

  const status = issues.length === 0 ? "valid" : "invalid";

  return {
    candidate,
    normalizedVector,
    magnitude,
    status,
    issues,
    excludedFromFutureScoring: status === "invalid",
  };
};

export const createPullDirectionCandidateValidator = (): PullDirectionCandidateValidator => ({
  validate: ({ candidates }): PullDirectionCandidateValidationResult => {
    const seenDirections = new Map<string, string>();
    const validatedCandidates = candidates.map((candidate) =>
      validateCandidate(candidate, seenDirections),
    );

    const validCandidates = validatedCandidates.filter(
      (candidate) => candidate.status === "valid",
    );
    const invalidCandidates = validatedCandidates.filter(
      (candidate) => candidate.status === "invalid",
    );

    const duplicateCandidateIds = invalidCandidates
      .filter((candidate) =>
        candidate.issues.some((issue) => issue.code === "duplicate-direction"),
      )
      .map((candidate) => candidate.candidate.id);

    return {
      candidates: validatedCandidates,
      validCandidates,
      invalidCandidates,
      duplicateCandidateIds,
      normalized: true,
      inspectedMesh: false,
      inspectedFaceNormals: false,
      computedScores: false,
      rankedCandidates: false,
      selectedBestDirection: false,
    };
  },
});
