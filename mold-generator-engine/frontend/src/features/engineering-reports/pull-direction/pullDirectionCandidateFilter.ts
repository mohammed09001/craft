import {
  type PullDirectionCandidateFilter,
  type PullDirectionCandidateFilteringResult,
  type PullDirectionFilteredCandidate,
  type PullDirectionValidatedCandidate,
} from "./pullDirectionAnalysisEngine.contracts";

const createIncludedCandidate = (
  validatedCandidate: PullDirectionValidatedCandidate,
): PullDirectionFilteredCandidate => ({
  validatedCandidate,
  includedForFutureScoring: true,
  reasonCode: "valid-candidate-included",
  message: "Valid candidate included for future filtering/scoring stages.",
});

const createExcludedCandidate = (
  validatedCandidate: PullDirectionValidatedCandidate,
): PullDirectionFilteredCandidate => ({
  validatedCandidate,
  includedForFutureScoring: false,
  reasonCode: "invalid-candidate-excluded",
  message: "Invalid candidate excluded before future scoring stages.",
});

export const createValidationStatusCandidateFilter = (): PullDirectionCandidateFilter => ({
  filter: ({ validation, strategy }): PullDirectionCandidateFilteringResult => {
    const includedCandidates: readonly PullDirectionFilteredCandidate[] =
      validation.validCandidates.map(createIncludedCandidate);

    const excludedCandidates: readonly PullDirectionFilteredCandidate[] =
      validation.invalidCandidates.map(createExcludedCandidate);

    return {
      strategy,
      candidates: [...includedCandidates, ...excludedCandidates],
      includedCandidates,
      excludedCandidates,
      inspectedMesh: false,
      inspectedFaceNormals: false,
      computedScores: false,
      rankedCandidates: false,
      selectedBestDirection: false,
    };
  },
});
