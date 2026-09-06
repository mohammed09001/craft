import { describe, expect, it } from "vitest";

import {
  evaluatePullDirectionCandidate,
  evaluatePullDirectionCandidates,
} from "./pullDirectionEvaluation";

describe("pull direction evaluation", () => {
  it("normalizes a valid direction and produces a recommended score", () => {
    const evaluation = evaluatePullDirectionCandidate({
      id: "candidate-z",
      direction: { x: 0, y: 0, z: 5 },
      isValid: true,
      confidence: 1,
      sourcePriority: 1,
    });

    expect(evaluation.candidateId).toBe("candidate-z");
    expect(evaluation.vectorLength).toBe(5);
    expect(evaluation.normalizedDirection).toEqual({ x: 0, y: 0, z: 1 });
    expect(evaluation.score).toBe(100);
    expect(evaluation.decision).toBe("recommended");
    expect(evaluation.reasons.map((reason) => reason.code)).toContain(
      "normalized_direction_created",
    );
  });

  it("rejects candidates that were already marked invalid", () => {
    const evaluation = evaluatePullDirectionCandidate({
      id: "candidate-invalid",
      direction: { x: 1, y: 0, z: 0 },
      isValid: false,
      confidence: 1,
      sourcePriority: 1,
    });

    expect(evaluation.score).toBe(0);
    expect(evaluation.decision).toBe("rejected");
    expect(evaluation.normalizedDirection).toBeNull();
    expect(evaluation.vectorLength).toBeNull();
    expect(evaluation.reasons).toEqual([
      {
        code: "candidate_invalid",
        message: "The candidate was marked invalid by an earlier validation stage.",
        impact: "negative",
      },
    ]);
  });

  it("rejects zero-length direction vectors", () => {
    const evaluation = evaluatePullDirectionCandidate({
      id: "candidate-zero",
      direction: { x: 0, y: 0, z: 0 },
      isValid: true,
    });

    expect(evaluation.score).toBe(0);
    expect(evaluation.decision).toBe("rejected");
    expect(evaluation.normalizedDirection).toBeNull();
    expect(evaluation.vectorLength).toBe(0);
    expect(evaluation.reasons.map((reason) => reason.code)).toContain(
      "direction_vector_zero_length",
    );
  });

  it("rejects non-finite direction vectors", () => {
    const evaluation = evaluatePullDirectionCandidate({
      id: "candidate-infinite",
      direction: { x: Number.POSITIVE_INFINITY, y: 0, z: 1 },
      isValid: true,
    });

    expect(evaluation.score).toBe(0);
    expect(evaluation.decision).toBe("rejected");
    expect(evaluation.normalizedDirection).toBeNull();
    expect(evaluation.vectorLength).toBeNull();
    expect(evaluation.reasons.map((reason) => reason.code)).toContain(
      "direction_vector_not_finite",
    );
  });

  it("sorts evaluations by score and selects the best non-rejected candidate", () => {
    const result = evaluatePullDirectionCandidates({
      candidates: [
        {
          id: "candidate-low",
          direction: { x: 1, y: 0, z: 0 },
          isValid: true,
          confidence: 0.2,
          sourcePriority: 0,
        },
        {
          id: "candidate-high",
          direction: { x: 0, y: 1, z: 0 },
          isValid: true,
          confidence: 1,
          sourcePriority: 1,
        },
        {
          id: "candidate-invalid",
          direction: { x: 0, y: 0, z: 1 },
          isValid: false,
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    expect(result.evaluations.map((evaluation) => evaluation.candidateId)).toEqual([
      "candidate-high",
      "candidate-low",
      "candidate-invalid",
    ]);
    expect(result.bestCandidateId).toBe("candidate-high");
    expect(result.recommendedCandidateIds).toEqual(["candidate-high"]);
  });

  it("uses deterministic alphabetical tie-breaking for equal scores", () => {
    const result = evaluatePullDirectionCandidates({
      candidates: [
        {
          id: "candidate-b",
          direction: { x: 1, y: 0, z: 0 },
          isValid: true,
          confidence: 0.5,
          sourcePriority: 0,
        },
        {
          id: "candidate-a",
          direction: { x: 0, y: 1, z: 0 },
          isValid: true,
          confidence: 0.5,
          sourcePriority: 0,
        },
      ],
    });

    expect(result.evaluations.map((evaluation) => evaluation.candidateId)).toEqual([
      "candidate-a",
      "candidate-b",
    ]);
  });
});

