import { describe, expect, it } from "vitest";
import {
  createCanonicalAxisSeedCandidateGenerator,
  createPullDirectionCandidateValidator,
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

describe("Pull Direction Candidate Validator", () => {
  it("validates and normalizes canonical seed candidates without geometry inspection", () => {
    const generator = createCanonicalAxisSeedCandidateGenerator();
    const validator = createPullDirectionCandidateValidator();

    const generated = generator.generate({
      strategy: "canonical-axis-seed",
      model: {
        modelId: "model-001",
      },
    });

    const result = validator.validate({
      candidates: generated.candidates,
    });

    expect(result.normalized).toBe(true);
    expect(result.candidates).toHaveLength(6);
    expect(result.validCandidates).toHaveLength(6);
    expect(result.invalidCandidates).toHaveLength(0);
    expect(result.duplicateCandidateIds).toEqual([]);

    expect(result.inspectedMesh).toBe(false);
    expect(result.inspectedFaceNormals).toBe(false);
    expect(result.computedScores).toBe(false);
    expect(result.rankedCandidates).toBe(false);
    expect(result.selectedBestDirection).toBe(false);

    expect(
      result.validCandidates.every((candidate) => candidate.normalizedVector !== null),
    ).toBe(true);

    expect(result.validCandidates.every((candidate) => candidate.status === "valid")).toBe(true);

    expect(
      result.validCandidates.every((candidate) => candidate.excludedFromFutureScoring === false),
    ).toBe(true);
  });

  it("marks zero-length vectors as invalid", () => {
    const validator = createPullDirectionCandidateValidator();

    const result = validator.validate({
      candidates: [createTestCandidate("zero-vector", "Zero", { x: 0, y: 0, z: 0 })],
    });

    expect(result.validCandidates).toHaveLength(0);
    expect(result.invalidCandidates).toHaveLength(1);
    expect(result.invalidCandidates[0]?.status).toBe("invalid");
    expect(result.invalidCandidates[0]?.normalizedVector).toBeNull();
    expect(result.invalidCandidates[0]?.excludedFromFutureScoring).toBe(true);
    expect(result.invalidCandidates[0]?.issues[0]?.code).toBe("zero-length-vector");
  });

  it("marks non-finite vectors as invalid", () => {
    const validator = createPullDirectionCandidateValidator();

    const result = validator.validate({
      candidates: [
        createTestCandidate("nan-vector", "NaN", { x: Number.NaN, y: 0, z: 0 }),
        createTestCandidate("infinite-vector", "Infinite", {
          x: Number.POSITIVE_INFINITY,
          y: 0,
          z: 0,
        }),
      ],
    });

    expect(result.validCandidates).toHaveLength(0);
    expect(result.invalidCandidates).toHaveLength(2);
    expect(result.invalidCandidates[0]?.issues[0]?.code).toBe("non-finite-vector-component");
    expect(result.invalidCandidates[1]?.issues[0]?.code).toBe("non-finite-vector-component");
  });

  it("detects duplicate normalized directions", () => {
    const validator = createPullDirectionCandidateValidator();

    const result = validator.validate({
      candidates: [
        createTestCandidate("positive-x-a", "+X A", { x: 1, y: 0, z: 0 }),
        createTestCandidate("positive-x-b", "+X B", { x: 2, y: 0, z: 0 }),
      ],
    });

    expect(result.validCandidates).toHaveLength(1);
    expect(result.invalidCandidates).toHaveLength(1);
    expect(result.duplicateCandidateIds).toEqual(["positive-x-b"]);
    expect(result.invalidCandidates[0]?.issues[0]?.code).toBe("duplicate-direction");
  });

  it("keeps opposite directions valid because they are not duplicates", () => {
    const validator = createPullDirectionCandidateValidator();

    const result = validator.validate({
      candidates: [
        createTestCandidate("positive-x", "+X", { x: 1, y: 0, z: 0 }),
        createTestCandidate("negative-x", "-X", { x: -1, y: 0, z: 0 }),
      ],
    });

    expect(result.validCandidates).toHaveLength(2);
    expect(result.invalidCandidates).toHaveLength(0);
    expect(result.duplicateCandidateIds).toEqual([]);
  });
});
