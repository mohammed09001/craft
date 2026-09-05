import { describe, expect, it } from "vitest";

import { evaluatePullDirectionCandidates } from "./pullDirectionEvaluation";
import { summarizePullDirectionEvaluation } from "./pullDirectionEvaluationSummary";

describe("pull direction evaluation summary", () => {
  it("summarizes a recommended best candidate", () => {
    const result = evaluatePullDirectionCandidates({
      candidates: [
        {
          id: "candidate-z",
          direction: { x: 0, y: 0, z: 5 },
          isValid: true,
          confidence: 1,
          sourcePriority: 1,
        },
        {
          id: "candidate-x",
          direction: { x: 1, y: 0, z: 0 },
          isValid: true,
          confidence: 0.1,
          sourcePriority: 0,
        },
      ],
    });

    const summary = summarizePullDirectionEvaluation(result);

    expect(summary.totalCandidates).toBe(2);
    expect(summary.evaluatedCandidates).toBe(2);
    expect(summary.bestCandidateId).toBe("candidate-z");
    expect(summary.bestCandidateScore).toBe(100);
    expect(summary.bestCandidateDecision).toBe("recommended");
    expect(summary.recommendedCandidates).toBe(1);
    expect(summary.usableCandidates).toBe(0);
    expect(summary.weakCandidates).toBe(1);
    expect(summary.rejectedCandidates).toBe(0);
    expect(summary.decisionCounts).toEqual({
      recommended: 1,
      usable: 0,
      weak: 1,
      rejected: 0,
    });
    expect(summary.messages).toEqual([
      {
        severity: "info",
        code: "recommended_candidate_available",
        message:
          "A recommended pull direction candidate is available for downstream engineering analysis.",
      },
    ]);
  });

  it("summarizes rejected candidates and reports warning message", () => {
    const result = evaluatePullDirectionCandidates({
      candidates: [
        {
          id: "candidate-valid",
          direction: { x: 0, y: 1, z: 0 },
          isValid: true,
          confidence: 0.7,
          sourcePriority: 0.2,
        },
        {
          id: "candidate-invalid",
          direction: { x: 0, y: 0, z: 0 },
          isValid: false,
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    const summary = summarizePullDirectionEvaluation(result);

    expect(summary.bestCandidateId).toBe("candidate-valid");
    expect(summary.bestCandidateDecision).toBe("usable");
    expect(summary.rejectedCandidates).toBe(1);
    expect(summary.decisionCounts).toEqual({
      recommended: 0,
      usable: 1,
      weak: 0,
      rejected: 1,
    });
    expect(summary.messages).toEqual([
      {
        severity: "info",
        code: "usable_candidate_available",
        message:
          "A usable pull direction candidate is available, but it is not yet classified as strongly recommended.",
      },
      {
        severity: "warning",
        code: "rejected_candidates_present",
        message:
          "One or more pull direction candidates were rejected during evaluation.",
      },
    ]);
  });

  it("reports an error when no usable candidate exists", () => {
    const result = evaluatePullDirectionCandidates({
      candidates: [
        {
          id: "candidate-invalid-a",
          direction: { x: 0, y: 0, z: 0 },
          isValid: false,
        },
        {
          id: "candidate-invalid-b",
          direction: { x: 0, y: 0, z: 0 },
          isValid: false,
        },
      ],
    });

    const summary = summarizePullDirectionEvaluation(result);

    expect(summary.bestCandidateId).toBeNull();
    expect(summary.bestCandidateScore).toBeNull();
    expect(summary.bestCandidateDecision).toBeNull();
    expect(summary.rejectedCandidates).toBe(2);
    expect(summary.messages).toEqual([
      {
        severity: "error",
        code: "no_usable_candidate",
        message:
          "No usable pull direction candidate was found. Additional geometric analysis is required.",
      },
      {
        severity: "warning",
        code: "rejected_candidates_present",
        message:
          "One or more pull direction candidates were rejected during evaluation.",
      },
    ]);
  });

  it("reports a warning when there are no candidates", () => {
    const result = evaluatePullDirectionCandidates({
      candidates: [],
    });

    const summary = summarizePullDirectionEvaluation(result);

    expect(summary).toEqual({
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

