import { describe, expect, it } from "vitest";

import { evaluatePullDirectionForEngineeringReport } from "./pullDirectionEvaluationFacade";
import { createPullDirectionEvaluationScoreProfile } from "./pullDirectionEvaluationScoring";

describe("pull direction evaluation facade", () => {
  it("evaluates ranked candidates through the public engineering report facade", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-z",
          direction: { x: 0, y: 0, z: 4 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    expect(result.reportSection.status).toBe("ready");
    expect(result.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-z",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });
    expect(result.reportSection.summary.bestCandidateId).toBe("candidate-z");
    expect(result.reportSection.messages.map((message) => message.code)).toEqual([
      "recommended_candidate_available",
    ]);
  });

  it("supports a custom score profile from the public facade", () => {
    const scoreProfile = createPullDirectionEvaluationScoreProfile({
      thresholds: {
        recommended: 95,
        usable: 80,
        weak: 50,
      },
      weights: {
        baseScore: 40,
        confidenceContribution: 40,
        sourcePriorityContribution: 20,
      },
    });

    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-custom",
          direction: { x: 10, y: 0, z: 0 },
          confidence: 1,
          sourcePriority: 0,
        },
      ],
      scoreProfile,
    });

    expect(result.reportSection.status).toBe("ready");
    expect(result.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-custom",
      score: 80,
      decision: "usable",
      normalizedDirection: { x: 1, y: 0, z: 0 },
    });
    expect(result.reportSection.summary.bestCandidateDecision).toBe("usable");
  });

  it("keeps rejected candidates visible and marks the report for review", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-valid",
          direction: { x: 0, y: 1, z: 0 },
          confidence: 0.7,
          sourcePriority: 0.4,
        },
        {
          id: "candidate-invalid",
        },
      ],
    });

    expect(result.reportSection.status).toBe("review_required");
    expect(result.reportSection.summary.rejectedCandidates).toBe(1);
    expect(
      result.reportSection.evaluations.map((evaluation) => {
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
  });

  it("returns a blocked report section when no candidates are available", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [],
    });

    expect(result.reportSection.status).toBe("blocked");
    expect(result.reportSection.bestCandidate).toBeNull();
    expect(result.reportSection.summary.bestCandidateId).toBeNull();
    expect(result.reportSection.messages).toEqual([
      {
        severity: "warning",
        code: "no_candidates",
        message: "No pull direction candidates were available for evaluation.",
      },
    ]);
  });
});

