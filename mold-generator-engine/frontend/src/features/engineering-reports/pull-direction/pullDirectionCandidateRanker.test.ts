import { describe, expect, it } from "vitest";
import {
  createCanonicalAxisSeedCandidateGenerator,
  createPullDirectionCandidateValidator,
  createValidationStatusCandidateFilter,
} from "./index";
import { createPreserveFilteredOrderCandidateRanker } from "./pullDirectionCandidateRanker";

describe("Pull Direction Candidate Ranker Foundation", () => {
  it("assigns placeholder ranks while preserving filtered order without real scoring", () => {
    const generator = createCanonicalAxisSeedCandidateGenerator();
    const validator = createPullDirectionCandidateValidator();
    const filter = createValidationStatusCandidateFilter();
    const ranker = createPreserveFilteredOrderCandidateRanker();

    const generation = generator.generate({
      strategy: "canonical-axis-seed",
      model: {
        modelId: "ranking-foundation-small-test-model",
      },
    });

    const validation = validator.validate({
      candidates: generation.candidates,
    });

    const filtering = filter.filter({
      validation,
      strategy: "validation-status-filter",
    });

    const ranking = ranker.rank({
      filtering,
      strategy: "preserve-filtered-order",
    });

    expect(ranking.strategy).toBe("preserve-filtered-order");
    expect(ranking.rankedCandidates).toHaveLength(6);
    expect(ranking.unrankedCandidates).toHaveLength(0);

    expect(ranking.rankedCandidates.map((candidate) => candidate.rank)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
    ]);

    expect(ranking.preservesInputOrder).toBe(true);
    expect(ranking.usesRealScoring).toBe(false);
    expect(ranking.computedScores).toBe(false);
    expect(ranking.selectedBestDirection).toBe(false);

    expect(ranking.rankedCandidates.every((candidate) => candidate.score === null)).toBe(true);

    expect(
      ranking.rankedCandidates.every(
        (candidate) => candidate.selectedAsBestDirection === false,
      ),
    ).toBe(true);
  });
});
