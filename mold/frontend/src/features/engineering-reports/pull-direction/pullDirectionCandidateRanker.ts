import {
  type PullDirectionCandidateRanker,
  type PullDirectionCandidateRankingResult,
  type PullDirectionFilteredCandidate,
  type PullDirectionRankedCandidate,
} from "./pullDirectionAnalysisEngine.contracts";

const createRankedCandidate = (
  filteredCandidate: PullDirectionFilteredCandidate,
  index: number,
): PullDirectionRankedCandidate => ({
  filteredCandidate,
  rank: index + 1,
  score: null,
  reasonCode: "included-candidate-ranked",
  message: "Candidate receives a placeholder rank while preserving filtered order.",
  selectedAsBestDirection: false,
});

const createUnrankedCandidate = (
  filteredCandidate: PullDirectionFilteredCandidate,
): PullDirectionRankedCandidate => ({
  filteredCandidate,
  rank: null,
  score: null,
  reasonCode: "excluded-candidate-not-ranked",
  message: "Excluded candidate is not ranked.",
  selectedAsBestDirection: false,
});

export const createPreserveFilteredOrderCandidateRanker = (): PullDirectionCandidateRanker => ({
  rank: ({ filtering, strategy }): PullDirectionCandidateRankingResult => {
    const rankedCandidates = filtering.includedCandidates.map(createRankedCandidate);
    const unrankedCandidates = filtering.excludedCandidates.map(createUnrankedCandidate);

    return {
      strategy,
      candidates: [...rankedCandidates, ...unrankedCandidates],
      rankedCandidates,
      unrankedCandidates,
      preservesInputOrder: true,
      usesRealScoring: false,
      inspectedMesh: false,
      inspectedFaceNormals: false,
      computedScores: false,
      selectedBestDirection: false,
    };
  },
});
