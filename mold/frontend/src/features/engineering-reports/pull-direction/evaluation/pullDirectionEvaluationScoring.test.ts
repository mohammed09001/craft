import { describe, expect, it } from "vitest";

import {
  calculatePullDirectionEvaluationScore,
  clampPullDirectionEvaluationScore,
  createPullDirectionEvaluationScoreProfile,
  DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE,
  resolvePullDirectionEvaluationDecision,
  roundPullDirectionEvaluationScore,
} from "./pullDirectionEvaluationScoring";
import { evaluatePullDirectionCandidate } from "./pullDirectionEvaluation";

describe("pull direction evaluation scoring", () => {
  it("keeps the default scoring profile stable", () => {
    expect(DEFAULT_PULL_DIRECTION_EVALUATION_SCORE_PROFILE).toEqual({
      minScore: 0,
      maxScore: 100,
      minVectorLength: 1e-9,
      defaultConfidence: 0.5,
      precisionDecimals: 2,
      thresholds: {
        recommended: 85,
        usable: 65,
        weak: 35,
      },
      weights: {
        baseScore: 55,
        confidenceContribution: 35,
        sourcePriorityContribution: 10,
      },
    });
  });

  it("calculates scores using the default profile", () => {
    expect(calculatePullDirectionEvaluationScore(1, 1)).toBe(100);
    expect(calculatePullDirectionEvaluationScore(0.7, 0.4)).toBe(83.5);
    expect(calculatePullDirectionEvaluationScore(0.2, 0)).toBe(62);
  });

  it("clamps and rounds scores safely", () => {
    expect(clampPullDirectionEvaluationScore(120)).toBe(100);
    expect(clampPullDirectionEvaluationScore(-10)).toBe(0);
    expect(roundPullDirectionEvaluationScore(83.456)).toBe(83.46);
  });

  it("resolves decisions from configurable thresholds", () => {
    expect(resolvePullDirectionEvaluationDecision(90)).toBe("recommended");
    expect(resolvePullDirectionEvaluationDecision(70)).toBe("usable");
    expect(resolvePullDirectionEvaluationDecision(40)).toBe("weak");
    expect(resolvePullDirectionEvaluationDecision(20)).toBe("rejected");
  });

  it("allows a custom score profile without changing the evaluator contract", () => {
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

    const evaluation = evaluatePullDirectionCandidate(
      {
        id: "custom-profile-candidate",
        direction: { x: 0, y: 0, z: 2 },
        isValid: true,
        confidence: 1,
        sourcePriority: 0,
      },
      { scoreProfile },
    );

    expect(evaluation.score).toBe(80);
    expect(evaluation.decision).toBe("usable");
    expect(evaluation.normalizedDirection).toEqual({ x: 0, y: 0, z: 1 });
  });
});

