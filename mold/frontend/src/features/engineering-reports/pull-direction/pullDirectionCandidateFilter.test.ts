import { describe, expect, it } from "vitest";
import {
  createCanonicalAxisSeedCandidateGenerator,
  createPullDirectionCandidateValidator,
  createValidationStatusCandidateFilter,
  type PullDirectionCandidateDirection,
} from "./index";

const createTestCandidate = (
  id: string,
  label: string,
  vector: { readonly x: number; readonly y: number; readonly z: number },
): PullDirectionCandidateDirection => ({
  id,
  label,
  vector,
  source: "canonical-axis-seed",
  strategy: "canonical-axis-seed",
  coordinateSystem: "model-space",
  requiresGeometryInspection: false,
  score: null,
  rank: null,
});

describe("Pull Direction Candidate Filter", () => {
  it("includes valid canonical candidates without scoring or ranking", () => {
    const generator = createCanonicalAxisSeedCandidateGenerator();
    const validator = createPullDirectionCandidateValidator();
    const filter = createValidationStatusCandidateFilter();

    const generation = generator.generate({
      strategy: "canonical-axis-seed",
      model: {
        modelId: "filter-valid-candidates-model",
      },
    });

    const validation = validator.validate({
      candidates: generation.candidates,
    });

    const result = filter.filter({
      validation,
      strategy: "validation-status-filter",
    });

    expect(result.strategy).toBe("validation-status-filter");
    expect(result.candidates).toHaveLength(6);
    expect(result.includedCandidates).toHaveLength(6);
    expect(result.excludedCandidates).toHaveLength(0);

    expect(
      result.includedCandidates.every((candidate) => candidate.includedForFutureScoring === true),
    ).toBe(true);

    expect(
      result.includedCandidates.every(
        (candidate) => candidate.reasonCode === "valid-candidate-included",
      ),
    ).toBe(true);

    expect(result.inspectedMesh).toBe(false);
    expect(result.inspectedFaceNormals).toBe(false);
    expect(result.computedScores).toBe(false);
    expect(result.rankedCandidates).toBe(false);
    expect(result.selectedBestDirection).toBe(false);

    expect(
      result.includedCandidates.every(
        (candidate) => candidate.validatedCandidate.candidate.score === null,
      ),
    ).toBe(true);

    expect(
      result.includedCandidates.every(
        (candidate) => candidate.validatedCandidate.candidate.rank === null,
      ),
    ).toBe(true);
  });

  it("excludes invalid zero-length candidates before future scoring", () => {
    const validator = createPullDirectionCandidateValidator();
    const filter = createValidationStatusCandidateFilter();

    const validation = validator.validate({
      candidates: [createTestCandidate("zero-vector", "Zero", { x: 0, y: 0, z: 0 })],
    });

    const result = filter.filter({
      validation,
      strategy: "validation-status-filter",
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.includedCandidates).toHaveLength(0);
    expect(result.excludedCandidates).toHaveLength(1);

    expect(result.excludedCandidates[0]?.includedForFutureScoring).toBe(false);
    expect(result.excludedCandidates[0]?.reasonCode).toBe("invalid-candidate-excluded");
    expect(result.excludedCandidates[0]?.validatedCandidate.status).toBe("invalid");
    expect(result.excludedCandidates[0]?.validatedCandidate.excludedFromFutureScoring).toBe(true);
    expect(result.excludedCandidates[0]?.validatedCandidate.candidate.score).toBeNull();
    expect(result.excludedCandidates[0]?.validatedCandidate.candidate.rank).toBeNull();

    expect(result.computedScores).toBe(false);
    expect(result.rankedCandidates).toBe(false);
    expect(result.selectedBestDirection).toBe(false);
  });

  it("separates mixed valid and invalid candidates", () => {
    const validator = createPullDirectionCandidateValidator();
    const filter = createValidationStatusCandidateFilter();

    const validation = validator.validate({
      candidates: [
        createTestCandidate("positive-x", "+X", { x: 1, y: 0, z: 0 }),
        createTestCandidate("zero-vector", "Zero", { x: 0, y: 0, z: 0 }),
        createTestCandidate("positive-x-duplicate", "+X duplicate", { x: 2, y: 0, z: 0 }),
      ],
    });

    const result = filter.filter({
      validation,
      strategy: "validation-status-filter",
    });

    expect(validation.validCandidates).toHaveLength(1);
    expect(validation.invalidCandidates).toHaveLength(2);

    expect(result.candidates).toHaveLength(3);
    expect(result.includedCandidates).toHaveLength(1);
    expect(result.excludedCandidates).toHaveLength(2);

    expect(result.includedCandidates[0]?.validatedCandidate.candidate.id).toBe("positive-x");

    expect(result.excludedCandidates.map((candidate) => candidate.validatedCandidate.candidate.id)).toEqual([
      "zero-vector",
      "positive-x-duplicate",
    ]);

    expect(
      result.excludedCandidates.every((candidate) => candidate.includedForFutureScoring === false),
    ).toBe(true);
  });

  it("does not inspect geometry payloads during filtering", () => {
    const generator = createCanonicalAxisSeedCandidateGenerator();
    const validator = createPullDirectionCandidateValidator();
    const filter = createValidationStatusCandidateFilter();

    const generation = generator.generate({
      strategy: "canonical-axis-seed",
      model: {
        modelId: "filter-geometry-ignored-model",
        geometry: {
          shouldRemainIgnored: true,
        },
      },
    });

    const validation = validator.validate({
      candidates: generation.candidates,
    });

    const result = filter.filter({
      validation,
      strategy: "validation-status-filter",
    });

    expect(result.inspectedMesh).toBe(false);
    expect(result.inspectedFaceNormals).toBe(false);
    expect(result.computedScores).toBe(false);
    expect(result.rankedCandidates).toBe(false);
    expect(result.selectedBestDirection).toBe(false);
  });
});
