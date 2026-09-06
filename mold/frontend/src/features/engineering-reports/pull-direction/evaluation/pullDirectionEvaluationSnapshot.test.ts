import { describe, expect, it } from "vitest";

import { evaluatePullDirectionForEngineeringReport } from "./pullDirectionEvaluationFacade";
import { createPullDirectionEvaluationReportSnapshot } from "./pullDirectionEvaluationSnapshot";

describe("pull direction evaluation snapshot", () => {
  it("creates a stable snapshot from a ready report section", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-diagonal",
          direction: { x: 3, y: 0, z: 4 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );

    expect(snapshot.status).toBe("ready");
    expect(snapshot.bestCandidate).toEqual({
      candidateId: "candidate-diagonal",
      score: 100,
      decision: "recommended",
      normalizedDirection: {
        x: 0.6,
        y: 0,
        z: 0.8,
      },
    });
    expect(snapshot.summary).toMatchObject({
      totalCandidates: 1,
      evaluatedCandidates: 1,
      recommendedCandidates: 1,
      usableCandidates: 0,
      weakCandidates: 0,
      rejectedCandidates: 0,
      bestCandidateId: "candidate-diagonal",
      bestCandidateScore: 100,
      bestCandidateDecision: "recommended",
    });
    expect(snapshot.evaluations[0]).toMatchObject({
      candidateId: "candidate-diagonal",
      originalDirection: {
        x: 3,
        y: 0,
        z: 4,
      },
      normalizedDirection: {
        x: 0.6,
        y: 0,
        z: 0.8,
      },
      vectorLength: 5,
      score: 100,
      decision: "recommended",
    });
  });

  it("keeps blocked report sections serializable", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );

    expect(snapshot).toEqual({
      status: "blocked",
      summary: {
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
      },
      bestCandidate: null,
      evaluations: [],
      messages: [
        {
          severity: "warning",
          code: "no_candidates",
          message: "No pull direction candidates were available for evaluation.",
        },
      ],
    });
  });

  it("rounds floating point values for stable report snapshots", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-float",
          direction: { x: 1, y: 1, z: 1 },
          confidence: 0.333333333333,
          sourcePriority: 0.666666666666,
        },
      ],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );

    expect(snapshot.bestCandidate?.normalizedDirection).toEqual({
      x: 0.57735,
      y: 0.57735,
      z: 0.57735,
    });
    expect(snapshot.evaluations[0]?.vectorLength).toBe(1.732051);
  });
});

