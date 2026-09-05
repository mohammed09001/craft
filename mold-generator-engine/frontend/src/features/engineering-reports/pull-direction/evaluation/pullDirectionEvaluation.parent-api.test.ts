import { describe, expect, it } from "vitest";

import {
  createPullDirectionEvaluationBundle,
  evaluatePullDirectionForEngineeringReport,
  type PullDirectionEvaluationBundle,
  type PullDirectionEvaluationFacadeResult,
} from "../index";

describe("pull direction parent public API", () => {
  it("exports the evaluation bundle builder from the pull-direction parent API", () => {
    const bundle: PullDirectionEvaluationBundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [
        {
          id: "candidate-parent-api",
          direction: { x: 0, y: 0, z: 12 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    expect(bundle.reportSection.status).toBe("ready");
    expect(bundle.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-parent-api",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });
    expect(bundle.snapshotValidation).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it("exports the engineering report facade from the pull-direction parent API", () => {
    const result: PullDirectionEvaluationFacadeResult =
      evaluatePullDirectionForEngineeringReport({
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

