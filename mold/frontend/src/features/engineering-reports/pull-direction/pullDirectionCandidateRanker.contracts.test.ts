import { describe, expect, it } from "vitest";
import {
  type PullDirectionCandidateDirection,
  type PullDirectionCandidateFilteringResult,
  type PullDirectionCandidateRanker,
  type PullDirectionCandidateRankingResult,
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

const filteredCandidate: PullDirectionFilteredCandidate = {
  validatedCandidate,
  includedForFutureScoring: true,
  reasonCode: "valid-candidate-included",
  message: "Valid candidate included for future filtering/scoring stages.",
};

const filtering: PullDirectionCandidateFilteringResult = {
  strategy: "validation-status-filter",
  candidates: [filteredCandidate],
  includedCandidates: [filteredCandidate],
  excludedCandidates: [],
  inspectedMesh: false,
  inspectedFaceNormals: false,
  computedScores: false,
  rankedCandidates: false,
  selectedBestDirection: false,
};

describe("Pull Direction Candidate Ranking Contracts", () => {
  it("allows a ranking port without real scoring or best direction selection", () => {
    const ranker: PullDirectionCandidateRanker = {
      rank: ({ filtering }): PullDirectionCandidateRankingResult => {
        const rankedCandidates = filtering.includedCandidates.map((filteredCandidate, index) => ({
          filteredCandidate,
          rank: index + 1,
          score: null,
          reasonCode: "included-candidate-ranked" as const,
          message: "Candidate receives a placeholder rank while preserving filtered order.",
          selectedAsBestDirection: false as const,
        }));

        return {
          strategy: "preserve-filtered-order",
          candidates: rankedCandidates,
          rankedCandidates,
          unrankedCandidates: [],
          preservesInputOrder: true,
          usesRealScoring: false,
          inspectedMesh: false,
          inspectedFaceNormals: false,
          computedScores: false,
          selectedBestDirection: false,
        };
      },
    };

    const result = ranker.rank({
      filtering,
      strategy: "preserve-filtered-order",
    });

    expect(result.strategy).toBe("preserve-filtered-order");
    expect(result.candidates).toHaveLength(1);
    expect(result.rankedCandidates).toHaveLength(1);
    expect(result.unrankedCandidates).toHaveLength(0);

    expect(result.preservesInputOrder).toBe(true);
    expect(result.usesRealScoring).toBe(false);
    expect(result.inspectedMesh).toBe(false);
    expect(result.inspectedFaceNormals).toBe(false);
    expect(result.computedScores).toBe(false);
    expect(result.selectedBestDirection).toBe(false);

    expect(result.rankedCandidates[0]?.rank).toBe(1);
    expect(result.rankedCandidates[0]?.score).toBeNull();
    expect(result.rankedCandidates[0]?.selectedAsBestDirection).toBe(false);
    expect(result.rankedCandidates[0]?.filteredCandidate.validatedCandidate.candidate.score).toBeNull();
    expect(result.rankedCandidates[0]?.filteredCandidate.validatedCandidate.candidate.rank).toBeNull();
  });
});
