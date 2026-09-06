import { describe, expect, it } from "vitest";

import { runPullDirectionEvaluationPipeline } from "./pullDirectionEvaluationPipeline";

describe("pull direction evaluation pipeline", () => {
  it("runs adapter, evaluator, and summary in one stable pipeline", () => {
    const result = runPullDirectionEvaluationPipeline({
      rankedCandidates: [
        {
          id: "candidate-z",
          direction: { x: 0, y: 0, z: 10 },
          confidence: 1,
          sourcePriority: 1,
        },
        {
          id: "candidate-x",
          direction: { x: 1, y: 0, z: 0 },
          confidence: 0.2,
          sourcePriority: 0,
        },
      ],
    });

    expect(result.evaluationInput.candidates).toEqual([
      {
        id: "candidate-z",
        direction: { x: 0, y: 0, z: 10 },
        isValid: true,
        confidence: 1,
        sourcePriority: 1,
      },
      {
        id: "candidate-x",
        direction: { x: 1, y: 0, z: 0 },
        isValid: true,
        confidence: 0.2,
        sourcePriority: 0,
      },
    ]);

    expect(result.evaluationResult.bestCandidateId).toBe("candidate-z");
    expect(result.evaluationResult.recommendedCandidateIds).toEqual([
      "candidate-z",
    ]);

    expect(result.summary).toMatchObject({
      totalCandidates: 2,
      evaluatedCandidates: 2,
      recommendedCandidates: 1,
      bestCandidateId: "candidate-z",
      bestCandidateScore: 100,
      bestCandidateDecision: "recommended",
    });
  });

  it("keeps invalid ranked candidates visible in the final evaluation result", () => {
    const result = runPullDirectionEvaluationPipeline({
      rankedCandidates: [
        {
          id: "candidate-valid",
          direction: { x: 0, y: 1, z: 0 },
          confidence: 0.7,
          sourcePriority: 0.5,
        },
        {
          id: "candidate-invalid",
        },
      ],
    });

    expect(
      result.evaluationResult.evaluations.map((evaluation) => {
        return {
          candidateId: evaluation.candidateId,
          decision: evaluation.decision,
        };
      }),
    ).toEqual([
      {
        candidateId: "candidate-valid",
        decision: "usable",
      },
      {
        candidateId: "candidate-invalid",
        decision: "rejected",
      },
    ]);

    expect(result.summary).toMatchObject({
      totalCandidates: 2,
      rejectedCandidates: 1,
      bestCandidateId: "candidate-valid",
      bestCandidateDecision: "usable",
    });

    expect(result.summary.messages.map((message) => message.code)).toEqual([
      "usable_candidate_available",
      "rejected_candidates_present",
    ]);
  });

  it("returns a safe empty result when no ranked candidates exist", () => {
    const result = runPullDirectionEvaluationPipeline({
      rankedCandidates: [],
    });

    expect(result.evaluationInput).toEqual({
      candidates: [],
    });

    expect(result.evaluationResult).toEqual({
      evaluations: [],
      bestCandidateId: null,
      recommendedCandidateIds: [],
    });

    expect(result.summary).toEqual({
      totalCandidates: 0,
      evaluatedCandidates: 0,
      recommendedCandidates: 0,
      usableCandidates: 0,
      weakCandidates: 0,
      rejectedCandidates: 0,
      bestCandidateId: null,
      bestCandidateScore: null,
      bestCandidateDecision: null,
      decisionCounts: {
        recommended: 0,
        usable: 0,
        weak: 0,
        rejected: 0,
      },
      messages: [
        {
          severity: "warning",
          code: "no_candidates",
          message: "No pull direction candidates were available for evaluation.",
        },
      ],
    });
  });
});

