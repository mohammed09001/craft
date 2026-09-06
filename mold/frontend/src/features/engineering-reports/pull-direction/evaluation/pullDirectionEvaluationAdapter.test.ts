import { describe, expect, it } from "vitest";

import { createPullDirectionEvaluationInput } from "./pullDirectionEvaluationAdapter";
import { evaluatePullDirectionCandidates } from "./pullDirectionEvaluation";

describe("pull direction evaluation adapter", () => {
  it("converts ranked candidates into evaluation input", () => {
    const input = createPullDirectionEvaluationInput({
      rankedCandidates: [
        {
          id: "candidate-x",
          direction: { x: 1, y: 0, z: 0 },
          isValid: true,
          confidence: 0.9,
          sourcePriority: 0.8,
        },
      ],
    });

    expect(input).toEqual({
      candidates: [
        {
          id: "candidate-x",
          direction: { x: 1, y: 0, z: 0 },
          isValid: true,
          confidence: 0.9,
          sourcePriority: 0.8,
        },
      ],
    });
  });

  it("supports candidateId, vector, score, and rank fallback fields", () => {
    const input = createPullDirectionEvaluationInput({
      rankedCandidates: [
        {
          candidateId: "candidate-y",
          vector: { x: 0, y: 2, z: 0 },
          valid: true,
          score: 75,
          rank: 2,
        },
      ],
    });

    expect(input.candidates).toEqual([
      {
        id: "candidate-y",
        direction: { x: 0, y: 2, z: 0 },
        isValid: true,
        confidence: 0.75,
        sourcePriority: 0.5,
      },
    ]);
  });

  it("supports pullDirection as a direction fallback", () => {
    const input = createPullDirectionEvaluationInput({
      rankedCandidates: [
        {
          id: "candidate-z",
          pullDirection: { x: 0, y: 0, z: 3 },
          confidence: 1,
        },
      ],
    });

    expect(input.candidates[0]).toEqual({
      id: "candidate-z",
      direction: { x: 0, y: 0, z: 3 },
      isValid: true,
      confidence: 1,
      sourcePriority: 1,
    });
  });

  it("creates deterministic fallback ids when candidate ids are missing", () => {
    const input = createPullDirectionEvaluationInput({
      rankedCandidates: [
        {
          direction: { x: 1, y: 0, z: 0 },
        },
        {
          direction: { x: 0, y: 1, z: 0 },
        },
      ],
    });

    expect(input.candidates.map((candidate) => candidate.id)).toEqual([
      "ranked-candidate-1",
      "ranked-candidate-2",
    ]);
  });

  it("marks candidates invalid when direction is missing or incomplete", () => {
    const input = createPullDirectionEvaluationInput({
      rankedCandidates: [
        {
          id: "missing-direction",
        },
        {
          id: "incomplete-direction",
          direction: { x: 1, y: 0 },
        },
      ],
    });

    expect(input.candidates).toEqual([
      {
        id: "missing-direction",
        direction: { x: 0, y: 0, z: 0 },
        isValid: false,
        confidence: 0.5,
        sourcePriority: 1,
      },
      {
        id: "incomplete-direction",
        direction: { x: 0, y: 0, z: 0 },
        isValid: false,
        confidence: 0.5,
        sourcePriority: 0,
      },
    ]);
  });

  it("can feed the pull direction evaluation core safely", () => {
    const input = createPullDirectionEvaluationInput({
      rankedCandidates: [
        {
          id: "candidate-good",
          direction: { x: 0, y: 0, z: 10 },
          confidence: 1,
          sourcePriority: 1,
        },
        {
          id: "candidate-bad",
        },
      ],
    });

    const result = evaluatePullDirectionCandidates(input);

    expect(result.bestCandidateId).toBe("candidate-good");
    expect(result.recommendedCandidateIds).toEqual(["candidate-good"]);
    expect(result.evaluations.map((evaluation) => evaluation.candidateId)).toEqual([
      "candidate-good",
      "candidate-bad",
    ]);
  });
});

