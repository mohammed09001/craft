import { describe, expect, it } from "vitest";
import {
  type PullDirectionCandidateDirection,
  type PullDirectionCandidateFilter,
  type PullDirectionCandidateFilteringResult,
  type PullDirectionCandidateValidationResult,
  type PullDirectionFilteredCandidate,
  type PullDirectionValidatedCandidate,
} from "./index";

const candidate: PullDirectionCandidateDirection = {
  id: "candidate-positive-x",
  label: "+X",
  vector: { x: 1, y: 0, z: 0 },
  source: "canonical-axis-seed",
  strategy: "canonical-axis-seed",
  coordinateSystem: "model-space",
  requiresGeometryInspection: false,
  score: null,
  rank: null,
};

const validatedCandidate: PullDirectionValidatedCandidate = {
  candidate,
  normalizedVector: { x: 1, y: 0, z: 0 },
  magnitude: 1,
  status: "valid",
  issues: [],
  excludedFromFutureScoring: false,
};

const validation: PullDirectionCandidateValidationResult = {
  candidates: [validatedCandidate],
  validCandidates: [validatedCandidate],
  invalidCandidates: [],
  duplicateCandidateIds: [],
  normalized: true,
  inspectedMesh: false,
  inspectedFaceNormals: false,
  computedScores: false,
  rankedCandidates: false,
  selectedBestDirection: false,
};

describe("Pull Direction Candidate Filtering Contracts", () => {
  it("allows a filtering port to separate included and excluded candidates without scoring", () => {
    const filter: PullDirectionCandidateFilter = {
      filter: ({ validation }): PullDirectionCandidateFilteringResult => {
        const includedCandidates: readonly PullDirectionFilteredCandidate[] =
          validation.validCandidates.map((validatedCandidate) => ({
            validatedCandidate,
            includedForFutureScoring: true,
            reasonCode: "valid-candidate-included",
            message: "Valid candidate is allowed to continue to future filtering/scoring stages.",
          }));

        return {
          strategy: "validation-status-filter",
          candidates: includedCandidates,
          includedCandidates,
          excludedCandidates: [],
          inspectedMesh: false,
          inspectedFaceNormals: false,
          computedScores: false,
          rankedCandidates: false,
          selectedBestDirection: false,
        };
      },
    };

    const result = filter.filter({
      validation,
      strategy: "validation-status-filter",
    });

    expect(result.strategy).toBe("validation-status-filter");
    expect(result.candidates).toHaveLength(1);
    expect(result.includedCandidates).toHaveLength(1);
    expect(result.excludedCandidates).toHaveLength(0);

    expect(result.inspectedMesh).toBe(false);
    expect(result.inspectedFaceNormals).toBe(false);
    expect(result.computedScores).toBe(false);
    expect(result.rankedCandidates).toBe(false);
    expect(result.selectedBestDirection).toBe(false);

    expect(result.includedCandidates[0]?.validatedCandidate.candidate.score).toBeNull();
    expect(result.includedCandidates[0]?.validatedCandidate.candidate.rank).toBeNull();
  });
});
